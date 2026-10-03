"use strict";

var crypto = require("crypto");

function header(event, name) {
  var headers = (event && event.headers) || {};
  var want = name.toLowerCase();
  var keys = Object.keys(headers);
  for (var i = 0; i < keys.length; i += 1) {
    if (keys[i].toLowerCase() === want) return String(headers[keys[i]] || "");
  }
  return "";
}

function readInitData(event, body) {
  var fromHeader = header(event, "x-telegram-init-data");
  if (fromHeader) return fromHeader;
  var source = body || {};
  return String(source.init_data || source.initData || source.telegram_init_data || "");
}

function botToken() {
  return String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
}

function allowedIds() {
  return String(process.env.ALLOWED_TELEGRAM_IDS || process.env.ALLOWED_CHAT_IDS || "")
    .split(",")
    .map(function (x) {
      return x.trim();
    })
    .filter(Boolean);
}

function parseUser(initData) {
  var params = new URLSearchParams(initData);
  var userRaw = params.get("user");
  if (!userRaw) return null;
  try {
    return JSON.parse(userRaw);
  } catch (err) {
    return null;
  }
}

function validateInitData(initData, token) {
  if (!token || !initData) return { ok: false, reason: token ? "missing_init" : "no_token" };
  var params = new URLSearchParams(initData);
  var hash = params.get("hash");
  if (!hash) return { ok: false, reason: "bad_hash" };
  params.delete("hash");
  var pairs = [];
  params.forEach(function (value, key) {
    pairs.push(key + "=" + value);
  });
  pairs.sort();
  var dataCheck = pairs.join("\n");
  var secret = crypto.createHmac("sha256", "WebAppData").update(token).digest();
  var check = crypto.createHmac("sha256", secret).update(dataCheck).digest("hex");
  if (check !== hash) return { ok: false, reason: "bad_hash" };
  var user = parseUser(initData);
  if (!user || !user.id) return { ok: false, reason: "unknown_user" };
  return { ok: true, user: user };
}

function inspectAdmin(event, body) {
  var auth = header(event, "authorization");
  var apiKey = String(process.env.VOUCHER_API_KEY || "").trim();
  if (apiKey && auth === "Bearer " + apiKey) {
    return { ok: true, reason: "bearer" };
  }

  var initData = readInitData(event, body);
  var token = botToken();
  if (!initData) return { ok: false, reason: "missing_init" };
  if (!token) return { ok: false, reason: "no_token" };

  var checked = validateInitData(initData, token);
  if (!checked.ok) return { ok: false, reason: checked.reason };

  var allowed = allowedIds();
  if (!allowed.length || allowed.indexOf(String(checked.user.id)) === -1) {
    return { ok: false, reason: "unknown_user" };
  }
  return { ok: true, reason: "telegram", user: checked.user };
}

module.exports = {
  header: header,
  readInitData: readInitData,
  validateInitData: validateInitData,
  inspectAdmin: inspectAdmin,
};
