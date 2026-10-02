(function () {
  "use strict";

  var tg = window.Telegram && window.Telegram.WebApp;
  if (tg) {
    tg.ready();
    tg.expand();
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
    if (tg && tg.initData) h["X-Telegram-Init-Data"] = tg.initData;
    return h;
  }

  function formFields() {
    var data = new FormData(form);
    return {
      recipient_name: data.get("recipient_name"),
      message: data.get("message"),
      duration: data.get("duration"),
      sender_name: data.get("sender_name"),
      buyer_phone: data.get("buyer_phone"),
      recipient_phone: data.get("recipient_phone"),
    };
  }

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    formError.textContent = "";
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
