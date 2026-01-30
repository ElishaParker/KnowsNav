(() => {
  const snazyFrame = document.getElementById("snazyFrame");
  const eyeFrame   = document.getElementById("eyeFrame");

  const btnSnazy = document.getElementById("btnSnazy");
  const btnEye   = document.getElementById("btnEye");

  const bridgeState = document.getElementById("bridgeState");
  const feedState   = document.getElementById("feedState");
  const xyState     = document.getElementById("xyState");

  // ---------------- Layer toggle ----------------
  function bringSnazyFront() {
    document.body.classList.add("snazy-front");
    btnSnazy.classList.add("hidden");
    btnEye.classList.remove("hidden");
  }
  function bringEyeFront() {
    document.body.classList.remove("snazy-front");
    btnEye.classList.add("hidden");
    btnSnazy.classList.remove("hidden");
  }
  btnSnazy.addEventListener("click", bringSnazyFront);
  btnEye.addEventListener("click", bringEyeFront);

  // ---------------- EyeWrite overlay injection ----------------
  function ensureEyewriteInjected(eyeWin) {
    const doc = eyeWin.document;
    if (!doc || !doc.body) return false;

    if (!doc.getElementById("__knowsnav_cursor")) {
      const cursor = doc.createElement("div");
      cursor.id = "__knowsnav_cursor";
      Object.assign(cursor.style, {
        position: "fixed",
        left: "0px",
        top: "0px",
        width: "44px",
        height: "44px",
        borderRadius: "50%",
        border: "3px solid rgba(0,255,255,0.95)",
        boxShadow: "0 0 18px rgba(0,255,255,0.35)",
        transform: "translate(-50%, -50%)",
        pointerEvents: "none",
        zIndex: "2147483647"
      });
      doc.body.appendChild(cursor);

      const readout = doc.createElement("div");
      readout.id = "__knowsnav_xy";
      Object.assign(readout.style, {
        position: "fixed",
        left: "12px",
        top: "12px",
        padding: "8px 10px",
        borderRadius: "10px",
        background: "rgba(0,0,0,0.65)",
        border: "1px solid rgba(0,255,255,0.55)",
        color: "#00ffff",
        fontFamily: "ui-monospace, Menlo, Consolas, monospace",
        fontSize: "14px",
        zIndex: "2147483647",
        pointerEvents: "none"
      });
      readout.textContent = "X: —, Y: —";
      doc.body.appendChild(readout);
    }

    return true;
  }

  function mapXY(snazyXY, snazyWin, eyeWin) {
    const sx = snazyWin.innerWidth  || 1;
    const sy = snazyWin.innerHeight || 1;
    const ex = eyeWin.innerWidth    || 1;
    const ey = eyeWin.innerHeight   || 1;
    return { x: snazyXY.x * (ex / sx), y: snazyXY.y * (ey / sy) };
  }

  // ---------------- Driver HoverClick ----------------
  const HOVER_TIME_MS = 900;      // start here; tune later
  const CLICK_COOLDOWN_MS = 700;

  let hoverEl = null;
  let hoverStart = 0;
  let lastClickTime = 0;

  function isClickable(el) {
    if (!el) return false;
    if (el.disabled) return false;

    const tag = (el.tagName || "").toLowerCase();
    if (tag === "button" || tag === "a" || tag === "input" || tag === "select" || tag === "textarea") return true;

    // common patterns
    if (el.getAttribute && (el.getAttribute("onclick") != null)) return true;
    if (el.classList && el.classList.contains("clickable")) return true;
    if (el.dataset && (el.dataset.hoverClick != null)) return true;

    // climb a bit (sometimes inner spans)
    return false;
  }

  function findClickableUp(el) {
    let cur = el;
    for (let i = 0; i < 6 && cur; i++) {
      if (isClickable(cur)) return cur;
      cur = cur.parentElement;
    }
    return null;
  }

  // optional visual highlight
  function setHighlight(el, on) {
    if (!el) return;
    try {
      if (on) el.classList.add("gaze-hover");
      else el.classList.remove("gaze-hover");
    } catch {}
  }

  function ensureHighlightCSS(eyeWin) {
    const doc = eyeWin.document;
    if (!doc || doc.getElementById("__knowsnav_hover_style")) return;
    const style = doc.createElement("style");
    style.id = "__knowsnav_hover_style";
    style.textContent = `
      .gaze-hover {
        outline: 2px solid rgba(0,255,255,0.95) !important;
        box-shadow: 0 0 10px rgba(0,255,255,0.35) !important;
      }
    `;
    doc.head.appendChild(style);
  }

  function hoverClickTick(eyeWin, x, y) {
    const now = performance.now();
    if (now - lastClickTime < CLICK_COOLDOWN_MS) {
      // cooldown: keep state but don’t click
    }

    const doc = eyeWin.document;
    if (!doc) return;

    // elementFromPoint expects viewport coords
    const raw = doc.elementFromPoint(x, y);
    const target = findClickableUp(raw);

    if (!target) {
      if (hoverEl) setHighlight(hoverEl, false);
      hoverEl = null;
      hoverStart = 0;
      return;
    }

    if (target !== hoverEl) {
      if (hoverEl) setHighlight(hoverEl, false);
      hoverEl = target;
      hoverStart = now;
      setHighlight(hoverEl, true);
      return;
    }

    // same element: dwell
    const elapsed = now - hoverStart;
    if (elapsed >= HOVER_TIME_MS && (now - lastClickTime >= CLICK_COOLDOWN_MS)) {
      try {
        hoverEl.click();
        lastClickTime = now;
      } catch {}
      // reset dwell so it doesn’t machine-gun click
      hoverStart = now + 999999;
      setTimeout(() => {
        hoverStart = performance.now();
      }, CLICK_COOLDOWN_MS);
    }
  }

  // ---------------- Main bridge loop ----------------
  let lastGood = 0;

  function tick() {
    try {
      const snazyWin = snazyFrame.contentWindow;
      const eyeWin   = eyeFrame.contentWindow;

      if (!snazyWin || !eyeWin) {
        bridgeState.textContent = "waiting for frames…";
        requestAnimationFrame(tick);
        return;
      }

      const injected = ensureEyewriteInjected(eyeWin);
      ensureHighlightCSS(eyeWin);
      bridgeState.textContent = injected ? "ready" : "injecting…";

      const sc = snazyWin.smoothedCursor;
      if (!sc || typeof sc.x !== "number" || typeof sc.y !== "number") {
        feedState.textContent = "SnazyCam feed not ready";
        requestAnimationFrame(tick);
        return;
      }

      const mapped = mapXY({ x: sc.x, y: sc.y }, snazyWin, eyeWin);
      const tx = Math.round(mapped.x);
      const ty = Math.round(mapped.y);

      const doc = eyeWin.document;
      const cursor = doc.getElementById("__knowsnav_cursor");
      const readout = doc.getElementById("__knowsnav_xy");

      if (cursor) { cursor.style.left = `${mapped.x}px`; cursor.style.top = `${mapped.y}px`; }
      if (readout) { readout.textContent = `X: ${tx}, Y: ${ty}`; }

      xyState.textContent = `${tx}, ${ty}`;
      feedState.textContent = "live";
      lastGood = performance.now();

      // Only hover-click when EyeWrite is on top (optional but recommended)
      // If SnazyCam is front, disable clicking to avoid accidental actions.
      const snazyFront = document.body.classList.contains("snazy-front");
      if (!snazyFront) hoverClickTick(eyeWin, mapped.x, mapped.y);

    } catch {
      feedState.textContent = "bridge error (looping)";
    }

    requestAnimationFrame(tick);
  }

  setInterval(() => {
    const age = performance.now() - lastGood;
    if (lastGood === 0) return;
    if (age > 500) feedState.textContent = `stale (${Math.round(age)}ms)`;
  }, 250);

  tick();
})();
