"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var image = require("../netlify/functions/lib/voucher-image");

test("voucher image is a png of the card", function () {
  var png = image.renderVoucherPng({
    recipient_name: "ספיר",
    message: "ברכה",
    duration: 60,
    sender_name: "לולו",
    voucher_code: "400131",
    expiry_date: "01/10/2027",
    status: "active",
  });
  assert.equal(png.slice(0, 8).toString("hex"), "89504e470d0a1a0a");
  assert.ok(png.length > 1000);
});
