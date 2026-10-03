"use strict";

var fs = require("fs");
var path = require("path");
var { Resvg } = require("@resvg/resvg-js");

var WIDTH = 1024;
var HEIGHT = 728;

function findFile(parts) {
  var candidates = [
    path.join.apply(path, [process.cwd()].concat(parts)),
    path.join.apply(path, [__dirname].concat(parts)),
    path.join.apply(path, [__dirname, "..", ".."].concat(parts)),
  ];
  for (var i = 0; i < candidates.length; i += 1) {
    if (fs.existsSync(candidates[i])) return candidates[i];
  }
  throw new Error("חסר קובץ לכרטיס השובר");
}

function dataUri(file, mime) {
  return "data:" + mime + ";base64," + fs.readFileSync(file).toString("base64");
}

function esc(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function wrapLine(text, maxChars) {
  var words = String(text || "").split(/\s+/).filter(Boolean);
  var lines = [];
  var line = "";
  words.forEach(function (word) {
    var next = line ? line + " " + word : word;
    if (line && next.length > maxChars) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  });
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

function text(x, y, value, attrs) {
  return (
    '<text x="' +
    x +
    '" y="' +
    y +
    '" text-anchor="middle" direction="rtl" font-family="' +
    attrs.family +
    '" font-size="' +
    attrs.size +
    '" font-weight="' +
    attrs.weight +
    '" fill="' +
    attrs.fill +
    '">' +
    esc(value) +
    "</text>"
  );
}

function logoImage() {
  var svg = fs.readFileSync(findFile(["assets", "images", "ShimriTouch.svg"]), "utf8");
  var rendered = new Resvg(svg, {
    fitTo: { mode: "height", value: 118 },
    font: { loadSystemFonts: false },
  }).render();
  return {
    uri: "data:image/png;base64," + rendered.asPng().toString("base64"),
    width: rendered.width,
    height: rendered.height,
  };
}

function buildVoucherSvg(voucher) {
  var bg = dataUri(findFile(["assets", "images", "voucher-bg.jpg"]), "image/jpeg");
  var logo = logoImage();
  var body = { family: "Heebo", fill: "#243026" };
  var title = { family: "Suez One", size: 46, weight: 400, fill: "#5d6b56" };
  var y = 168;
  var parts = [text(512, 86, "שובר עיסוי ב ShimriTouch", title)];

  function block(lines, size, weight, gap) {
    lines.forEach(function (line) {
      parts.push(text(512, y, line, { family: body.family, size: size, weight: weight, fill: body.fill }));
      y += Math.round(size * 1.35);
    });
    y += gap;
  }

  var recipient = String(voucher.recipient_name || "").trim().replace(/^ל[\s\u200f]*/, "");
  block(["ל" + recipient], 52, 800, 18);
  block(wrapLine(voucher.message, 42), 31, 500, 10);
  block(wrapLine("קיבלת במתנה שובר לעיסוי מפנק באורך " + (voucher.duration || "") + " דקות", 46), 31, 500, 14);
  block(["אוהבת, " + (voucher.sender_name || "")], 42, 800, 28);
  block(["קוד שובר"], 30, 700, 4);
  block([String(voucher.voucher_code || "")], 46, 800, 22);
  block(["יש לתאם מראש תאריך ושעת הגעה", "שמרית 054-4459600"], 28, 600, 0);

  var expiryLines =
    voucher.status === "redeemed"
      ? ["נוצל בתאריך " + (voucher.redeemed_date || "")]
      : voucher.status === "cancelled"
        ? ["בוטל בתאריך " + (voucher.cancelled_date || "")]
        : ["השובר תקף עד ל-" + (voucher.expiry_date || ""), "(ע״ב מקום פנוי)"];
  expiryLines.forEach(function (line, index) {
    parts.push(
      text(850, 680 + index * 28, line, { family: "Heebo", size: 22, weight: 500, fill: "#243026" })
    );
  });
  parts.push(text(512, 700, "ShimriTouch", { family: "Suez One", size: 38, weight: 400, fill: "#8d9794" }));

  var stamp = "";
  if (voucher.status === "redeemed" || voucher.status === "cancelled") {
    var label = voucher.status === "redeemed" ? "נוצל" : "בוטל";
    var color = voucher.status === "redeemed" ? "#8a2f2f" : "#5d6b56";
    stamp =
      '<g transform="translate(512 360) rotate(-8)">' +
      '<rect x="-70" y="-28" width="140" height="56" rx="8" fill="rgba(247,244,238,0.82)" stroke="' +
      color +
      '" stroke-width="3"/>' +
      text(0, 10, label, { family: "Heebo", size: 28, weight: 800, fill: color }).replace(
        'x="0"',
        'x="0"'
      ) +
      "</g>";
  }

  return (
    '<svg xmlns="http://www.w3.org/2000/svg" width="' +
    WIDTH +
    '" height="' +
    HEIGHT +
    '" viewBox="0 0 ' +
    WIDTH +
    " " +
    HEIGHT +
    '">' +
    '<image href="' +
    bg +
    '" x="0" y="0" width="' +
    WIDTH +
    '" height="' +
    HEIGHT +
    '" preserveAspectRatio="xMidYMid slice"/>' +
    '<image href="' +
    logo.uri +
    '" x="28" y="18" width="' +
    logo.width +
    '" height="' +
    logo.height +
    '"/>' +
    parts.join("") +
    stamp +
    "</svg>"
  );
}

function renderVoucherPng(voucher) {
  var svg = buildVoucherSvg(voucher);
  var fonts = [
    findFile(["netlify", "functions", "fonts", "SuezOne-Regular.ttf"]),
    findFile(["netlify", "functions", "fonts", "Heebo.ttf"]),
  ];
  var resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: WIDTH },
    font: {
      fontFiles: fonts,
      loadSystemFonts: false,
      defaultFontFamily: "Heebo",
    },
  });
  return resvg.render().asPng();
}

module.exports = { buildVoucherSvg: buildVoucherSvg, renderVoucherPng: renderVoucherPng };
