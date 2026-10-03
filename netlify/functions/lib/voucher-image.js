"use strict";

var fs = require("fs");
var path = require("path");
var { Resvg } = require("@resvg/resvg-js");

var WIDTH = 2048;
var HEIGHT = Math.round((WIDTH * 728) / 1024);

function cqi(n) {
  return (WIDTH * n) / 100;
}

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

function text(x, y, value, attrs) {
  var spacing = attrs.spacing ? ' letter-spacing="' + attrs.spacing.toFixed(2) + '"' : "";
  return (
    '<text x="' +
    Math.round(x) +
    '" y="' +
    Math.round(y) +
    '" text-anchor="' +
    (attrs.anchor || "middle") +
    '" direction="rtl" font-family="' +
    attrs.family +
    '" font-size="' +
    Math.round(attrs.size) +
    '" font-weight="' +
    attrs.weight +
    '" fill="' +
    attrs.fill +
    '"' +
    spacing +
    ">" +
    esc(value) +
    "</text>"
  );
}

function fontFiles() {
  return [
    findFile(["netlify", "functions", "fonts", "SuezOne-Regular.ttf"]),
    findFile(["netlify", "functions", "fonts", "Heebo.ttf"]),
  ];
}

function inkWidth(png) {
  var zlib = require("zlib");
  var width = png.readUInt32BE(16);
  var height = png.readUInt32BE(20);
  var channels = png[25] === 6 ? 4 : png[25] === 2 ? 3 : 0;
  if (!channels) return 0;
  var chunks = [];
  var offset = 8;
  while (offset < png.length) {
    var length = png.readUInt32BE(offset);
    var type = png.toString("ascii", offset + 4, offset + 8);
    if (type === "IDAT") chunks.push(png.subarray(offset + 8, offset + 8 + length));
    if (type === "IEND") break;
    offset += 12 + length;
  }
  var raw = zlib.inflateSync(Buffer.concat(chunks));
  var stride = width * channels;
  var prev = Buffer.alloc(stride);
  var row = Buffer.alloc(stride);
  var minX = width;
  var maxX = -1;
  for (var y = 0; y < height; y += 1) {
    var start = y * (stride + 1);
    var filter = raw[start];
    for (var i = 0; i < stride; i += 1) {
      var left = i >= channels ? row[i - channels] : 0;
      var up = prev[i];
      var upLeft = i >= channels ? prev[i - channels] : 0;
      var value = raw[start + 1 + i];
      if (filter === 1) value = (value + left) & 255;
      else if (filter === 2) value = (value + up) & 255;
      else if (filter === 3) value = (value + Math.floor((left + up) / 2)) & 255;
      else if (filter === 4) {
        var estimate = left + up - upLeft;
        var pa = Math.abs(estimate - left);
        var pb = Math.abs(estimate - up);
        var pc = Math.abs(estimate - upLeft);
        var predictor = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
        value = (value + predictor) & 255;
      }
      row[i] = value;
    }
    for (var x = 0; x < width; x += 1) {
      var pixel = x * channels;
      var alpha = channels === 4 ? row[pixel + 3] : 255;
      if (alpha > 16 && (row[pixel] < 245 || row[pixel + 1] < 245 || row[pixel + 2] < 245)) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
      }
    }
    var swap = prev;
    prev = row;
    row = swap;
  }
  return maxX < minX ? 0 : maxX - minX + 1;
}

function measureText(value, attrs) {
  var fonts = fontFiles();
  var size = Math.round(attrs.size);
  var svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="2400" height="' +
    (size * 3) +
    '" viewBox="0 0 2400 ' +
    size * 3 +
    '">' +
    '<rect width="2400" height="' +
    size * 3 +
    '" fill="#ffffff"/>' +
    text(40, size * 2, value, Object.assign({}, attrs, { anchor: "start" })) +
    "</svg>";
  var png = new Resvg(svg, {
    font: { fontFiles: fonts, loadSystemFonts: false, defaultFontFamily: "Heebo" },
  })
    .render()
    .asPng();
  return inkWidth(png);
}

function logoImage() {
  var height = Math.round(cqi(11.5));
  var svg = fs.readFileSync(findFile(["assets", "images", "ShimriTouch.svg"]), "utf8");
  var rendered = new Resvg(svg, {
    fitTo: { mode: "height", value: height },
    font: { loadSystemFonts: false },
  }).render();
  return {
    uri: "data:image/png;base64," + rendered.asPng().toString("base64"),
    width: rendered.width,
    height: rendered.height,
  };
}

function baseline(top, size, lineHeight) {
  return top + ((size * lineHeight - size) / 2) + size * 0.8;
}

function buildVoucherSvg(voucher) {
  var bg = dataUri(findFile(["assets", "images", "voucher-bg.jpg"]), "image/jpeg");
  var logo = logoImage();
  var padTop = cqi(2.8);
  var padX = cqi(3.6);
  var headH = cqi(11);
  var y = padTop + headH + cqi(0.4);
  var parts = [];

  function flow(value, sizeCqi, weight, marginTop, marginBottom, lineHeight, family, fill, spacing) {
    var size = cqi(sizeCqi);
    y += cqi(marginTop);
    parts.push(
      text(WIDTH / 2, baseline(y, size, lineHeight), value, {
        family: family || "Heebo",
        size: size,
        weight: weight,
        fill: fill || "#243026",
        spacing: spacing || 0,
      })
    );
    y += size * lineHeight + cqi(marginBottom);
  }

  var titleSize = cqi(4.6);
  var titleTop = padTop + (headH - titleSize * 1.15) / 2;
  parts.push(
    text(WIDTH / 2, baseline(titleTop, titleSize, 1.15), "שובר עיסוי ב ShimriTouch", {
      family: "Suez One",
      size: titleSize,
      weight: 400,
      fill: "#5d6b56",
    })
  );

  var recipient = String(voucher.recipient_name || "").trim().replace(/^ל[\s\u200f]*/, "");
  flow("ל" + recipient, 5.1, 800, 1, 1, 1.15);
  flow(voucher.message, 3.05, 500, 0, 0.7, 1.45);
  flow("קיבלת במתנה שובר לעיסוי מפנק באורך " + (voucher.duration || "") + " דקות", 3.05, 500, 0, 0.7, 1.45);
  flow("אוהבת, " + (voucher.sender_name || ""), 4.15, 800, 0.2, 1.5, 1.5);
  flow("קוד שובר", 2.9, 700, 0, 0, 1.5);
  flow(String(voucher.voucher_code || ""), 4.5, 800, 0.1, 1.2, 1.5, "Heebo", "#243026", cqi(4.5) * 0.03);
  flow("יש לתאם מראש תאריך ושעת הגעה", 2.75, 600, 0, 0, 1.45);
  flow("שמרית 054-4459600", 2.75, 600, 0, 0, 1.45);

  var expirySize = cqi(1.85);
  var expiryBox = expirySize * 1.3;
  var expiryBottom = HEIGHT - cqi(1.8);
  var expiryLines =
    voucher.status === "redeemed"
      ? ["נוצל בתאריך " + (voucher.redeemed_date || "")]
      : voucher.status === "cancelled"
        ? ["בוטל בתאריך " + (voucher.cancelled_date || "")]
        : ["השובר תקף עד ל-" + (voucher.expiry_date || ""), "(ע״ב מקום פנוי)"];
  var expiryAttrs = { family: "Heebo", size: expirySize, weight: 500, fill: "#243026" };
  var expiryWidth = 0;
  expiryLines.forEach(function (value) {
    expiryWidth = Math.max(expiryWidth, measureText(value, expiryAttrs));
  });
  var expiryX = WIDTH - cqi(3.4) - expiryWidth / 2;
  expiryLines.forEach(function (value, index) {
    var top = expiryBottom - (expiryLines.length - index) * expiryBox;
    parts.push(text(expiryX, baseline(top, expirySize, 1.3), value, expiryAttrs));
  });

  var brandSize = cqi(3.7);
  var brandTop = HEIGHT - cqi(1.6) - brandSize * 1.5;
  parts.push(
    text(WIDTH / 2, baseline(brandTop, brandSize, 1.5), "ShimriTouch", {
      family: "Suez One",
      size: brandSize,
      weight: 400,
      fill: "#8d9794",
    })
  );

  var stamp = "";
  if (voucher.status === "redeemed" || voucher.status === "cancelled") {
    var redeemedStamp = voucher.status === "redeemed";
    var stampColor = redeemedStamp ? "#62c96e" : "#d23c3c";
    var stampTitle = redeemedStamp ? "שובר מומש" : "שובר בוטל";
    var stampDate = redeemedStamp ? String(voucher.redeemed_date || "") : "";
    var titleSize = cqi(6.6);
    var dateSize = cqi(2.9);
    var titleAttrs = {
      family: "Heebo",
      size: titleSize,
      weight: 800,
      fill: stampColor,
      spacing: titleSize * 0.06,
    };
    var dateAttrs = {
      family: "Heebo",
      size: dateSize,
      weight: 700,
      fill: stampColor,
      spacing: dateSize * 0.04,
    };
    var titleWidth = measureText(stampTitle, titleAttrs);
    var dateWidth = stampDate ? measureText(stampDate, dateAttrs) : 0;
    var padX = cqi(2.4);
    var padY = cqi(1.15);
    var dateGap = stampDate ? cqi(0.55) : 0;
    var innerH = titleSize + dateGap + (stampDate ? dateSize : 0);
    var stampW = Math.max(titleWidth, dateWidth, cqi(46)) + padX * 2;
    var stampH = innerH + padY * 2;
    var inset = cqi(0.55);
    var titleTop = -innerH / 2;
    stamp =
      '<g transform="translate(' +
      WIDTH / 2 +
      " " +
      HEIGHT * 0.43 +
      ') rotate(-12)">' +
      '<rect x="' +
      -stampW / 2 +
      '" y="' +
      -stampH / 2 +
      '" width="' +
      stampW +
      '" height="' +
      stampH +
      '" rx="' +
      cqi(1.5) +
      '" fill="#fffaf4" fill-opacity="0.38" stroke="' +
      stampColor +
      '" stroke-width="' +
      cqi(0.62) +
      '"/>' +
      '<rect x="' +
      (-stampW / 2 + inset) +
      '" y="' +
      (-stampH / 2 + inset) +
      '" width="' +
      (stampW - inset * 2) +
      '" height="' +
      (stampH - inset * 2) +
      '" rx="' +
      cqi(1.05) +
      '" fill="none" stroke="' +
      stampColor +
      '" stroke-width="' +
      cqi(0.28) +
      '"/>' +
      text(0, titleTop + titleSize * 0.8, stampTitle, titleAttrs) +
      (stampDate ? text(0, titleTop + titleSize + dateGap + dateSize * 0.8, stampDate, dateAttrs) : "") +
      "</g>";
  }

  var radius = Math.round((18 * WIDTH) / 720);
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
    '<clipPath id="card"><rect width="' +
    WIDTH +
    '" height="' +
    HEIGHT +
    '" rx="' +
    radius +
    '"/></clipPath>' +
    '<rect width="' +
    WIDTH +
    '" height="' +
    HEIGHT +
    '" fill="#f4f2ed"/>' +
    '<g clip-path="url(#card)">' +
    '<image href="' +
    bg +
    '" x="0" y="0" width="' +
    WIDTH +
    '" height="' +
    HEIGHT +
    '" preserveAspectRatio="xMidYMid slice"/>' +
    '<image href="' +
    logo.uri +
    '" x="' +
    Math.round(padX) +
    '" y="' +
    Math.round(padTop) +
    '" width="' +
    logo.width +
    '" height="' +
    logo.height +
    '"/>' +
    parts.join("") +
    stamp +
    "</g></svg>"
  );
}

function renderVoucherPng(voucher) {
  var svg = buildVoucherSvg(voucher);
  var fonts = fontFiles();
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
