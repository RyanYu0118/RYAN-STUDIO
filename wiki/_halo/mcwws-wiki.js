(function () {
  function bindSmartCards(root) {
    var cards = (root || document).querySelectorAll(".mcwws-smart-card");
    cards.forEach(function (card) {
      function setPos(e) {
        var r = card.getBoundingClientRect();
        card.style.setProperty("--x", e.clientX - r.left + "px");
        card.style.setProperty("--y", e.clientY - r.top + "px");
      }
      card.addEventListener("mouseenter", setPos);
      card.addEventListener("mousemove", setPos);
      card.addEventListener("focus", function () {
        card.classList.add("mcwws-is-active");
        card.style.setProperty("--x", "50%");
        card.style.setProperty("--y", "50%");
      });
      card.addEventListener("blur", function () {
        card.classList.remove("mcwws-is-active");
      });
    });
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      bindSmartCards(document);
    });
  } else {
    bindSmartCards(document);
  }
})();
