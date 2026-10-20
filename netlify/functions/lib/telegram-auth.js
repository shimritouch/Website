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
  if (!user || !user.id) {
    // #region agent log
    fetch("http://127.0.0.1:7637/ingest/eb624bad-fd3b-4bd9-ba94-11b3bb3b612f",{method:"POST",headers:{"Content-Type":"application/json","X-Debug-Session-Id":"29548e"},body:JSON.stringify({sessionId:"29548e",hypothesisId:"C",location:"telegram-auth.js:validateInitData",message:"valid hash but user id missing",data:{hasUser:!!user,authDate:params.get("auth_date")||""},timestamp:Date.now()})}).catch(function(){});
    // #endregion
    return { ok: false, reason: "unknown_user" };
  }
  return { ok: true, user: user };
}

function safeEqualHex(left, right) {
  try {
    var a = Buffer.from(String(left), "hex");
    var b = Buffer.from(String(right), "hex");
    if (!a.length || a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch (err) {
    return false;
  }
}

function readWebAppAuth(event, body) {
  var source = body || {};
  var fromBody = String(source.webapp_auth || source.auth || "");
  if (fromBody) return fromBody;
  var query = (event && event.queryStringParameters) || {};
  return String(query.auth || query.webapp_auth || "");
}

function inspectWebAppAuth(raw) {
  var key = String(process.env.VOUCHER_API_KEY || "").trim();
  if (!raw) return { ok: false, reason: "missing_init" };
  if (!key) return { ok: false, reason: "no_token" };
  var parts = String(raw).split(".");
  if (parts.length !== 3) return { ok: false, reason: "bad_hash" };
  var userId = parts[0];
  var exp = parseInt(parts[1], 10);
  var sig = parts[2];
  if (!userId || !exp) return { ok: false, reason: "bad_hash" };
  if (Math.floor(Date.now() / 1000) > exp) {
    // #region agent log
    fetch("http://127.0.0.1:7637/ingest/eb624bad-fd3b-4bd9-ba94-11b3bb3b612f",{method:"POST",headers:{"Content-Type":"application/json","X-Debug-Session-Id":"29548e"},body:JSON.stringify({sessionId:"29548e",hypothesisId:"A",location:"telegram-auth.js:inspectWebAppAuth",message:"signed session expired",data:{expired:true,ageSec:Math.floor(Date.now()/1000)-exp},timestamp:Date.now()})}).catch(function(){});
    // #endregion
    return { ok: false, reason: "expired" };
  }
  var expected = crypto.createHmac("sha256", key).update(userId + "." + exp).digest("hex");
  if (!safeEqualHex(sig, expected)) return { ok: false, reason: "bad_hash" };
  var allowed = allowedIds();
  if (!allowed.length || allowed.indexOf(String(userId)) === -1) {
    // #region agent log
    fetch("http://127.0.0.1:7637/ingest/eb624bad-fd3b-4bd9-ba94-11b3bb3b612f",{method:"POST",headers:{"Content-Type":"application/json","X-Debug-Session-Id":"29548e"},body:JSON.stringify({sessionId:"29548e",hypothesisId:"B",location:"telegram-auth.js:inspectWebAppAuth",message:"signed user not in allowlist",data:{allowedCount:allowed.length,idInList:allowed.indexOf(String(userId))!==-1},timestamp:Date.now()})}).catch(function(){});
    // #endregion
    return { ok: false, reason: "unknown_user" };
  }
  return { ok: true, reason: "webapp_auth", user: { id: userId } };
}

function inspectAdmin(event, body) {
  var auth = header(event, "authorization");
  var apiKey = String(process.env.VOUCHER_API_KEY || "").trim();
  if (apiKey && auth === "Bearer " + apiKey) {
    return { ok: true, reason: "bearer" };
  }

  var initData = readInitData(event, body);
  var token = botToken();
  var initFailure = null;
  if (initData) {
    if (!token) initFailure = { ok: false, reason: "no_token" };
    else {
      var checked = validateInitData(initData, token);
      if (!checked.ok) {
        // #region agent log
        fetch("http://127.0.0.1:7637/ingest/eb624bad-fd3b-4bd9-ba94-11b3bb3b612f",{method:"POST",headers:{"Content-Type":"application/json","X-Debug-Session-Id":"29548e"},body:JSON.stringify({sessionId:"29548e",runId:"post-fix",hypothesisId:"D",location:"telegram-auth.js:inspectAdmin",message:"initData rejected before signed session",data:{initReason:checked.reason,hasSigned:!!readWebAppAuth(event,body)},timestamp:Date.now()})}).catch(function(){});
        // #endregion
        initFailure = { ok: false, reason: checked.reason };
      } else {
        var allowed = allowedIds();
        if (!allowed.length || allowed.indexOf(String(checked.user.id)) === -1) {
          // #region agent log
          fetch("http://127.0.0.1:7637/ingest/eb624bad-fd3b-4bd9-ba94-11b3bb3b612f",{method:"POST",headers:{"Content-Type":"application/json","X-Debug-Session-Id":"29548e"},body:JSON.stringify({sessionId:"29548e",runId:"post-fix",hypothesisId:"B",location:"telegram-auth.js:inspectAdmin",message:"initData user not in allowlist",data:{allowedCount:allowed.length,idInList:false},timestamp:Date.now()})}).catch(function(){});
          // #endregion
          initFailure = { ok: false, reason: "unknown_user" };
        } else {
          return { ok: true, reason: "telegram", user: checked.user };
        }
      }
    }
  }

  var signed = inspectWebAppAuth(readWebAppAuth(event, body));
  if (signed.ok) return signed;
  if (initFailure && signed.reason === "missing_init") return initFailure;
  if (signed.reason !== "missing_init") return signed;
  return initFailure || { ok: false, reason: "missing_init" };
}

module.exports = {
  header: header,
  readInitData: readInitData,
  validateInitData: validateInitData,
  inspectWebAppAuth: inspectWebAppAuth,
  inspectAdmin: inspectAdmin,
};
