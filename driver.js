(() => {
  const snazyFrame = document.getElementById("snazyFrame");
  const eyeFrame   = document.getElementById("eyeFrame");

  const btnSnazy = document.getElementById("btnSnazy");
  const btnEye   = document.getElementById("btnEye");

  const bridgeState = document.getElementById("bridgeState");
  const feedState   = document.getElementById("feedState");
  const xyState     = document.getElementById("xyState");

  // ===================== CONFIG =====================
  // Match SnazyCam default dwell time:
  const HOVER_TIME_MS = 1500;
  const CLICK_COOLDOWN_MS = 800;

  // Optional: require the cursor to stay within a small radius to count as "hover stable"
  const STABILITY_RADIUS_PX = 10;

  // ==================================================

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

    // Cursor overlay (driver-owned)
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

    // Highlight style
    if (!doc.getElementById("__knowsnav_hover_style")) {
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

    return true;
  }

  // ---------------- Coordinate mapping ----------------
  function mapXY(snazyXY, snazyWin, eyeWin) {
    const sx = snazyWin.innerWidth  || 1;
    const sy = snazyWin.innerHeight || 1;
    const ex = eyeWin.innerWidth    || 1;
    const ey = eyeWin.innerHeight   || 1;
    return { x: snazyXY.x * (ex / sx), y: snazyXY.y * (ey / sy) };
  }

  // ---------------- Hover/click helpers ----------------
  function isClickable(el) {
    if (!el) return false;
    if (el.disabled) return false;

    const tag = (el.tagName || "").toLowerCase();
    if (tag === "button" || tag === "a" || tag === "input" || tag === "select" || tag === "textarea") return true;

    // data / class conventions
    if (el.dataset && (el.dataset.hoverClick != null)) return true;
    if (el.classList && el.classList.contains("clickable")) return true;

    // inline handler
    if (el.getAttribute && el.getAttribute("onclick")) return true;

    return false;
  }

  function findClickable(el) {
    let cur = el;
    for (let i = 0; i < 8 && cur; i++) {
      if (isClickable(cur)) return cur;

      // try closest common clickable selectors
      if (cur.closest) {
        const c = cur.closest("button,a,input,select,textarea,[data-hover-click],.clickable");
        if (c) return c;
      }
      cur = cur.parentElement;
    }
    return null;
  }

  function setHighlight(el, on) {
    if (!el) return;
    try {
      if (on) el.classList.add("gaze-hover");
      else el.classList.remove("gaze-hover");
    } catch {}
  }

  function dispatchMouse(eyeWin, type, target, x, y) {
    const e = new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      view: eyeWin,
      clientX: x,
      clientY: y
    });
    target.dispatchEvent(e);
  }

  function dispatchPointer(eyeWin, type, target, x, y) {
    // PointerEvent isn't supported in some older contexts; fall back gracefully
    try {
      const e = new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        view: eyeWin,
        clientX: x,
        clientY: y,
        pointerId: 1,
        pointerType: "mouse",
        isPrimary: true
      });
      target.dispatchEvent(e);
    } catch {
      // no-op
    }
  }

  function performDwellClick(eyeWin, el, x, y) {
    // Realistic sequence: pointerdown/mousedown -> pointerup/mouseup -> click
    try { el.focus?.(); } catch {}

    // Some UIs rely on hover state first
    dispatchPointer(eyeWin, "pointerover", el, x, y);
    dispatchMouse(eyeWin, "mouseover", el, x, y);
    dispatchMouse(eyeWin, "mouseenter", el, x, y);

    dispatchPointer(eyeWin, "pointerdown", el, x, y);
    dispatchMouse(eyeWin, "mousedown", el, x, y);

    dispatchPointer(eyeWin, "pointerup", el, x, y);
    dispatchMouse(eyeWin, "mouseup", el, x, y);

    dispatchMouse(eyeWin, "click", el, x, y);
  }

  // ---------------- Hover state machine ----------------
  let hoverEl = null;
  let hoverStart = 0;
  let lastClickTime = 0;

  let lastPos = { x: 0, y: 0 };
  let stableSince = 0;

  function updateStability(now, x, y) {
    const dx = x - lastPos.x;
    const dy = y - lastPos.y;
    const dist = Math.sqrt(dx*dx + dy*dy);

    lastPos = { x, y };

    if (dist <= STABILITY_RADIUS_PX) {
      if (!stableSince) stableSince = now;
    } else {
      stableSince = 0;
    }
  }

  function hoverTick(eyeWin, x, y) {
    const now = performance.now();
    updateStability(now, x, y);

    const doc = eyeWin.document;
    if (!doc) return;

    // Feed realistic movement into EyeWrite regardless (helps its own hover logic)
    dispatchPointer(eyeWin, "pointermove", doc, x, y);
    dispatchMouse(eyeWin, "mousemove", doc, x, y);

    // Find element under point
    const raw = doc.elementFromPoint(x, y);
    const target = findClickable(raw);

    if (!target) {
      if (hoverEl) setHighlight(hoverEl, false);
      hoverEl = null;
      hoverStart = 0;
      return;
    }

    if (target !== hoverEl) {
      // transition
      if (hoverEl) {
        setHighlight(hoverEl, false);
        // send leave events on old element
        dispatchMouse(eyeWin, "mouseleave", hoverEl, x, y);
        dispatchPointer(eyeWin, "pointerout", hoverEl, x, y);
      }

      hoverEl = target;
      hoverStart = now;
      setHighlight(hoverEl, true);

      // send enter events on new element (this is key for EyeWrite-style hover systems)
      dispatchPointer(eyeWin, "pointerover", hoverEl, x, y);
      dispatchMouse(eyeWin, "mouseover", hoverEl, x, y);
      dispatchMouse(eyeWin, "mouseenter", hoverEl, x, y);

      return;
    }

    // Same element: dwell logic
    const elapsed = now - hoverStart;
    const cooledDown = (now - lastClickTime) >= CLICK_COOLDOWN_MS;
    const stableEnough = stableSince && (now - stableSince) >= 120; // tiny stability gate

    if (elapsed >= HOVER_TIME_MS && cooledDown && stableEnough) {
      performDwellClick(eyeWin, hoverEl, x, y);
      lastClickTime = now;

      // reset hover timer so it doesn't rapid-fire
      hoverStart = now;
      stableSince = 0;
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

      // Update EyeWrite overlay cursor + readout
      const doc = eyeWin.document;
      const cursor = doc.getElementById("__knowsnav_cursor");
      const readout = doc.getElementById("__knowsnav_xy");

      if (cursor) { cursor.style.left = `${mapped.x}px`; cursor.style.top = `${mapped.y}px`; }
      if (readout) { readout.textContent = `X: ${tx}, Y: ${ty}`; }

      xyState.textContent = `${tx}, ${ty}`;
      feedState.textContent = "live";
      lastGood = performance.now();

      // Only interact when EyeWrite is the active layer (recommended)
      const snazyFront = document.body.classList.contains("snazy-front");
      if (!snazyFront) {
        hoverTick(eyeWin, mapped.x, mapped.y);
      }

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
