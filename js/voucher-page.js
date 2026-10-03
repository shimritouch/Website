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
          downloadCard(voucher.voucher_code);
        });
      })
      .catch(function (err) {
        errorEl.textContent = err.message;
      });
  });

  function downloadCard(voucherCode) {
    var button = document.getElementById("download-voucher");
    var card = view.querySelector(".voucher-card");
    if (!card || !window.htmlToImage) {
      downloadError.textContent = "לא ניתן להוריד את השובר כרגע";
      downloadError.classList.remove("hidden");
      return;
    }
    button.disabled = true;
    downloadError.classList.add("hidden");
    window.htmlToImage
      .toPng(card, { pixelRatio: 2, cacheBust: true })
      .then(function (dataUrl) {
        var link = document.createElement("a");
        link.href = dataUrl;
        link.download = "shimritouch-voucher-" + voucherCode + ".png";
        link.click();
      })
      .catch(function () {
        downloadError.textContent = "ההורדה נכשלה. נסו שוב.";
        downloadError.classList.remove("hidden");
      })
      .then(function () {
        button.disabled = false;
      });
  }
})();
