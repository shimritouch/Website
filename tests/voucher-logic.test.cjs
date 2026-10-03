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

function sampleIssue(store) {
  return logic.issueVoucher(store, {
    recipient_name: "ספיר",
    message: "ברכה",
    duration: 60,
    sender_name: "לולו",
    buyer_phone: "0544459600",
  });
}

test("cancel moves a voucher out of the active list", function () {
  var store = { nextCode: 400131, vouchers: {}, packages: {} };
  sampleIssue(store);
  assert.equal(logic.nextCodeFromStore(store), 400132);
  logic.cancelVoucher(store, "400131");
  assert.equal(logic.listVouchers(store, "active").length, 0);
  assert.equal(logic.listVouchers(store, "cancelled")[0].voucher_code, "400131");
  assert.equal(logic.nextCodeFromStore(store), 400132);
});

test("reissuing a cancelled code replaces that voucher", function () {
  var store = { nextCode: 400131, vouchers: {}, packages: {} };
  sampleIssue(store);
  logic.cancelVoucher(store, "400131");
  logic.setNextCode(store, "400131");
  var again = sampleIssue(store);
  assert.equal(again.voucher_code, "400131");
  assert.equal(again.status, "active");
  assert.equal(logic.listVouchers(store, "cancelled").length, 0);
  assert.equal(logic.listVouchers(store, "active").length, 1);
  assert.equal(logic.nextCodeFromStore(store), 400132);
});

test("cannot restart from an active or redeemed code", function () {
  var store = { nextCode: 400131, vouchers: {}, packages: {} };
  sampleIssue(store);
  assert.throws(function () {
    logic.setNextCode(store, "400131");
  }, /בשימוש/);
  logic.redeemVoucher(store, "400131");
  assert.throws(function () {
    logic.setNextCode(store, "400131");
  }, /בשימוש/);
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
