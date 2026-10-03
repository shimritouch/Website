"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var crypto = require("crypto");
var auth = require("../netlify/functions/lib/telegram-auth");

function signedInitData(token, user) {
  var fields = {
    auth_date: "1710000000",
    query_id: "AAE",
    user: JSON.stringify(user),
  };
  var pairs = Object.keys(fields)
    .sort()
    .map(function (key) {
      return key + "=" + fields[key];
    });
  var secret = crypto.createHmac("sha256", "WebAppData").update(token).digest();
  var hash = crypto.createHmac("sha256", secret).update(pairs.join("\n")).digest("hex");
  var query = new URLSearchParams(fields);
  query.set("hash", hash);
  return query.toString();
}

test("reads init data from the body when the header is missing", function () {
  var initData = "user=%7B%7D&hash=abc";
  assert.equal(auth.readInitData({ headers: {} }, { init_data: initData }), initData);
});

test("accepts a signed telegram user in the allowlist", function () {
  process.env.TELEGRAM_BOT_TOKEN = "test-token";
  process.env.ALLOWED_TELEGRAM_IDS = "111,222";
  process.env.VOUCHER_API_KEY = "api-key";
  var initData = signedInitData("test-token", { id: 222, first_name: "Shimrit" });
  var result = auth.inspectAdmin({ headers: {} }, { init_data: initData });
  assert.equal(result.ok, true);
  assert.equal(result.reason, "telegram");
});

test("reports a precise reason for each admin failure", function () {
  process.env.TELEGRAM_BOT_TOKEN = "test-token";
  process.env.ALLOWED_TELEGRAM_IDS = "111";
  process.env.VOUCHER_API_KEY = "api-key";

  assert.equal(auth.inspectAdmin({ headers: {} }, {}).reason, "missing_init");

  delete process.env.TELEGRAM_BOT_TOKEN;
  assert.equal(auth.inspectAdmin({ headers: {} }, { init_data: "hash=abc" }).reason, "no_token");
  process.env.TELEGRAM_BOT_TOKEN = "test-token";

  assert.equal(auth.inspectAdmin({ headers: {} }, { init_data: "user=%7B%7D&hash=nope" }).reason, "bad_hash");

  var otherUser = signedInitData("test-token", { id: 999, first_name: "Other" });
  assert.equal(auth.inspectAdmin({ headers: {} }, { init_data: otherUser }).reason, "unknown_user");
});
