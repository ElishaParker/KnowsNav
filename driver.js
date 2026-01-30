(() => {
  const snazyFrame = document.getElementById("snazyFrame");
  const eyeFrame   = document.getElementById("eyeFrame");

  const btnSnazy = document.getElementById("btnSnazy");
  const btnEye   = document.getElementById("btnEye");

  const bridgeState = document.getElementById("bridgeState");
  const feedState   = document.getElementById("feedState");
  const xyState     = document.getElementById("xyState");

  // ===================== CONFIG =====================
  const HOVER_TIME_MS = 1500;              // dwell time
  const CLICK_COOLDOWN_MS = 650;           // global cooldown
  const REQUIRE_MOVE_TO_RECLICK = true;    // must move off element to click again
  const UNLOCK_RADIUS_PX = 22;             // move distance to unlock
  const RETARGET_STABLE_MS = 140;          // reduce edge flicker
  const MOVE_EVENT_HZ = 30;

  const X_OFFSET = 0;
  const Y_OFFSET = 0;

  // Critical: prevents double letters by disabling EyeWrite's own hover click
  const AUTO_DISABLE_EYEWRITE_HOVER = true;
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

  // ---------------- Coordinate mapping ----------------
  function mapXY(snazyXY, snazyWin, eyeWin) {
    const sx = snazyWin.innerWidth  || 1;
    const sy = snazyWin.innerHeight || 1;
    const ex = eyeWin.innerWidth    || 1;
    const ey = eyeWin.innerHeight   || 1;
    return { x: snazyXY.x * (ex / sx), y: snazyXY.y * (ey / sy) };
  }

  // ---------------- Overlay injection ----------------
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

  // ---------------- Events ----------------
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
    } catch {}
  }

  function focusElement(el) {
    try { el.focus?.({ preventScroll: true }); } catch {}
    try { el.focus?.(); } catch {}
  }

  function setHighlight(el, on) {
    if (!el) return;
    try {
      if (on) el.classList.add("gaze-hover");
      else el.classList.remove("gaze-hover");
    } catch {}
  }

  // ---------------- Target detection ----------------
  function isInputLike(el) {
    if (!el) return false;
    const tag = (el.tagName || "").toLowerCase();
    return tag === "input" || tag === "textarea" || tag === "select" || el.isContentEditable;
  }

  function isClickable(el) {
    if (!el || el.disabled) return false;
    const tag = (el.tagName || "").toLowerCase();
    if (tag === "button" || tag === "a") return true;
    if (tag === "input" || tag === "textarea" || tag === "select") return true;
    if (el.isContentEditable) return true;
    const role = el.getAttribute?.("role");
    if (role === "button" || role === "menuitem") return true;
    if (el.getAttribute?.("onclick")) return true;
    if (el.classList?.contains("clickable")) return true;
    if (el.dataset && (el.dataset.hoverClick != null)) return true;
    return false;
  }

  function findTarget(el) {
    if (!el) return null;
    if (el.closest) {
      // prefer inputs/selects/textareas
      const inputPref = el.closest("textarea,input,[contenteditable='true'],select");
      if (inputPref) return inputPref;

      const c = el.closest("button,a,[role='button'],[role='menuitem'],.clickable,[data-hover-click]");
      if (c) return c;
    }
    let cur = el;
    for (let i = 0; i < 10 && cur; i++) {
      if (isClickable(cur)) return cur;
      cur = cur.parentElement;
    }
    return null;
  }

  // ---------------- Bug #1 caret placement (contenteditable only) ----------------
  // (EyeWrite’s text area behaves like contenteditable in most builds)
  function setCaretAtPoint(eyeWin, el, x, y) {
    const doc = eyeWin.document;

    if (!el.isContentEditable) return;

    const sel = eyeWin.getSelection?.();
    if (!sel) return;

    let range = null;

    if (doc.caretRangeFromPoint) {
      range = doc.caretRangeFromPoint(x, y);
    } else if (doc.caretPositionFromPoint) {
      const pos = doc.caretPositionFromPoint(x, y);
      if (pos) {
        range = doc.createRange();
        range.setStart(pos.offsetNode, pos.offset);
        range.collapse(true);
      }
    }

    if (range) {
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }

  // ---------------- Voice popup (triggered by the real dropdown) ----------------
  function closeVoicePopup() {
    const existing = document.getElementById("voicePopup");
    if (existing) existing.remove();
  }

  function openVoicePopupFromSelect(selectEl) {
    closeVoicePopup();

    const overlay = document.getElementById("driverOverlay");
    if (!overlay) return;

    const popup = document.createElement("div");
    popup.id = "voicePopup";

    const header = document.createElement("div");
    header.id = "voicePopupHeader";

    const title = document.createElement("div");
    title.className = "title";
    title.textContent = "Select Voice";

    const closeBtn = document.createElement("button");
    closeBtn.id = "voicePopupClose";
    closeBtn.textContent = "Close";
    closeBtn.addEventListener("click", closeVoicePopup);

    header.appendChild(title);
    header.appendChild(closeBtn);
    popup.appendChild(header);

    const opts = Array.from(selectEl.options || []);
    opts.forEach((opt) => {
      const item = document.createElement("div");
      item.className = "voiceItem";
      item.textContent = opt.textContent;

      item.addEventListener("click", () => {
        try {
          selectEl.value = opt.value;
          selectEl.dispatchEvent(new Event("change", { bubbles: true }));
        } catch {}
        closeVoicePopup();
      });

      popup.appendChild(item);
    });

    // Insert popup ABOVE status (at top of overlay stack)
    overlay.insertBefore(popup, overlay.firstChild);
  }

  // ---------------- Auto disable EyeWrite hover (prevents double letters) ----------------
  let hoverToggledOff = false;

  function disableEyewriteHoverIfOn(eyeWin) {
    if (!AUTO_DISABLE_EYEWRITE_HOVER || hoverToggledOff) return;

    const doc = eyeWin.document;
    if (!doc) return;

    // Find a button containing "Hover ON"
    const buttons = Array.from(doc.querySelectorAll("button,div"));
    const hoverEl = buttons.find(el => (el.textContent || "").trim() === "Hover ON");

    if (hoverEl) {
      try {
        hoverEl.click();
        hoverToggledOff = true;
      } catch {}
    }
  }

  // ---------------- Locked hover engine ----------------
  let lockedEl = null;
  let lockedAt = 0;
  let lockPos = { x: 0, y: 0 };

  let lastClickAt = 0;
  let lastClickedEl = null;

  let pendingEl = null;
  let pendingSince = 0;

  function lockOn(el, x, y) {
    if (lockedEl && lockedEl !== el) setHighlight(lockedEl, false);
    lockedEl = el;
    lockedAt = performance.now();
    lockPos = { x, y };
    setHighlight(lockedEl, true);
  }

  function unlock() {
    if (lockedEl) setHighlight(lockedEl, false);
    if (lockedEl && lockedEl === lastClickedEl) lastClickedEl = null;
    lockedEl = null;
    lockedAt = 0;
    pendingEl = null;
    pendingSince = 0;
  }

  function distance(a, b) {
    const dx = a.x - b.x, dy = a.y - b.y;
    return Math.sqrt(dx*dx + dy*dy);
  }

  // Click protocol:
  // - keys/buttons: ONE click only
  // - contenteditable: focus + caret placement + ONE click (for activation)
  // - select: open our popup and DO NOT rely on native open
  function clickElement(eyeWin, el, x, y) {
    const tag = (el.tagName || "").toLowerCase();

    // Select dropdown -> popup list
    if (tag === "select") {
      focusElement(el);
      openVoicePopupFromSelect(el);
      return;
    }

    // contenteditable text area -> set caret at point
    if (el.isContentEditable) {
      focusElement(el);
      // single click to keep EyeWrite logic consistent
      dispatchMouse(eyeWin, el, "click", x, y);
      setCaretAtPoint(eyeWin, el, x, y);
      return;
    }

    // inputs/textarea (if present)
    if (tag === "input" || tag === "textarea") {
      focusElement(el);
      dispatchMouse(eyeWin, el, "click", x, y);
      return;
    }

    // keys/buttons -> single click only
    dispatchMouse(eyeWin, el, "click", x, y);
    focusElement(el);
  }

  // Throttle move events
  let lastMoveSent = 0;

  function hoverController(eyeWin, x, y) {
    const now = performance.now();
    const doc = eyeWin.document;
    if (!doc) return;

    // movement events
    const interval = 1000 / MOVE_EVENT_HZ;
    if (now - lastMoveSent >= interval) {
      lastMoveSent = now;
      dispatchPointer(eyeWin, doc, "pointermove", x, y);
      dispatchMouse(eyeWin, doc, "mousemove", x, y);
    }

    // locked element flow
    if (lockedEl) {
      if (distance({ x, y }, lockPos) > UNLOCK_RADIUS_PX) {
        unlock();
      } else {
        const dwell = now - lockedAt;
        const cooled = (now - lastClickAt) >= CLICK_COOLDOWN_MS;

        if (dwell >= HOVER_TIME_MS && cooled) {
          if (REQUIRE_MOVE_TO_RECLICK && lastClickedEl === lockedEl) {
            return;
          }
          clickElement(eyeWin, lockedEl, x, y);
          lastClickAt = now;
          lastClickedEl = lockedEl;

          // restart dwell timer, keep lock until moved off
          lockedAt = now;
          lockPos = { x, y };
        }
        return;
      }
    }

    // acquire candidate
    const raw = doc.elementFromPoint(x, y);
    const target = findTarget(raw);

    if (!target) {
      pendingEl = null; pendingSince = 0;
      return;
    }

    // stable retarget
    if (!pendingEl || pendingEl !== target) {
      pendingEl = target;
      pendingSince = now;
      return;
    }

    if ((now - pendingSince) >= RETARGET_STABLE_MS) {
      lockOn(target, x, y);
      pendingEl = null; pendingSince = 0;
    }
  }

  // ---------------- Main loop ----------------
  let lastGood = 0;

  function tick() {
    try {
      const snazyWin = snazyFrame.contentWindow;
      const eyeWin   = eyeFrame.contentWindow;

      if (!snazyWin || !eyeWin) {
        bridgeState.textContent = "waiting…";
        requestAnimationFrame(tick);
        return;
      }

      const injected = ensureEyewriteInjected(eyeWin);
      bridgeState.textContent = injected ? "ready" : "injecting…";

      disableEyewriteHoverIfOn(eyeWin);

      const sc = snazyWin.smoothedCursor;
      if (!sc || typeof sc.x !== "number" || typeof sc.y !== "number") {
        feedState.textContent = "feed not ready";
        requestAnimationFrame(tick);
        return;
      }

      let mapped = mapXY({ x: sc.x, y: sc.y }, snazyWin, eyeWin);
      mapped.x += X_OFFSET;
      mapped.y += Y_OFFSET;

      const tx = Math.round(mapped.x);
      const ty = Math.round(mapped.y);

      // update cursor ring
      const doc = eyeWin.document;
      const cursor = doc.getElementById("__knowsnav_cursor");
      if (cursor) {
        cursor.style.left = `${mapped.x}px`;
        cursor.style.top  = `${mapped.y}px`;
      }

      xyState.textContent = `${tx}, ${ty}`;
      feedState.textContent = "live";
      lastGood = performance.now();

      // Only interact when EyeWrite is front
      const snazyFront = document.body.classList.contains("snazy-front");
      if (!snazyFront) {
        hoverController(eyeWin, mapped.x, mapped.y);
      } else {
        closeVoicePopup();
        unlock();
      }

    } catch {
      feedState.textContent = "bridge error";
    }

    requestAnimationFrame(tick);
  }

  setInterval(() => {
    const age = performance.now() - lastGood;
    if (!lastGood) return;
    if (age > 800) feedState.textContent = `stale (${Math.round(age)}ms)`;
  }, 250);

  tick();
})();
