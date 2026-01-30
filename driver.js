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
  const CLICK_COOLDOWN_MS = 600;           // general cooldown
  const REQUIRE_MOVE_TO_RECLICK = true;    // prevents double letters
  const UNLOCK_RADIUS_PX = 18;             // must move this far to unlock/reclick same target
  const RETARGET_STABLE_MS = 140;          // reduce flicker
  const MOVE_EVENT_HZ = 30;                // less spam

  // Cursor offset tuning if needed
  const X_OFFSET = 0;
  const Y_OFFSET = 0;
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

  // ---------------- Clickable detection ----------------
  function isInputLike(el) {
    if (!el) return false;
    const tag = (el.tagName || "").toLowerCase();
    return tag === "input" || tag === "textarea" || tag === "select" || el.isContentEditable;
  }

  function isClickable(el) {
    if (!el) return false;
    if (el.disabled) return false;

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

    // Prefer input-like elements when present
    if (el.closest) {
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

  // ---------------- BUG #1: Caret placement for text ----------------
  // We attempt:
  // 1) For contenteditable: caretRangeFromPoint / caretPositionFromPoint (works well)
  // 2) For textarea/input: use a measurement mirror to estimate caret index
  function setCaretAtPoint(eyeWin, el, x, y) {
    const doc = eyeWin.document;

    // contenteditable: use native caret APIs
    if (el.isContentEditable) {
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
      return;
    }

    // textarea/input: compute caret index with mirror
    const tag = (el.tagName || "").toLowerCase();
    if (tag !== "textarea" && tag !== "input") return;

    // Only text-like inputs
    if (tag === "input") {
      const type = (el.getAttribute("type") || "text").toLowerCase();
      const ok = ["text","search","email","url","tel","password"].includes(type);
      if (!ok) return;
    }

    const rect = el.getBoundingClientRect();
    const rx = x - rect.left;
    const ry = y - rect.top;

    // Build mirror
    const style = eyeWin.getComputedStyle(el);
    const mirror = doc.createElement("div");
    mirror.style.position = "fixed";
    mirror.style.left = "-99999px";
    mirror.style.top = "-99999px";
    mirror.style.whiteSpace = "pre-wrap";
    mirror.style.wordWrap = "break-word";
    mirror.style.visibility = "hidden";

    // copy font + box
    mirror.style.fontFamily = style.fontFamily;
    mirror.style.fontSize = style.fontSize;
    mirror.style.fontWeight = style.fontWeight;
    mirror.style.letterSpacing = style.letterSpacing;
    mirror.style.lineHeight = style.lineHeight;
    mirror.style.padding = style.padding;
    mirror.style.border = style.border;
    mirror.style.boxSizing = style.boxSizing;
    mirror.style.width = `${rect.width}px`;

    // Normalize text: textarea uses \n; input is single line
    const value = el.value || "";
    const text = (tag === "textarea") ? value : value.replace(/\n/g, " ");

    // Binary search caret position
    const marker = doc.createElement("span");
    marker.textContent = "\u200b"; // zero-width marker

    doc.body.appendChild(mirror);

    function caretPosAt(idx) {
      mirror.textContent = text.slice(0, idx);
      mirror.appendChild(marker);
      mirror.appendChild(doc.createTextNode(text.slice(idx)));
      const mrect = marker.getBoundingClientRect();
      const top = mrect.top - mirror.getBoundingClientRect().top;
      const left = mrect.left - mirror.getBoundingClientRect().left;
      return { top, left };
    }

    let lo = 0, hi = text.length;
    let best = 0;

    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const p = caretPosAt(mid);

      // compare by line first, then column
      if (p.top < ry || (Math.abs(p.top - ry) < 8 && p.left < rx)) {
        best = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }

    doc.body.removeChild(mirror);

    try {
      el.setSelectionRange(best, best);
    } catch {}
  }

  // ---------------- BUG #4: Voice dropdown fallback ----------------
  // Chrome often blocks synthetic "open" for native <select>.
  // So we create a driver-owned voice picker that reads EyeWrite's select options.
  let voicePanel = null;
  let voiceBtn = null;

  function ensureVoicePickerUI() {
    const overlay = document.getElementById("driverOverlay");
    if (!overlay) return;

    if (!voiceBtn) {
      voiceBtn = document.createElement("button");
      voiceBtn.textContent = "Voices";
      voiceBtn.style.marginTop = "6px";
      overlay.appendChild(voiceBtn);

      voiceBtn.addEventListener("click", () => {
        if (voicePanel) {
          voicePanel.remove();
          voicePanel = null;
          return;
        }
        voicePanel = document.createElement("div");
        Object.assign(voicePanel.style, {
          width: "320px",
          maxHeight: "320px",
          overflow: "auto",
          borderRadius: "12px",
          padding: "10px",
          background: "rgba(0,0,0,0.85)",
          border: "1px solid rgba(0,255,255,0.6)",
          boxShadow: "0 0 18px rgba(0,255,255,0.18)",
          color: "#00ffff",
          marginTop: "8px"
        });
        voicePanel.innerHTML = `<div style="opacity:.75;margin-bottom:8px">Select voice (driver picker)</div>`;
        overlay.appendChild(voicePanel);

        populateVoices();
      });
    }
  }

  function populateVoices() {
    if (!voicePanel) return;
    const eyeWin = eyeFrame?.contentWindow;
    const doc = eyeWin?.document;
    if (!doc) return;

    const sel = doc.querySelector("select");
    if (!sel) {
      voicePanel.innerHTML += `<div style="opacity:.75">No &lt;select&gt; found in EyeWrite.</div>`;
      return;
    }

    // Clear items except header
    voicePanel.innerHTML = `<div style="opacity:.75;margin-bottom:8px">Select voice (driver picker)</div>`;

    const opts = Array.from(sel.options || []);
    opts.forEach((opt) => {
      const item = document.createElement("div");
      item.textContent = opt.textContent;
      Object.assign(item.style, {
        padding: "8px 10px",
        borderRadius: "10px",
        cursor: "pointer",
        border: "1px solid rgba(0,255,255,0.18)",
        marginBottom: "6px"
      });

      item.addEventListener("click", () => {
        try {
          sel.value = opt.value;
          sel.dispatchEvent(new Event("change", { bubbles: true }));
        } catch {}
        // close panel after selection
        voicePanel?.remove();
        voicePanel = null;
      });

      voicePanel.appendChild(item);
    });
  }

  // ---------------- Locked hover state machine ----------------
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
    // allow re-clicking the same element after moving off it
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
  // - For keys/buttons: fire ONE click event (prevents double letters)
  // - For input/textarea/select: focus + mousedown/up + click + caret set
  function clickElement(eyeWin, el, x, y) {
    const doc = eyeWin.document;

    // hover enter
    dispatchPointer(eyeWin, el, "pointerover", x, y);
    dispatchMouse(eyeWin, el, "mouseover", x, y);
    dispatchMouse(eyeWin, el, "mouseenter", x, y);

    if (isInputLike(el)) {
      focusElement(el);

      // Down/up then click tends to be best for focus
      dispatchPointer(eyeWin, el, "pointerdown", x, y);
      dispatchMouse(eyeWin, el, "mousedown", x, y);

      dispatchPointer(eyeWin, el, "pointerup", x, y);
      dispatchMouse(eyeWin, el, "mouseup", x, y);

      dispatchMouse(eyeWin, el, "click", x, y);

      // caret placement for text editing (BUG #1)
      setCaretAtPoint(eyeWin, el, x, y);

      // dropdown open (BUG #4): native may not open -> use driver picker
      const tag = (el.tagName || "").toLowerCase();
      if (tag === "select") {
        // open driver voice picker if present
        if (voiceBtn) voiceBtn.click();
      }
      return;
    }

    // BUTTONS/KEYS: SINGLE CLICK ONLY (BUG #2)
    dispatchMouse(eyeWin, el, "click", x, y);

    // Some UIs need focus on clickables too
    focusElement(el);
  }

  // Reduce move event spam
  let lastMoveSent = 0;

  function hoverController(eyeWin, x, y) {
    const now = performance.now();
    const doc = eyeWin.document;
    if (!doc) return;

    // move events to help hover systems, throttled
    const interval = 1000 / MOVE_EVENT_HZ;
    if (now - lastMoveSent >= interval) {
      lastMoveSent = now;
      dispatchPointer(eyeWin, doc, "pointermove", x, y);
      dispatchMouse(eyeWin, doc, "mousemove", x, y);
    }

    // if locked, only click after dwell, and prevent double click unless moved away
    if (lockedEl) {
      // unlock if moved far enough
      if (distance({ x, y }, lockPos) > UNLOCK_RADIUS_PX) {
        unlock();
      } else {
        const dwell = now - lockedAt;
        const cooled = (now - lastClickAt) >= CLICK_COOLDOWN_MS;

        if (dwell >= HOVER_TIME_MS && cooled) {
          if (REQUIRE_MOVE_TO_RECLICK && lastClickedEl === lockedEl) {
            return; // prevents double letters
          }
          clickElement(eyeWin, lockedEl, x, y);
          lastClickAt = now;
          lastClickedEl = lockedEl;

          // restart dwell timer
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

  // ---------------- Main bridge loop ----------------
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

      ensureVoicePickerUI();

      const injected = ensureEyewriteInjected(eyeWin);
      bridgeState.textContent = injected ? "ready" : "injecting…";

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

      // update cursor ring inside EyeWrite
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
