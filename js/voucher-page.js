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
  var downloadError = document.getElementById("download-error");

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
        downloadError.classList.add("hidden");
        view.innerHTML =
          window.ShimriVoucher.renderVoucherCard(voucher) +
          '<div class="voucher-download"><button id="download-voucher" class="rounded-full bg-primary px-5 py-3 font-semibold text-white" type="button">הורדה</button></div>';
        document.getElementById("download-voucher").addEventListener("click", function () {
          downloadCard(voucher.voucher_code, phone);
        });
      })
      .catch(function (err) {
        errorEl.textContent = err.message;
      });
  });

  function downloadCard(voucherCode, phone) {
    var button = document.getElementById("download-voucher");
    button.disabled = true;
    downloadError.classList.add("hidden");
    fetch("/api/vouchers/" + encodeURIComponent(voucherCode) + "/download", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: phone }),
    })
      .then(function (res) {
        if (!res.ok) {
          return res.json().then(function (data) {
            throw new Error(data.error || "ההורדה נכשלה");
          });
        }
        return res.blob();
      })
      .then(function (blob) {
        var url = URL.createObjectURL(blob);
        var link = document.createElement("a");
        link.href = url;
        link.download = "shimritouch-voucher-" + voucherCode + ".png";
        link.click();
        URL.revokeObjectURL(url);
      })
      .catch(function (err) {
        downloadError.textContent = err.message || "ההורדה נכשלה. נסו שוב.";
        downloadError.classList.remove("hidden");
      })
      .then(function () {
        button.disabled = false;
      });
  }
})();
