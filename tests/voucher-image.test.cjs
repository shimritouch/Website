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

function textSize(svg, sample) {
  var match = svg.match(new RegExp('<text[^>]*font-size="(\\d+)"[^>]*>\\s*<tspan[^>]*>[^<]*' + sample));
  return match ? Number(match[1]) : 0;
}

test("a long greeting shrinks like the on-screen card", function () {
  var shortCard = image.buildVoucherSvg({
    recipient_name: "ספיר",
    message: "ברכה",
    duration: 60,
    sender_name: "לולו",
    voucher_code: "400131",
    expiry_date: "01/10/2027",
    status: "active",
  });
  var longCard = image.buildVoucherSvg({
    recipient_name: "נועה",
    message: "מאחלת לך שקט, נשימה עמוקה ושעה שכולה שלך. שתצאי מהטיפול רגועה, קלה ושמחה.",
    duration: 90,
    sender_name: "אמא",
    voucher_code: "400132",
    expiry_date: "15/11/2027",
    status: "active",
  });
  assert.ok(textSize(longCard, "לנועה") < textSize(shortCard, "לספיר"));
});

test("greeting line breaks stay on their own lines", function () {
  var svg = image.buildVoucherSvg({
    recipient_name: "לבתיש שלנו",
    message: "שורה אחת\nשורה שניה\nשורה שלישית",
    duration: 60,
    sender_name: "שני",
    voucher_code: "400133",
    expiry_date: "14/10/2027",
    status: "active",
  });
  assert.equal((svg.match(/שורה אחת/g) || []).length, 1);
  assert.equal((svg.match(/שורה שניה/g) || []).length, 1);
  assert.equal((svg.match(/שורה שלישית/g) || []).length, 1);
  assert.equal(svg.includes("שורה אחת שורה שניה"), false);
});

test("hebrew weights match the preview faces", function () {
  var svg = image.buildVoucherSvg({
    recipient_name: "לבתיש שלנו",
    message: "ברכה קלה",
    duration: 60,
    sender_name: "שני",
    voucher_code: "400133",
    expiry_date: "14/10/2027",
    status: "active",
  });
  assert.match(svg, /font-family="Heebo ExtraBold"[^>]*>[^<]*לבתיש שלנו/);
  assert.match(svg, /font-family="Heebo Medium"[^>]*>[^<]*ברכה קלה/);
  assert.match(svg, /font-family="Heebo ExtraBold"[^>]*>[^<]*שני/);
  assert.match(svg, /font-family="Heebo"[^>]*>[^<]*קוד שובר/);
  assert.match(svg, /font-family="Montserrat ExtraBold"[^>]*>[^<]*400133/);
  assert.match(svg, /font-family="Montserrat Medium"[^>]*>[^<]*60/);
  assert.equal(svg.includes("Montserrat Medium, Heebo"), false);
});
