(function (root) {
  "use strict";

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderVoucherCard(data, options) {
    var redeemed = data.status === "redeemed";
    var expiry = redeemed
      ? "נוצל בתאריך " + escapeHtml(data.redeemed_date || "")
      : "השובר תקף עד ל-" + escapeHtml(data.expiry_date || "") + "\n(ע״ב מקום פנוי)";
    var stamp = redeemed ? '<div class="voucher-stamp">נוצל</div>' : "";
    var logo = (options && options.logoSrc) || "/assets/images/ShimriTouch.svg";
    return (
      '<article class="voucher-card' +
      (redeemed ? " is-redeemed" : "") +
      '"><div class="voucher-inner">' +
      '<img class="voucher-logo" src="' +
      logo +
      '" alt="ShimriTouch" />' +
      '<h1 class="voucher-kicker">שובר עיסוי ב ShimriTouch</h1>' +
      '<p class="voucher-recipient">ל' +
      escapeHtml(data.recipient_name || "") +
      "</p>" +
      '<p class="voucher-message">' +
      escapeHtml(data.message || "") +
      "</p>" +
      '<p class="voucher-duration">קיבלת במתנה שובר לעיסוי מפנק באורך ' +
      escapeHtml(data.duration || "") +
      " דקות</p>" +
      '<p class="voucher-sender">אוהבת, ' +
      escapeHtml(data.sender_name || "") +
      "</p>" +
      '<p class="voucher-code-label">קוד שובר</p>' +
      '<p class="voucher-code-value">' +
      escapeHtml(data.voucher_code || "") +
      "</p>" +
      '<p class="voucher-contact">יש לתאם מראש תאריך ושעת הגעה<br />שמרית 054-4459600</p>' +
      '<p class="voucher-brand">ShimriTouch</p>' +
      '<p class="voucher-expiry">' +
      expiry +
      "</p>" +
      stamp +
      "</div></article>"
    );
  }

  root.ShimriVoucher = { renderVoucherCard: renderVoucherCard, escapeHtml: escapeHtml };
})(window);
