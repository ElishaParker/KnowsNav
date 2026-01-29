// hoverClick.js — rectangle hit-test + dwell-based click with cooldown and panel-visibility filtering
(() => {
  // --- Configurable timing ---
  window.HOVER_TIME    = window.HOVER_TIME    ?? 1500;
  window.CURSOR_RADIUS = window.CURSOR_RADIUS ?? 15;
  const HOVER_OUT_GRACE = 10;
  const COOLDOWN_MS = 800; // delay after click before rearming same element

  // --- Visual highlight style ---
  const style = document.createElement("style");
  style.textContent = `
    .gaze-hover {
      outline: 2px solid #00ffff !important;
      box-shadow: 0 0 10px #00ffff88 !important;
      transition: box-shadow 0.08s ease;
    }
  `;
  document.head.appendChild(style);

  // --- Progress wheel ---
  const wheel = document.createElement("div");
  Object.assign(wheel.style, {
    position: "fixed",
    width: "40px",
    height: "40px",
    border: "3px solid rgba(0,255,255,0.3)",
    borderTopColor: "#00ffff",
    borderRadius: "50%",
    pointerEvents: "none",
    opacity: 0,
    zIndex: 6,
    transform: "rotate(0deg)",
    transition: "opacity 0.15s ease, transform 0.08s linear",
    left: "-9999px",
    top: "-9999px",
  });
  document.body.appendChild(wheel);

  const updateWheel = (x, y, progress) => {
    wheel.style.left = `${x - 20}px`;
    wheel.style.top  = `${y - 20}px`;
    wheel.style.transform = `rotate(${progress * 360}deg)`;
    wheel.style.opacity = progress > 0 ? 1 : 0;
  };

  // --- State tracking ---
  let activeEl = null;
  let hoverStart = 0;
  let progress = 0;

  const CLICK_SELECTOR = "button, [onclick], [data-hover-click], input, .clickable";
  let clickables = [];

  // --- Gather clickable elements ---
  function refreshClickables() {
    clickables = Array.from(document.querySelectorAll(CLICK_SELECTOR)).filter(el => {
      const style = window.getComputedStyle(el);

      // skip elements that are not visually interactable
      if (style.display === "none" || style.visibility === "hidden") return false;

      // skip elements inside a hidden panel (opacity 0 or pointer-events none)
      let parent = el;
      while (parent && parent !== document.body) {
        const ps = window.getComputedStyle(parent);
        if (ps.opacity === "0" || ps.pointerEvents === "none") {
          // Optional debug logging — shows when hidden elements are skipped
          console.log("Skipping hidden element:", el);
          return false;
        }
        parent = parent.parentElement;
      }

      return el.offsetParent !== null || style.position === "fixed";
    });
  }
  refreshClickables();

  const mo = new MutationObserver(refreshClickables);
  mo.observe(document.body, { childList: true, subtree: true, attributes: true });

  // --- Utility ---
  const insideRect = (x, y, rect, radius) => {
    const left = rect.left - radius;
    const right = rect.right + radius;
    const top = rect.top - radius;
    const bottom = rect.bottom + radius;
    return x >= left && x <= right && y >= top && y <= bottom;
  };

  // --- Main loop ---
  function loop() {
    const sc = window.smoothedCursor;
    if (!sc || typeof sc.x !== "number" || typeof sc.y !== "number") {
      requestAnimationFrame(loop);
      return;
    }

    const x = sc.x;
    const y = sc.y;

    updateWheel(x, y, progress);

    // --- If already dwelling on an element ---
    if (activeEl) {
      const rect = activeEl.getBoundingClientRect();
      if (insideRect(x, y, rect, Math.max(window.CURSOR_RADIUS, HOVER_OUT_GRACE))) {
        const elapsed = performance.now() - hoverStart;
        progress = Math.min(elapsed / window.HOVER_TIME, 1);
        updateWheel(x, y, progress);

        if (progress >= 1) {
          // Trigger click once, then cooldown
          activeEl.click();
          const clickedEl = activeEl;
          clickedEl.classList.remove("gaze-hover");
          clickedEl.dataset.cooldownUntil = performance.now() + COOLDOWN_MS;

          // Reset
          activeEl = null;
          hoverStart = 0;
          progress = 0;
          updateWheel(x, y, 0);
        }

        requestAnimationFrame(loop);
        return;
      } else {
        // Cursor left element
        activeEl.classList.remove("gaze-hover");
        activeEl = null;
        progress = 0;
        updateWheel(x, y, 0);
      }
    }

    // --- Find new hover target (respecting cooldown) ---
    let found = null;
    for (const el of clickables) {
      const until = parseFloat(el.dataset.cooldownUntil || 0);
      if (performance.now() < until) continue; // skip if still cooling down
      const rect = el.getBoundingClientRect();
      if (insideRect(x, y, rect, window.CURSOR_RADIUS)) {
        found = el;
        break;
      }
    }

    // --- Start dwell on new element ---
    if (found) {
      activeEl = found;
      activeEl.classList.add("gaze-hover");
      hoverStart = performance.now();
      progress = 0;
      updateWheel(x, y, 0);
    } else {
      progress = 0;
      updateWheel(x, y, 0);
    }

    requestAnimationFrame(loop);
  }

  loop();
})();
