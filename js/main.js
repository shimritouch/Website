(function () {
  "use strict";

  var WHATSAPP_NUMBER = "972544459600";
  var DEFAULT_MESSAGE = "היי שמרית, אשמח לתאם תור לטיפול...";

  function waUrl(text) {
    return "https://wa.me/" + WHATSAPP_NUMBER + "?text=" + encodeURIComponent(text || DEFAULT_MESSAGE);
  }

  function isMobile() {
    return /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
  }

  var toggle = document.querySelector(".menu-toggle");
  var mobileNav = document.querySelector(".mobile-nav");

  if (toggle && mobileNav) {
    toggle.addEventListener("click", function () {
      var open = document.body.classList.toggle("nav-open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });

    mobileNav.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("click", function () {
        document.body.classList.remove("nav-open");
        toggle.setAttribute("aria-expanded", "false");
      });
    });
  }

  document.querySelectorAll("[data-book-phone]").forEach(function (el) {
    el.addEventListener("click", function (event) {
      event.preventDefault();
      if (isMobile()) {
        window.location.href = waUrl(DEFAULT_MESSAGE);
      } else {
        window.location.href = "tel:0544459600";
      }
    });
  });

  document.querySelectorAll(".treatment-card").forEach(function (card) {
    var chips = card.querySelectorAll(".duration-chip");
    var priceEl = card.querySelector(".price-value");
    var bookLink = card.querySelector(".book-treatment");
    var title = card.querySelector("h3");

    function syncBook() {
      if (!bookLink || !title) return;
      var active = card.querySelector(".duration-chip.is-active");
      var duration = active ? active.textContent.trim() : "";
      var price = priceEl ? priceEl.textContent.trim() : "";
      var msg =
        "היי שמרית, אשמח לתאם תור לטיפול " +
        title.textContent.trim() +
        (duration ? " — " + duration : "") +
        (price ? " (" + price + " ₪)" : "") +
        ".";
      bookLink.setAttribute("href", waUrl(msg));
    }

    chips.forEach(function (chip) {
      chip.addEventListener("click", function () {
        chips.forEach(function (c) {
          c.classList.remove("is-active");
          c.setAttribute("aria-pressed", "false");
        });
        chip.classList.add("is-active");
        chip.setAttribute("aria-pressed", "true");
        if (priceEl) priceEl.textContent = chip.getAttribute("data-price");
        syncBook();
      });
    });

    syncBook();
  });

  var form = document.querySelector(".contact-form");
  if (form) {
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      var name = (form.querySelector("[name=name]") || {}).value || "";
      var phone = (form.querySelector("[name=phone]") || {}).value || "";
      var treatment = (form.querySelector("[name=treatment]") || {}).value || "";
      var message = (form.querySelector("[name=message]") || {}).value || "";
      var lines = ["היי שמרית, אשמח לתאם תור לטיפול."];
      if (name.trim()) lines.push("שם: " + name.trim());
      if (phone.trim()) lines.push("טלפון: " + phone.trim());
      if (treatment) lines.push("טיפול מבוקש: " + treatment);
      if (message.trim()) lines.push(message.trim());
      window.open(waUrl(lines.join("\n")), "_blank", "noopener");
      var status = form.querySelector(".form-status");
      if (status) status.textContent = "נפתח וואטסאפ לשליחת הפנייה.";
    });
  }
})();
