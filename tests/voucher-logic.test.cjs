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

test("staff phone opens any voucher without changing it", function () {
  var store = { nextCode: 400131, vouchers: {}, packages: {} };
  logic.issueVoucher(store, {
    recipient_name: "ספיר",
    message: "ברכה",
    duration: 60,
    sender_name: "לולו",
    buyer_phone: "0521111111",
    recipient_phone: "0532222222",
  });
  var viewed = logic.unlockVoucher(store, "400131", "054-445-9600");
  assert.equal(viewed.voucher_code, "400131");
  assert.equal(viewed.status, "active");
  logic.unlockVoucher(store, "400131", "+972 54 445 9600");
  assert.equal(store.vouchers["400131"].status, "active");
  assert.equal(store.vouchers["400131"].buyer_phone, "0521111111");
  assert.equal(logic.nextCodeFromStore(store), 400132);
  assert.equal(Object.keys(store.vouchers).length, 1);
  assert.throws(function () {
    logic.unlockVoucher(store, "400131", "0500000000");
  }, /אינו תואם/);
});

test("cancel reports why a voucher cannot be cancelled", function () {
  var store = { nextCode: 400131, vouchers: {}, packages: {} };
  assert.throws(
    function () {
      logic.cancelVoucher(store, "400131");
    },
    function (err) {
      return err.reason === "not_found";
    }
  );
  sampleIssue(store);
  logic.redeemVoucher(store, "400131");
  assert.throws(
    function () {
      logic.cancelVoucher(store, "400131");
    },
    function (err) {
      return err.reason === "already_redeemed";
    }
  );
});

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

test("a receipt series note is saved without a phone and without a voucher", function () {
  var parsed = logic.parseSeriesNote("סדרה 3 טיפולים");
  assert.equal(parsed.total, 3);
  var store = { nextCode: 400131, vouchers: {}, packages: {} };
  var pkg = logic.createPackage(store, {
    client_name: "אלינור לוי",
    phone: "",
    package_title: parsed.title,
    total_treatments: parsed.total,
  });
  assert.equal(pkg.client_name, "אלינור לוי");
  assert.equal(pkg.phone, "");
  assert.equal(pkg.total_treatments, 3);
  assert.equal(logic.listPackages(store, "open").length, 1);
  assert.equal(Object.keys(store.vouchers).length, 0);
  assert.equal(pkg.receipt_number, undefined);
});

test("a receipt number is stored on the series and listed while it is open", function () {
  var parsed = logic.parseSeriesNote("סדרה 3 טיפולים");
  var store = { nextCode: 400131, vouchers: { "400131": { status: "active" } }, packages: {} };
  var pkg = logic.createPackage(store, {
    client_name: "אלינור לוי",
    phone: "",
    package_title: parsed.title,
    total_treatments: parsed.total,
    receipt_number: "800502",
  });
  assert.equal(pkg.receipt_number, "800502");
  var open = logic.listPackages(store, "open");
  assert.equal(open.length, 1);
  assert.equal(open[0].receipt_number, "800502");
  assert.equal(store.vouchers["400131"].status, "active");
});

test("the existing Elinor series keeps receipt 800502", function () {
  var store = {
    nextCode: 400131,
    vouchers: {},
    packages: {
      pkg_1794924931378: {
        id: "pkg_1794924931378",
        client_name: "אלינור לוי",
        phone: "",
        package_title: "סדרה 3 טיפולים",
        total_treatments: 3,
        treatments: [
          { index: 1, is_redeemed: false, redeemed_date: "" },
          { index: 2, is_redeemed: false, redeemed_date: "" },
          { index: 3, is_redeemed: false, redeemed_date: "" },
        ],
        created_at: "2026-11-17T14:00:00.000Z",
      },
    },
  };
  var open = logic.listPackages(store, "open");
  assert.equal(open[0].id, "pkg_1794924931378");
  assert.equal(open[0].receipt_number, "800502");
  assert.equal(store.packages.pkg_1794924931378.receipt_number, "800502");
  assert.equal(Object.keys(store.vouchers).length, 0);
});
