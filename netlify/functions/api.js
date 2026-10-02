"use strict";

var crypto = require("crypto");
var logic = require("./lib/logic");
var storeApi = require("./lib/store");

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

function allowedIds() {
  return String(process.env.ALLOWED_TELEGRAM_IDS || process.env.ALLOWED_CHAT_IDS || "")
    .split(",")
    .map(function (x) {
      return x.trim();
    })
    .filter(Boolean);
}

function validateTelegramInitData(initData) {
  var token = process.env.TELEGRAM_BOT_TOKEN || "";
  if (!token || !initData) return null;
  var params = new URLSearchParams(initData);
  var hash = params.get("hash");
  if (!hash) return null;
  params.delete("hash");
  var pairs = [];
  params.forEach(function (value, key) {
    pairs.push(key + "=" + value);
  });
  pairs.sort();
  var dataCheck = pairs.join("\n");
  var secret = crypto.createHmac("sha256", "WebAppData").update(token).digest();
  var check = crypto.createHmac("sha256", secret).update(dataCheck).digest("hex");
  if (check !== hash) return null;
  var userRaw = params.get("user");
  if (!userRaw) return null;
  try {
    return JSON.parse(userRaw);
  } catch (err) {
    return null;
  }
}

function isAdmin(event) {
  var auth = event.headers.authorization || event.headers.Authorization || "";
  var apiKey = process.env.VOUCHER_API_KEY || "";
  if (apiKey && auth === "Bearer " + apiKey) return true;

  var initData =
    event.headers["x-telegram-init-data"] ||
    event.headers["X-Telegram-Init-Data"] ||
    "";
  var user = validateTelegramInitData(initData);
  if (!user || !user.id) return false;
  var allowed = allowedIds();
  if (!allowed.length) return false;
  return allowed.indexOf(String(user.id)) !== -1;
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
      });
      return json(200, { voucher: unlocked });
    }

    if (!isAdmin(event)) {
      return json(401, { error: "אין הרשאת ניהול" });
    }

    if (method === "GET" && path === "/vouchers/next-code") {
      var next = await storeApi.withStore(function (store) {
        return { voucher_code: String(logic.nextCodeFromStore(store)), expiry_date: logic.todayExpiry() };
      });
      return json(200, next);
    }

    if (method === "POST" && path === "/vouchers/preview") {
      var preview = await storeApi.withStore(function (store) {
        return logic.previewVoucher(store, body);
      });
      return json(200, { voucher: preview });
    }

    if (method === "POST" && path === "/vouchers") {
      var issued = await storeApi.withStore(function (store) {
        return logic.issueVoucher(store, body);
      });
      return json(201, {
        voucher: issued,
        url: "https://shimritouch.co.il/voucher/" + issued.voucher_code,
      });
    }

    if (method === "GET" && path === "/vouchers") {
      var status = (event.queryStringParameters && event.queryStringParameters.status) || "active";
      var list = await storeApi.withStore(function (store) {
        return logic.listVouchers(store, status);
      });
      return json(200, { vouchers: list });
    }

    if (method === "POST" && /^\/vouchers\/[^/]+\/redeem$/.test(path)) {
      var redeemCode = path.split("/")[2];
      var redeemed = await storeApi.withStore(function (store) {
        return logic.redeemVoucher(store, redeemCode);
      });
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
      });
      return json(201, { created: true, package: pkg });
    }

    if (method === "GET" && path === "/packages") {
      var pStatus = (event.queryStringParameters && event.queryStringParameters.status) || "open";
      var packages = await storeApi.withStore(function (store) {
        return logic.listPackages(store, pStatus).map(function (pkg) {
          return Object.assign({}, pkg, { status: logic.packageStatus(pkg) });
        });
      });
      return json(200, { packages: packages });
    }

    if (method === "POST" && /^\/packages\/[^/]+\/treatments\/[^/]+\/redeem$/.test(path)) {
      var parts = path.split("/");
      var updated = await storeApi.withStore(function (store) {
        return logic.redeemTreatment(store, parts[2], parts[4]);
      });
      return json(200, { package: updated, status: logic.packageStatus(updated) });
    }

    return json(404, { error: "not found" });
  } catch (err) {
    return json(400, { error: err.message || "שגיאה" });
  }
};
