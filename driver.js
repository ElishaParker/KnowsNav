(() => {
  const snazyFrame = document.getElementById("snazyFrame");
  const eyeFrame   = document.getElementById("eyeFrame");

  const btnSnazy = document.getElementById("btnSnazy");
  const btnEye   = document.getElementById("btnEye");

  const bridgeState = document.getElementById("bridgeState");
  const feedState   = document.getElementById("feedState");
  const xyState     = document.getElementById("xyState");

  // ===================== CONFIG =====================
  const HOVER_TIME_MS = 1500;        // match SnazyCam
  const CLICK_COOLDOWN_MS = 900;     // prevents rapid repeat clicks
  const RETARGET_RADIUS_PX = 20;     // move more than this to unlock/re-target
  const MOVE_EVENT_HZ = 30;          // reduce event spam
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

  // ---------------- Event helpers ----------------
  function dispatchMouse(eyeWin, target, type, x, y) {
    const e = new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      view: eyeWin,
      clientX: x,
      clientY: y
    });
    target.dispatchEvent(e);
  }

  function dispatchPointer(eyeWin, target, type, x, y) {
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
      // ignore
    }
  }

  function focusElement(el) {
    try { el.focus?.({ preventScroll: true }); } catch {}
  }

  // ---------------- Clickable detection ----------------
  function isClickable(el) {
    if (!el) return false;
    if (el.disabled) return false;

    const tag = (el.tagName || "").toLowerCase();
    if (tag === "button" || tag === "a") return true;

    // Inputs/selects/textareas should be treated as targets too
    if (tag === "input" || tag === "textarea" || tag === "select") return true;

    // contenteditable targets
    if (el.isContentEditable) return true;

    // role=button patterns
    const role = el.getAttribute?.("role");
    if (role === "button" || role === "menuitem") return true;

    if (el.getAttribute?.("onclick")) return true;
    if (el.classList?.contains("clickable")) return true;
    if (el.dataset && (el.dataset.hoverClick != null)) return true;

    return false;
  }

  function findTarget(el) {
    if (!el) return null;
    // try closest first
    if (el.closest) {
      const c = el.closest("button,a,input,textarea,select,[role='button'],[role='menuitem'],[contenteditable='true'],.clickable,[data-hover-click]");
      if (c) return c;
    }
    // fallback climb
    let cur = el;
    for (let i = 0; i < 10 && cur; i++) {
      if (isClickable(cur)) return cur;
      cur = cur.parentElement;
    }
    return null;
  }

  // ---------------- Hover target lock state machine ----------------
  let lockedEl = null;
  let lockedAt = 0;
  let lastClickAt = 0;
  let lockPos = { x: 0, y: 0 };

  function setHighlight(el, on) {
    if (!el) return;
    try {
      if (on) el.classList.add("gaze-hover");
      else el.classList.remove("gaze-hover");
    } catch {}
  }

  function lockOn(el, x, y) {
    if (lockedEl && lockedEl !== el) setHighlight(lockedEl, false);
    lockedEl = el;
    lockedAt = performance.now();
    lockPos = { x, y };
    if (lockedEl) setHighlight(lockedEl, true);
  }

  function unlock() {
    if (lockedEl) setHighlight(lockedEl, false);
    lockedEl = null;
    lockedAt = 0;
  }

  function dist(a, b) {
    const dx = a.x - b.x, dy = a.y - b.y;
    return Math.sqrt(dx*dx + dy*dy);
  }

  function performLockedClick(eyeWin, el, x, y) {
    // Focus first so inputs/textareas can accept typing
    focusElement(el);

    // Enter/over helps some hover systems
    dispatchPointer(eyeWin, el, "pointerover", x, y);
    dispatchMouse(eyeWin, el, "mouseover", x, y);
    dispatchMouse(eyeWin, el, "mouseenter", x, y);

    // Down/up/click sequence
    dispatchPointer(eyeWin, el, "pointerdown", x, y);
    dispatchMouse(eyeWin, el, "mousedown", x, y);

    dispatchPointer(eyeWin, el, "pointerup", x, y);
    dispatchMouse(eyeWin, el, "mouseup", x, y);

    dispatchMouse(eyeWin, el, "click", x, y);
  }

  // Reduce event spam: only send move events at MOVE_EVENT_HZ
  let lastMoveSent = 0;

  function hoverController(eyeWin, x, y) {
    const now = performance.now();
    const doc = eyeWin.document;
    if (!doc) return;

    // send basic movement into EyeWrite (helps its own logic)
    const interval = 1000 / MOVE_EVENT_HZ;
    if (now - lastMoveSent >= interval) {
      lastMoveSent = now;
      dispatchPointer(eyeWin, doc, "pointermove", x, y);
      dispatchMouse(eyeWin, doc, "mousemove", x, y);
    }

    // If we have a locked target, keep it until user moves far enough
    if (lockedEl) {
      if (dist({ x, y }, lockPos) > RETARGET_RADIUS_PX) {
        unlock();
        // fall through to reacquire
      } else {
        const dwell = now - lockedAt;
        const cooled = (now - lastClickAt) >= CLICK_COOLDOWN_MS;
        if (dwell >= HOVER_TIME_MS && cooled) {
          performLockedClick(eyeWin, lockedEl, x, y);
          lastClickAt = now;
          // keep it locked but restart dwell timer
          lockedAt = now;
          lockPos = { x, y };
        }
        return;
      }
    }

    // Acquire new target under point
    const raw = doc.elementFromPoint(x, y);
    const target = findTarget(raw);

    if (!target) {
      unlock();
      return;
    }

    // lock immediately when highlighted
    lockOn(target, x, y);
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

      const doc = eyeWin.document;
      const cursor = doc.getElementById("__knowsnav_cursor");
      const readout = doc.getElementById("__knowsnav_xy");

      if (cursor) { cursor.style.left = `${mapped.x}px`; cursor.style.top = `${mapped.y}px`; }
      if (readout) { readout.textContent = `X: ${tx}, Y: ${ty}`; }

      xyState.textContent = `${tx}, ${ty}`;
      feedState.textContent = "live";
      lastGood = performance.now();

      // Only interact when EyeWrite is active layer
      const snazyFront = document.body.classList.contains("snazy-front");
      if (!snazyFront) {
        hoverController(eyeWin, mapped.x, mapped.y);
      } else {
        // If SnazyCam is front, don’t leave a locked target stuck
        unlock();
      }

    } catch {
      feedState.textContent = "bridge error (looping)";
    }

    requestAnimationFrame(tick);
  }

  setInterval(() => {
    const age = performance.now() - lastGood;
    if (lastGood === 0) return;
    if (age > 700) feedState.textContent = `stale (${Math.round(age)}ms)`;
  }, 250);

  tick();
})();
