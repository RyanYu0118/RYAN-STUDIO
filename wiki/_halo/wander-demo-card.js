(function () {
  var cards = document.querySelectorAll(".wd-smart-card");
  if (!cards.length) return;

  var isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  );

  function updateMousePosition(card, e) {
    var rect = card.getBoundingClientRect();
    card.style.setProperty("--x", e.clientX - rect.left + "px");
    card.style.setProperty("--y", e.clientY - rect.top + "px");
  }

  function playCard(card) {
    var video = card.querySelector("video");
    if (video && video.querySelector("source")) {
      video.play().then(function () {
        card.classList.add("is-playing");
      }).catch(function () {
        card.classList.add("is-playing");
      });
    } else {
      card.classList.add("is-playing");
    }
  }

  function pauseCard(card) {
    var video = card.querySelector("video");
    if (video) video.pause();
    card.classList.remove("is-playing");
  }

  cards.forEach(function (card) {
    var video = card.querySelector("video");

    if (isMobile) {
      var observer = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (entry.isIntersecting && entry.intersectionRatio >= 0.92) {
              card.style.setProperty("--x", "50%");
              card.style.setProperty("--y", "50%");
              playCard(card);
            } else {
              pauseCard(card);
            }
          });
        },
        { threshold: [0.92] }
      );
      observer.observe(card);
    } else {
      card.addEventListener("mouseenter", function (e) {
        updateMousePosition(card, e);
        playCard(card);
      });
      card.addEventListener("mousemove", function (e) {
        updateMousePosition(card, e);
      });
      card.addEventListener("mouseleave", function () {
        card.style.setProperty("--x", "50%");
        card.style.setProperty("--y", "50%");
        pauseCard(card);
      });
    }
  });
})();
