(function () {
  "use strict";

  var tg = window.Telegram && window.Telegram.WebApp;
  if (tg) {
    tg.ready();
    tg.expand();
  }

  function telegramInitData() {
    if (tg && tg.initData) return tg.initData;
    if (window.__tgInitData) return window.__tgInitData;
    try {
      return sessionStorage.getItem("tg_init_data") || "";
    } catch (err) {
      return "";
    }
  }

  function webappAuth() {
    return new URLSearchParams(location.search).get("auth") || "";
  }

  var form = document.getElementById("voucher-form");
  var formStep = document.getElementById("form-step");
  var previewStep = document.getElementById("preview-step");
  var previewCard = document.getElementById("preview-card");
  var formError = document.getElementById("form-error");
  var previewStatus = document.getElementById("preview-status");
  var draft = null;

  function headers() {
    var h = { "Content-Type": "application/json" };
    var initData = telegramInitData();
    if (initData) h["X-Telegram-Init-Data"] = initData;
    return h;
  }

  function formFields() {
    var data = new FormData(form);
    var fields = {
      recipient_name: data.get("recipient_name"),
      message: data.get("message"),
      duration: data.get("duration"),
      sender_name: data.get("sender_name"),
      buyer_phone: data.get("buyer_phone"),
      recipient_phone: data.get("recipient_phone"),
    };
    var initData = telegramInitData();
    var signed = webappAuth();
    if (initData) fields.init_data = initData;
    if (signed) fields.webapp_auth = signed;
    return fields;
  }

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    formError.textContent = "";
    if (!telegramInitData() && !webappAuth()) {
      formError.textContent = "אין הרשאת ניהול (missing_init)";
      return;
    }
    fetch("/api/vouchers/preview", { method: "POST", headers: headers(), body: JSON.stringify(formFields()) })
      .then(function (res) {
        return res.json().then(function (data) {
          if (!res.ok) throw new Error(data.error || "לא ניתן ליצור תצוגה מקדימה");
          return data.voucher;
        });
      })
      .then(function (voucher) {
        draft = formFields();
        formStep.classList.add("hidden");
        previewStep.classList.remove("hidden");
        previewCard.innerHTML = window.ShimriVoucher.renderVoucherCard(voucher);
      })
      .catch(function (err) {
        formError.textContent = err.message;
      });
  });

  document.getElementById("cancel-btn").addEventListener("click", function () {
    draft = null;
    previewStep.classList.add("hidden");
    formStep.classList.remove("hidden");
    previewStatus.textContent = "";
  });

  var codeDialog = document.getElementById("code-dialog");
  var currentNextCode = document.getElementById("current-next-code");
  var nextCodeInput = document.getElementById("next-code-input");
  var codeDialogError = document.getElementById("code-dialog-error");

  function authPayload(extra) {
    var payload = extra || {};
    var initData = telegramInitData();
    var signed = webappAuth();
    if (initData) payload.init_data = initData;
    if (signed) payload.webapp_auth = signed;
    return payload;
  }

  function nextCodeUrl() {
    var signed = webappAuth();
    return signed ? "/api/vouchers/next-code?auth=" + encodeURIComponent(signed) : "/api/vouchers/next-code";
  }

  document.getElementById("edit-code-btn").addEventListener("click", function () {
    codeDialogError.textContent = "";
    currentNextCode.textContent = "...";
    fetch(nextCodeUrl(), { headers: headers() })
      .then(function (res) {
        return res.json().then(function (data) {
          if (!res.ok) throw new Error(data.error || "לא ניתן לקרוא את המספר הבא");
          return data;
        });
      })
      .then(function (data) {
        currentNextCode.textContent = data.voucher_code;
        nextCodeInput.value = data.voucher_code;
        codeDialog.showModal();
      })
      .catch(function (err) {
        formError.textContent = err.message;
      });
  });

  document.getElementById("close-code-dialog").addEventListener("click", function () {
    codeDialog.close();
  });

  document.getElementById("code-form").addEventListener("submit", function (event) {
    event.preventDefault();
    codeDialogError.textContent = "";
    fetch("/api/vouchers/next-code", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify(authPayload({ next_code: nextCodeInput.value })),
    })
      .then(function (res) {
        return res.json().then(function (data) {
          if (!res.ok) throw new Error(data.error || "לא ניתן לשמור את המספר");
          return data;
        });
      })
      .then(function (data) {
        currentNextCode.textContent = data.voucher_code;
        codeDialog.close();
      })
      .catch(function (err) {
        codeDialogError.textContent = err.message;
      });
  });

  document.getElementById("issue-btn").addEventListener("click", function () {
    if (!draft) return;
    previewStatus.textContent = "מפיק שובר...";
    fetch("/api/vouchers", { method: "POST", headers: headers(), body: JSON.stringify(draft) })
      .then(function (res) {
        return res.json().then(function (data) {
          if (!res.ok) throw new Error(data.error || "ההפקה נכשלה");
          return data;
        });
      })
      .then(function (data) {
        previewStatus.textContent = "השובר הופק. קישור: " + data.url;
        if (tg) {
          tg.sendData(JSON.stringify({ type: "voucher_issued", url: data.url, code: data.voucher.voucher_code }));
          tg.close();
        }
      })
      .catch(function (err) {
        previewStatus.textContent = err.message;
      });
  });
})();
