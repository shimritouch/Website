"use strict";

var logic = require("./lib/logic");
var storeApi = require("./lib/store");
var telegramAuth = require("./lib/telegram-auth");
var voucherImage = require("./lib/voucher-image");

var CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Telegram-Init-Data",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
};

function json(status, body) {
  return { statusCode: status, headers: CORS_HEADERS, body: JSON.stringify(body) };
}

function parseBody(event) {
  if (!event.body) return {};
  try {
    return JSON.parse(event.body);
  } catch (err) {
    return {};
  }
}

function normalizePath(event) {
  var raw = event.path || "";
  raw = raw.replace(/^\/\.netlify\/functions\/api/, "");
  raw = raw.replace(/^\/api/, "");
  if (!raw.startsWith("/")) raw = "/" + raw;
  return raw.replace(/\/+$/, "") || "/";
}

function denyAdmin(auth) {
  return json(401, {
    error: "אין הרשאת ניהול (" + auth.reason + ")",
    reason: auth.reason,
  });
}

exports.handler = async function (event) {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: CORS_HEADERS, body: "" };
  }

  var path = normalizePath(event);
  var method = event.httpMethod;
  var body = parseBody(event);

  try {
    if (method === "GET" && path === "/health") {
      return json(200, { ok: true });
    }

    if (method === "POST" && /^\/vouchers\/[^/]+\/unlock$/.test(path)) {
      var unlockCode = path.split("/")[2];
      var unlocked = await storeApi.withStore(function (store) {
        return logic.unlockVoucher(store, unlockCode, body.phone);
      }, event);
      return json(200, { voucher: unlocked });
    }

    var admin = telegramAuth.inspectAdmin(event, body);
    if (!admin.ok) {
      return denyAdmin(admin);
    }

    if (method === "POST" && path === "/vouchers/next-code") {
      var saved = await storeApi.withStore(function (store) {
        return logic.setNextCode(store, body.next_code);
      }, event);
      return json(200, saved);
    }

    if (method === "GET" && path === "/vouchers/next-code") {
      var next = await storeApi.withStore(function (store) {
        return { voucher_code: String(logic.nextCodeFromStore(store)), expiry_date: logic.todayExpiry() };
      }, event);
      return json(200, next);
    }

    if (method === "POST" && path === "/vouchers/preview") {
      var preview = await storeApi.withStore(function (store) {
        return logic.previewVoucher(store, body);
      }, event);
      return json(200, { voucher: preview });
    }

    if (method === "POST" && path === "/vouchers") {
      var issued = await storeApi.withStore(function (store) {
        return logic.issueVoucher(store, body);
      }, event);
      return json(201, {
        voucher: issued,
        url: "https://shimritouch.co.il/voucher/" + issued.voucher_code,
      });
    }

    if (method === "GET" && /^\/vouchers\/[^/]+\/image$/.test(path)) {
      var imageCode = decodeURIComponent(path.split("/")[2]);
      var png = await storeApi.withStore(function (store) {
        var voucher = store.vouchers[String(imageCode)];
        if (!voucher) {
          var missing = new Error("שובר לא נמצא");
          missing.statusCode = 404;
          throw missing;
        }
        return voucherImage.renderVoucherPng(voucher);
      }, event);
      return {
        statusCode: 200,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Content-Type": "image/png",
          "Cache-Control": "private, no-store",
        },
        isBase64Encoded: true,
        body: Buffer.from(png).toString("base64"),
      };
    }

    if (method === "GET" && path === "/vouchers") {
      var status = (event.queryStringParameters && event.queryStringParameters.status) || "active";
      var list = await storeApi.withStore(function (store) {
        return logic.listVouchers(store, status);
      }, event);
      return json(200, { vouchers: list });
    }

    if (method === "POST" && /^\/vouchers\/[^/]+\/cancel$/.test(path)) {
      var cancelCode = path.split("/")[2];
      var cancelled = await storeApi.withStore(function (store) {
        return logic.cancelVoucher(store, cancelCode);
      }, event);
      return json(200, { voucher: cancelled });
    }

    if (method === "POST" && /^\/vouchers\/[^/]+\/redeem$/.test(path)) {
      var redeemCode = path.split("/")[2];
      var redeemed = await storeApi.withStore(function (store) {
        return logic.redeemVoucher(store, redeemCode);
      }, event);
      return json(200, { voucher: redeemed });
    }

    if (method === "POST" && path === "/packages/from-receipt") {
      var parsed = logic.parseSeriesNote(body.notes || body.package_title);
      if (!parsed) return json(200, { created: false });
      var pkg = await storeApi.withStore(function (store) {
        return logic.createPackage(store, {
          client_name: body.client_name,
          phone: body.phone,
          package_title: parsed.title,
          total_treatments: parsed.total,
        });
      }, event);
      return json(201, { created: true, package: pkg });
    }

    if (method === "GET" && path === "/packages") {
      var pStatus = (event.queryStringParameters && event.queryStringParameters.status) || "open";
      var packages = await storeApi.withStore(function (store) {
        return logic.listPackages(store, pStatus).map(function (pkg) {
          return Object.assign({}, pkg, { status: logic.packageStatus(pkg) });
        });
      }, event);
      return json(200, { packages: packages });
    }

    if (method === "POST" && /^\/packages\/[^/]+\/treatments\/[^/]+\/redeem$/.test(path)) {
      var parts = path.split("/");
      var updated = await storeApi.withStore(function (store) {
        return logic.redeemTreatment(store, parts[2], parts[4]);
      }, event);
      return json(200, { package: updated, status: logic.packageStatus(updated) });
    }

    return json(404, { error: "not found" });
  } catch (err) {
    var message = (err && err.message) || "שגיאה";
    if (err && err.statusCode === 404) return json(404, { error: message });
    if (/ENOENT|Blobs|חסר מודול|MissingBlobs|connectLambda/i.test(message)) {
      return json(500, { error: "שמירת השוברים נכשלה. נסו שוב בעוד רגע." });
    }
    return json(400, { error: message });
  }
};
