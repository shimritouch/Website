"use strict";

var STARTING_CODE = 400131;
var SERIES_RE = /סדרה\s*(\d+)/;
var PHONE_RE = /^0\d{8,9}$/;

function pad2(n) {
  return String(n).padStart(2, "0");
}

function formatExpiry(date) {
  return pad2(date.getDate()) + "/" + pad2(date.getMonth() + 1) + "/" + date.getFullYear();
}

function addOneYear(from) {
  var d = new Date(from.getTime());
  d.setFullYear(d.getFullYear() + 1);
  return d;
}

function todayExpiry() {
  return formatExpiry(addOneYear(new Date()));
}

function normalizePhone(raw) {
  if (!raw) return "";
  var digits = String(raw).replace(/\D/g, "");
  if (digits.indexOf("972") === 0 && digits.length >= 11) {
    digits = "0" + digits.slice(3);
  }
  if (digits.length === 9 && digits[0] !== "0") {
    digits = "0" + digits;
  }
  return digits;
}

function isValidPhone(raw) {
  return PHONE_RE.test(normalizePhone(raw));
}

function phonesMatch(input, stored) {
  var a = normalizePhone(input);
  var b = normalizePhone(stored);
  return Boolean(a && b && a === b);
}

function parseSeriesNote(note) {
  if (!note) return null;
  var text = String(note).trim();
  var match = text.match(SERIES_RE);
  if (!match) return null;
  var total = parseInt(match[1], 10);
  if (!total || total < 1 || total > 50) return null;
  return { title: text, total: total };
}

function nextCodeFromStore(store) {
  var maxIssued = STARTING_CODE - 1;
  Object.keys(store.vouchers || {}).forEach(function (code) {
    var n = parseInt(code, 10);
    if (n > maxIssued) maxIssued = n;
  });
  if (store.nextCode && store.nextCode > maxIssued + 1) {
    return store.nextCode;
  }
  return maxIssued + 1;
}

function previewVoucher(store, fields) {
  var code = nextCodeFromStore(store);
  return {
    voucher_code: String(code),
    recipient_name: fields.recipient_name,
    message: fields.message,
    duration: Number(fields.duration),
    sender_name: fields.sender_name,
    expiry_date: todayExpiry(),
    status: "draft",
  };
}

function issueVoucher(store, fields) {
  var buyer = normalizePhone(fields.buyer_phone);
  var recipientPhone = fields.recipient_phone ? normalizePhone(fields.recipient_phone) : "";
  if (!fields.recipient_name || !fields.message || !fields.sender_name) {
    throw new Error("חסרים שדות חובה בשובר");
  }
  if (!isValidPhone(buyer)) {
    throw new Error("מספר נייד של הרוכש אינו תקין");
  }
  if (fields.recipient_phone && !isValidPhone(recipientPhone)) {
    throw new Error("מספר נייד של המקבל אינו תקין");
  }
  var duration = Number(fields.duration);
  if (!duration || duration < 15 || duration > 240) {
    throw new Error("משך העיסוי אינו תקין");
  }

  var code = String(nextCodeFromStore(store));
  var voucher = {
    voucher_code: code,
    recipient_name: String(fields.recipient_name).trim(),
    message: String(fields.message).trim(),
    duration: duration,
    sender_name: String(fields.sender_name).trim(),
    buyer_phone: buyer,
    recipient_phone: recipientPhone,
    expiry_date: todayExpiry(),
    status: "active",
    issued_at: new Date().toISOString(),
    redeemed_date: "",
  };
  store.vouchers[code] = voucher;
  store.nextCode = parseInt(code, 10) + 1;
  return voucher;
}

function unlockVoucher(store, code, phone) {
  var voucher = store.vouchers[String(code)];
  if (!voucher) throw new Error("שובר לא נמצא");
  var ok =
    phonesMatch(phone, voucher.buyer_phone) ||
    (voucher.recipient_phone && phonesMatch(phone, voucher.recipient_phone));
  if (!ok) throw new Error("מספר הנייד אינו תואם לשובר");
  return publicVoucher(voucher);
}

function publicVoucher(voucher) {
  return {
    voucher_code: voucher.voucher_code,
    recipient_name: voucher.recipient_name,
    message: voucher.message,
    duration: voucher.duration,
    sender_name: voucher.sender_name,
    expiry_date: voucher.expiry_date,
    status: voucher.status,
    redeemed_date: voucher.redeemed_date || "",
  };
}

function redeemVoucher(store, code) {
  var voucher = store.vouchers[String(code)];
  if (!voucher) throw new Error("שובר לא נמצא");
  if (voucher.status === "redeemed") throw new Error("השובר כבר נוצל");
  voucher.status = "redeemed";
  voucher.redeemed_date = formatExpiry(new Date());
  return voucher;
}

function listVouchers(store, status) {
  return Object.keys(store.vouchers)
    .sort()
    .map(function (code) {
      return store.vouchers[code];
    })
    .filter(function (v) {
      if (status === "active") return v.status === "active";
      if (status === "redeemed" || status === "closed") return v.status === "redeemed";
      return true;
    });
}

function createPackage(store, payload) {
  var phone = normalizePhone(payload.phone);
  var parsed = parseSeriesNote(payload.package_title || payload.notes);
  var total = payload.total_treatments || (parsed && parsed.total);
  var title = payload.package_title || (parsed && parsed.title);
  if (!payload.client_name || !isValidPhone(phone) || !title || !total) {
    throw new Error("לא ניתן לפתוח סדרת טיפולים מההערה");
  }
  var id = "pkg_" + Date.now();
  var treatments = [];
  for (var i = 1; i <= total; i += 1) {
    treatments.push({ index: i, is_redeemed: false, redeemed_date: "" });
  }
  var pkg = {
    id: id,
    client_name: String(payload.client_name).trim(),
    phone: phone,
    package_title: title,
    total_treatments: total,
    treatments: treatments,
    created_at: new Date().toISOString(),
  };
  store.packages[id] = pkg;
  return pkg;
}

function packageStatus(pkg) {
  var done = pkg.treatments.filter(function (t) {
    return t.is_redeemed;
  }).length;
  return done >= pkg.total_treatments ? "closed" : "open";
}

function listPackages(store, status) {
  return Object.keys(store.packages)
    .map(function (id) {
      return store.packages[id];
    })
    .filter(function (pkg) {
      var st = packageStatus(pkg);
      if (status === "open") return st === "open";
      if (status === "closed") return st === "closed";
      return true;
    })
    .sort(function (a, b) {
      return (b.created_at || "").localeCompare(a.created_at || "");
    });
}

function redeemTreatment(store, packageId, index) {
  var pkg = store.packages[packageId];
  if (!pkg) throw new Error("סדרה לא נמצאה");
  var item = pkg.treatments.find(function (t) {
    return t.index === Number(index);
  });
  if (!item) throw new Error("טיפול לא נמצא בסדרה");
  if (item.is_redeemed) throw new Error("הטיפול כבר סומן כבוצע");
  item.is_redeemed = true;
  item.redeemed_date = formatExpiry(new Date());
  return pkg;
}

module.exports = {
  STARTING_CODE: STARTING_CODE,
  normalizePhone: normalizePhone,
  isValidPhone: isValidPhone,
  phonesMatch: phonesMatch,
  parseSeriesNote: parseSeriesNote,
  nextCodeFromStore: nextCodeFromStore,
  previewVoucher: previewVoucher,
  issueVoucher: issueVoucher,
  unlockVoucher: unlockVoucher,
  publicVoucher: publicVoucher,
  redeemVoucher: redeemVoucher,
  listVouchers: listVouchers,
  createPackage: createPackage,
  packageStatus: packageStatus,
  listPackages: listPackages,
  redeemTreatment: redeemTreatment,
  todayExpiry: todayExpiry,
};
