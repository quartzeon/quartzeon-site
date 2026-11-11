// Cover-flow carousel: wheel or drag to spin, slow auto-rotate when idle,
// click the centre card to open it.
(function () {
  var AUTO_SPEED = 0.16;     // cards per second while idle
  var IDLE_MS = 1800;        // wait after the last interaction before auto-rotating
  var SNAP_MS = 160;         // wait after the last wheel tick before snapping

  function mount(root, items) {
    var stage = root.querySelector(".cf-stage");
    var caption = root.querySelector(".cf-caption");
    var kindEl = root.querySelector(".cf-kind");
    var titleEl = root.querySelector(".cf-title");
    var n = items.length;
    if (!n) { root.classList.add("is-empty"); return; }

    var reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var cards = items.map(function (item, i) {
      var card = document.createElement("div");
      card.className = "cf-card";
      card.dataset.index = String(i);
      var img = document.createElement("img");
      img.alt = "";
      img.decoding = "async";
      img.draggable = false;
      if (item.fallback) {
        // YouTube answers a missing HD thumbnail with a tiny 120x90 placeholder
        // instead of an error, so treat that size as missing too.
        var useFallback = function () {
          img.removeEventListener("error", useFallback);
          img.removeEventListener("load", checkSize);
          img.src = item.fallback;
        };
        var checkSize = function () { if (img.naturalWidth <= 120) useFallback(); };
        img.addEventListener("error", useFallback);
        img.addEventListener("load", checkSize);
      }
      img.src = item.image;
      card.appendChild(img);
      if (item.kind === "Video") {
        var play = document.createElement("span");
        play.className = "cf-play glass";
        play.setAttribute("aria-hidden", "true");
        play.textContent = "▶";
        card.appendChild(play);
      }
      var dim = document.createElement("span");
      dim.className = "cf-dim";
      card.appendChild(dim);
      stage.appendChild(card);
      return { el: card, dim: dim };
    });

    var pos = 0, target = 0, spacing = 220;
    var lastInteract = 0, lastWheel = 0, snapped = true;
    var centre = -1, running = false, visible = true, last = 0;
    var drag = null;

    function wrap(d) {
      d = ((d % n) + n) % n;
      return d > n / 2 ? d - n : d;
    }
    function measure() {
      spacing = cards[0].el.offsetWidth * 0.68;
    }
    function open(i) {
      var item = items[i];
      if (item.external) window.open(item.href, "_blank", "noopener");
      else window.location.href = item.href;
    }

    function render() {
      for (var i = 0; i < n; i++) {
        var d = wrap(i - pos);
        var a = Math.abs(d);
        var s = d < 0 ? -1 : 1;
        var x = s * spacing * (a <= 1 ? a : 1 + (a - 1) * 0.62);
        var scale = 1 - 0.15 * Math.min(a, 3.5);
        var rot = -Math.max(-1, Math.min(1, d)) * 14;
        var c = cards[i];
        c.el.style.transform = "translate(-50%, -50%) translateX(" + x.toFixed(1) + "px) rotateY(" + rot.toFixed(2) + "deg) scale(" + scale.toFixed(3) + ")";
        c.el.style.zIndex = String(Math.round(100 - a * 10));
        c.el.style.opacity = a > 3.2 ? String(Math.max(0, 1 - (a - 3.2) * 2)) : "1";
        c.dim.style.opacity = String(Math.min(a, 3) * 0.17);
      }
      var now = ((Math.round(pos) % n) + n) % n;
      if (now !== centre) {
        if (centre >= 0) cards[centre].el.classList.remove("is-center");
        centre = now;
        cards[centre].el.classList.add("is-center");
        var item = items[centre];
        kindEl.textContent = item.kind;
        titleEl.textContent = item.title;
        caption.href = item.href;
        if (item.external) { caption.target = "_blank"; caption.rel = "noopener noreferrer"; }
        else { caption.removeAttribute("target"); caption.removeAttribute("rel"); }
      }
    }

    function frame(t) {
      if (!running) return;
      var dt = last ? Math.min(0.05, (t - last) / 1000) : 0;
      last = t;
      var now = performance.now();
      if (!snapped && !drag && now - lastWheel > SNAP_MS) {
        target = Math.round(target);
        snapped = true;
      }
      if (!reducedMotion && !drag && now - lastInteract > IDLE_MS) {
        target += AUTO_SPEED * dt;
      }
      pos += (target - pos) * (reducedMotion ? 1 : Math.min(1, dt * 9));
      render();
      requestAnimationFrame(frame);
    }
    function start() {
      if (running || !visible || document.hidden) return;
      running = true;
      last = 0;
      requestAnimationFrame(frame);
    }
    function stop() { running = false; }
    function touch() { lastInteract = performance.now(); }
    function step(by) {
      touch();
      target = Math.round(target) + by;
    }

    root.addEventListener("wheel", function (e) {
      e.preventDefault();
      var delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (e.deltaMode === 1) delta *= 33;
      target += delta * 0.0045;
      lastWheel = performance.now();
      snapped = false;
      touch();
    }, { passive: false });

    stage.addEventListener("pointerdown", function (e) {
      if (e.button !== 0) return;
      var card = e.target.closest(".cf-card");
      drag = { x: e.clientX, start: target, moved: false, card: card ? Number(card.dataset.index) : -1, id: e.pointerId };
      touch();
    });
    window.addEventListener("pointermove", function (e) {
      if (!drag || e.pointerId !== drag.id) return;
      var dx = e.clientX - drag.x;
      if (Math.abs(dx) > 6) drag.moved = true;
      if (drag.moved) { target = drag.start - dx / spacing; touch(); }
    });
    window.addEventListener("pointerup", function (e) {
      if (!drag || e.pointerId !== drag.id) return;
      var d = drag;
      drag = null;
      touch();
      if (d.moved) { target = Math.round(target); return; }
      if (d.card < 0) return;
      if (d.card === centre) open(d.card);
      else target = Math.round(target) + Math.round(wrap(d.card - pos));
    });
    window.addEventListener("pointercancel", function () {
      if (drag) { drag = null; target = Math.round(target); }
    });

    root.addEventListener("keydown", function (e) {
      if (e.key === "ArrowRight") { e.preventDefault(); step(1); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); step(-1); }
      else if (e.key === "Enter" && e.target === root) { open(centre); }
    });
    root.querySelector(".cf-prev").addEventListener("click", function () { step(-1); });
    root.querySelector(".cf-next").addEventListener("click", function () { step(1); });

    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (entries) {
        visible = entries[0].isIntersecting;
        if (visible) start(); else stop();
      }).observe(root);
    }
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) stop(); else start();
    });
    window.addEventListener("resize", measure);

    measure();
    render();
    start();
  }

  window.QECoverflow = { mount: mount };
})();
