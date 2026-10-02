(function () {
  "use strict";

  function voucherCode() {
    var parts = window.location.pathname.replace(/\/+$/, "").split("/");
    var last = parts[parts.length - 1];
    if (last && last !== "voucher.html" && last !== "voucher") return last;
    return new URLSearchParams(window.location.search).get("code") || "";
  }

  var code = voucherCode();
  var form = document.getElementById("unlock-form");
  var errorEl = document.getElementById("gate-error");
  var gate = document.getElementById("gate");
  var view = document.getElementById("voucher-view");

  if (!code) {
    errorEl.textContent = "חסר קוד שובר בקישור.";
    form.querySelector("button").disabled = true;
    return;
  }

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    errorEl.textContent = "";
    var phone = document.getElementById("phone").value;
    fetch("/api/vouchers/" + encodeURIComponent(code) + "/unlock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: phone }),
    })
      .then(function (res) {
        return res.json().then(function (data) {
          if (!res.ok) throw new Error(data.error || "לא ניתן להציג את השובר");
          return data.voucher;
        });
      })
      .then(function (voucher) {
        gate.classList.add("hidden");
        view.classList.remove("hidden");
        view.innerHTML = window.ShimriVoucher.renderVoucherCard(voucher);
      })
      .catch(function (err) {
        errorEl.textContent = err.message;
      });
  });
})();
