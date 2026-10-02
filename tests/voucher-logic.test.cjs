"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var logic = require("../netlify/functions/lib/logic");

test("normalize israeli phones", function () {
  assert.equal(logic.normalizePhone("054-4459600"), "0544459600");
  assert.equal(logic.normalizePhone("+972544459600"), "0544459600");
});

test("preview does not consume codes", function () {
  var store = { nextCode: 400131, vouchers: {}, packages: {} };
  var preview = logic.previewVoucher(store, {
    recipient_name: "ספיר",
    message: "אהבה",
    duration: 60,
    sender_name: "לולו",
  });
  assert.equal(preview.voucher_code, "400131");
  assert.equal(Object.keys(store.vouchers).length, 0);
  assert.equal(logic.nextCodeFromStore(store), 400131);
});

test("issue then redeem voucher", function () {
  var store = { nextCode: 400131, vouchers: {}, packages: {} };
  var issued = logic.issueVoucher(store, {
    recipient_name: "ספיר הנפלאה",
    message: "שיהיה לך רק טוב",
    duration: 60,
    sender_name: "לולו",
    buyer_phone: "0544459600",
    recipient_phone: "0520000000",
  });
  assert.equal(issued.voucher_code, "400131");
  assert.equal(logic.nextCodeFromStore(store), 400132);
  var viewed = logic.unlockVoucher(store, "400131", "052-0000000");
  assert.equal(viewed.recipient_name, "ספיר הנפלאה");
  logic.redeemVoucher(store, "400131");
  assert.equal(store.vouchers["400131"].status, "redeemed");
});

test("series note creates package slots", function () {
  var parsed = logic.parseSeriesNote("עיסוי רפואי - סדרה 4 טיפולים");
  assert.equal(parsed.total, 4);
  var store = { nextCode: 400131, vouchers: {}, packages: {} };
  var pkg = logic.createPackage(store, {
    client_name: "לקוחה",
    phone: "0544459600",
    notes: parsed.title,
  });
  assert.equal(pkg.treatments.length, 4);
  logic.redeemTreatment(store, pkg.id, 1);
  assert.equal(logic.packageStatus(pkg), "open");
});
