(() => {
  const snazyFrame = document.getElementById("snazyFrame");
  const eyeFrame   = document.getElementById("eyeFrame");

  const btnSnazy = document.getElementById("btnSnazy");
  const btnEye   = document.getElementById("btnEye");
  const btnStt   = document.getElementById("btnStt");

  const bridgeState = document.getElementById("bridgeState");
  const feedState   = document.getElementById("feedState");
  const xyState     = document.getElementById("xyState");
  const sttState    = document.getElementById("sttState");
  const saveState   = document.getElementById("saveState");

  // ===================== CONFIG =====================
  const HOVER_TIME_MS = 1500;
  const CLICK_COOLDOWN_MS = 650;
  const REQUIRE_MOVE_TO_RECLICK = true;
  const UNLOCK_RADIUS_PX = 22;
  const RETARGET_STABLE_MS = 140;
  const MOVE_EVENT_HZ = 30;

  const X_OFFSET = 0;
  const Y_OFFSET = 0;

  const AUTO_DISABLE_EYEWRITE_HOVER = true;

  // Auto-save naming
  const AUTOSAVE_PREFIX = "EyeWrite-note";
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

  // ---------------- Parent cursor ----------------
  function ensureDriverCursor() {
    let el = document.getElementById("driverCursor");
    if (el) return el;
    el = document.createElement("div");
    el.id = "driverCursor";
    document.body.appendChild(el);
    return el;
  }
  function setDriverCursorVisible(on) {
    const c = ensureDriverCursor();
    c.style.display = on ? "block" : "none";
  }
  function moveDriverCursor(x, y) {
    const c = ensureDriverCursor();
    c.style.left = `${x}px`;
    c.style.top  = `${y}px`;
  }
  function pulseDriverCursor() {
    try {
      const c = ensureDriverCursor();
      c.classList.remove("knowsnav-click");
      void c.offsetWidth;
      c.classList.add("knowsnav-click");
    } catch {}
  }
  function setIframeCursorVisible(eyeWin, on) {
    try {
      const c = eyeWin.document.getElementById("__knowsnav_cursor");
      if (!c) return;
      c.style.display = on ? "block" : "none";
    } catch {}
  }

  // ---------------- Overlay injection (iframe cursor) ----------------
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
        width: "33px",
        height: "33px",
        borderRadius: "50%",
        border: "2px solid rgba(0,255,255,0.95)",
        boxShadow: "0 0 14px rgba(0,255,255,0.35)",
        transform: "translate(-50%, -50%)",
        pointerEvents: "none",
        zIndex: "2147483647"
      });
      doc.body.appendChild(cursor);
    }

    if (!doc.getElementById("__knowsnav_click_style")) {
      const style = doc.createElement("style");
      style.id = "__knowsnav_click_style";
      style.textContent = `
        @keyframes knowsnavPulse {
          0%   { transform: translate(-50%, -50%) scale(1);   opacity: 1; }
          50%  { transform: translate(-50%, -50%) scale(1.35); opacity: 0.85; }
          100% { transform: translate(-50%, -50%) scale(1);   opacity: 1; }
        }
        #__knowsnav_cursor.knowsnav-click { animation: knowsnavPulse 160ms ease-out; }
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
  function dispatchMouse(win, target, type, x, y) {
    const e = new MouseEvent(type, { bubbles: true, cancelable: true, view: win, clientX: x, clientY: y });
    target.dispatchEvent(e);
  }
  function dispatchPointer(win, target, type, x, y) {
    try {
      const e = new PointerEvent(type, {
        bubbles: true, cancelable: true, view: win,
        clientX: x, clientY: y, pointerId: 1, pointerType: "mouse", isPrimary: true
      });
      target.dispatchEvent(e);
    } catch {}
  }

  function focusElement(el) {
    try { el.focus?.({ preventScroll: true }); } catch {}
    try { el.focus?.(); } catch {}
  }
  function setHighlight(el, on, cls="gaze-hover") {
    if (!el) return;
    try { on ? el.classList.add(cls) : el.classList.remove(cls); } catch {}
  }
  function pulseCursor(eyeWin) {
    try {
      const c = eyeWin.document.getElementById("__knowsnav_cursor");
      if (!c) return;
      c.classList.remove("knowsnav-click");
      void c.offsetWidth;
      c.classList.add("knowsnav-click");
    } catch {}
  }

  // ---------------- Target detection ----------------
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

  // ---------------- Auto disable EyeWrite hover ----------------
  let hoverToggledOff = false;
  function disableEyewriteHoverIfOn(eyeWin) {
    if (!AUTO_DISABLE_EYEWRITE_HOVER || hoverToggledOff) return;
    const doc = eyeWin.document;
    if (!doc) return;
    const buttons = Array.from(doc.querySelectorAll("button,div"));
    const hoverEl = buttons.find(el => (el.textContent || "").trim() === "Hover ON");
    if (hoverEl) {
      try { hoverEl.click(); hoverToggledOff = true; } catch {}
    }
  }

  // ============================================================
  // PATCH 1: AUTO-SAVE — KILL PROMPT BY OVERRIDING TOP + PARENT
  // ============================================================
  let autosaveInstalled = false;
  let nextSaveExt = "txt";

  function tsStamp(d = new Date()) {
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  }

  function guessExtFromUiText(t) {
    const s = (t || "").toLowerCase();
    if (s.includes("docx")) return "docx";
    if (s.includes("pdf"))  return "pdf";
    return "txt";
  }

  function makeAutoName() {
    return `${AUTOSAVE_PREFIX}-${tsStamp()}.${nextSaveExt}`;
  }

  function installAutoSaveNoPrompt(eyeWin) {
    if (autosaveInstalled) return;
    if (!eyeWin || !eyeWin.document) return;

    // Track format selection (TXT/DOCX/PDF)
    try {
      eyeWin.document.addEventListener("click", (ev) => {
        const el = ev.target?.closest?.("button,div,span");
        const txt = (el?.textContent || "").trim();
        if (!txt) return;

        // update ext when user picks TXT/DOCX/PDF
        const ext = guessExtFromUiText(txt);
        if (txt === "TXT" || txt === "DOCX" || txt === "PDF" ||
            txt.toLowerCase() === "txt" || txt.toLowerCase() === "docx" || txt.toLowerCase() === "pdf") {
          nextSaveExt = ext;
        }
      }, true);
    } catch {}

    // Build ONE prompt override and install everywhere it might be called
    const promptOverride = (message, defaultValue) => {
      try {
        const msg = String(message || "");
        // Their dialog is: "Enter file name:"
        if (/enter\s*file\s*name/i.test(msg) || /file\s*name/i.test(msg)) {
          const name = makeAutoName();
          saveState.textContent = `auto: ${name}`;
          return name; // ✅ prevents native prompt entirely
        }
      } catch {}
      return (defaultValue ?? "");
    };

    // Install in: iframe window + iframe.top + parent window (this)
    try { eyeWin.prompt = promptOverride; } catch {}
    try { eyeWin.top.prompt = promptOverride; } catch {}
    try { window.prompt = promptOverride; } catch {}
    try { window.top.prompt = promptOverride; } catch {}

    autosaveInstalled = true;
    saveState.textContent = "autosave armed";
  }

  // ============================================================
  // PATCH 2: STT BUTTON (Web Speech API) + inserts into EyeWrite
  // ============================================================
  let SpeechRec = null;
  let rec = null;
  let sttOn = false;

  let lastTextTarget = null;
  function isTextField(el) {
    if (!el) return false;
    const tag = (el.tagName || "").toLowerCase();
    if (tag === "textarea") return true;
    if (tag === "input") {
      const type = (el.getAttribute?.("type") || "text").toLowerCase();
      return !["button","submit","checkbox","radio","range","color","file"].includes(type);
    }
    if (el.isContentEditable) return true;
    return false;
  }

  function insertTextIntoEyeWrite(eyeWin, text) {
    try {
      const doc = eyeWin.document;
      let el = doc.activeElement;
      if (!isTextField(el)) el = lastTextTarget;
      if (!isTextField(el)) return false;

      focusElement(el);

      if (el.isContentEditable) {
        try { doc.execCommand("insertText", false, text); return true; } catch {}
        el.textContent += text;
        return true;
      }

      const start = el.selectionStart ?? el.value.length;
      const end   = el.selectionEnd ?? el.value.length;

      if (typeof el.setRangeText === "function") el.setRangeText(text, start, end, "end");
      else {
        const v = el.value || "";
        el.value = v.slice(0, start) + text + v.slice(end);
      }

      el.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    } catch {}
    return false;
  }

  function setSttUi(on, msg) {
    sttOn = on;
    btnStt.textContent = on ? "STT ON" : "STT OFF";
    btnStt.classList.toggle("stt-on", !!on);
    sttState.textContent = msg || (on ? "listening" : "off");
  }

  function stopStt() {
    try { rec?.stop?.(); } catch {}
    setSttUi(false, "off");
  }

  function startStt(eyeWin) {
    SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRec) { setSttUi(false, "unsupported"); return; }

    rec = new SpeechRec();
    rec.continuous = true;
    rec.interimResults = false;
    rec.lang = "en-US";

    rec.onstart = () => setSttUi(true, "listening");
    rec.onerror = () => setSttUi(true, "error");
    rec.onend = () => { if (sttOn) { try { rec.start(); } catch {} } };

    rec.onresult = (event) => {
      try {
        let finalText = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const r = event.results[i];
          if (r.isFinal) finalText += (r[0]?.transcript || "");
        }
        if (finalText) {
          insertTextIntoEyeWrite(eyeWin, finalText.trim() + " ");
          sttState.textContent = "typing…";
          setTimeout(() => { if (sttOn) sttState.textContent = "listening"; }, 200);
        }
      } catch {}
    };

    try { rec.start(); } catch { setSttUi(false, "blocked"); return; }
    setSttUi(true, "listening");
  }

  btnStt.addEventListener("click", () => {
    const eyeWin = eyeFrame.contentWindow;
    if (!eyeWin) return;
    if (sttOn) stopStt();
    else startStt(eyeWin);
  });

  // Track last text field clicked (helps STT know where to type)
  function wireTextTargetTracking(eyeWin) {
    try {
      eyeWin.document.addEventListener("mousedown", (ev) => {
        const t = ev.target;
        if (isTextField(t)) lastTextTarget = t;
        else if (t?.closest) {
          const c = t.closest("textarea,input,[contenteditable='true']");
          if (c && isTextField(c)) lastTextTarget = c;
        }
      }, true);
    } catch {}
  }
  let textTrackingWired = false;

  // ---------------- Locked hover engine ----------------
  let lockedEl = null;
  let lockedAt = 0;
  let lockPos = { x: 0, y: 0 };
  let lastClickAt = 0;
  let lastClickedEl = null;
  let pendingEl = null;
  let pendingSince = 0;

  function lockOn(el, x, y, cls) {
    if (lockedEl && lockedEl !== el) setHighlight(lockedEl, false, cls);
    lockedEl = el;
    lockedAt = performance.now();
    lockPos = { x, y };
    setHighlight(lockedEl, true, cls);
  }
  function unlock(cls) {
    if (lockedEl) setHighlight(lockedEl, false, cls);
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

  function clickElementEyeWrite(eyeWin, el, x, y) {
    // help STT targeting
    try {
      if (isTextField(el) || el.isContentEditable) lastTextTarget = el;
    } catch {}

    const tag = (el.tagName || "").toLowerCase();

    if (tag === "select") {
      focusElement(el);
      // (voice popup not included here; keeping click normal)
      dispatchMouse(eyeWin, el, "click", x, y);
      pulseCursor(eyeWin);
      return;
    }

    if (el.isContentEditable || tag === "input" || tag === "textarea") {
      focusElement(el);
      dispatchMouse(eyeWin, el, "click", x, y);
      pulseCursor(eyeWin);
      return;
    }

    dispatchMouse(eyeWin, el, "click", x, y);
    focusElement(el);
    pulseCursor(eyeWin);
  }

  let lastMoveSent = 0;
  function hoverControllerEyeWrite(eyeWin, x, y) {
    const now = performance.now();
    const doc = eyeWin.document;
    if (!doc) return;

    const interval = 1000 / MOVE_EVENT_HZ;
    if (now - lastMoveSent >= interval) {
      lastMoveSent = now;
      dispatchPointer(eyeWin, doc, "pointermove", x, y);
      dispatchMouse(eyeWin, doc, "mousemove", x, y);
    }

    if (lockedEl) {
      if (distance({ x, y }, lockPos) > UNLOCK_RADIUS_PX) {
        unlock("gaze-hover");
      } else {
        const dwell = now - lockedAt;
        const cooled = (now - lastClickAt) >= CLICK_COOLDOWN_MS;

        if (dwell >= HOVER_TIME_MS && cooled) {
          if (REQUIRE_MOVE_TO_RECLICK && lastClickedEl === lockedEl) return;
          clickElementEyeWrite(eyeWin, lockedEl, x, y);
          lastClickAt = now;
          lastClickedEl = lockedEl;
          lockedAt = now;
          lockPos = { x, y };
        }
        return;
      }
    }

    const raw = doc.elementFromPoint(x, y);
    const target = findTarget(raw);

    if (!target) { pendingEl = null; pendingSince = 0; return; }
    if (!pendingEl || pendingEl !== target) { pendingEl = target; pendingSince = now; return; }

    if ((now - pendingSince) >= RETARGET_STABLE_MS) {
      lockOn(target, x, y, "gaze-hover");
      pendingEl = null; pendingSince = 0;
    }
  }

  // Parent HUD hover controller (buttons)
  function findHudTarget(el) {
    if (!el) return null;
    if (el.closest) {
      const c = el.closest("#driverControls button");
      if (c) return c;
    }
    return null;
  }
  function clickHudTarget(el) {
    try { el.click(); } catch {
      try { dispatchMouse(window, el, "click", 0, 0); } catch {}
    }
    pulseDriverCursor();
  }
  function hoverControllerHud(x, y) {
    const now = performance.now();

    if (lockedEl) {
      if (distance({ x, y }, lockPos) > UNLOCK_RADIUS_PX) {
        unlock("driver-hover");
      } else {
        const dwell = now - lockedAt;
        const cooled = (now - lastClickAt) >= CLICK_COOLDOWN_MS;
        if (dwell >= HOVER_TIME_MS && cooled) {
          if (REQUIRE_MOVE_TO_RECLICK && lastClickedEl === lockedEl) return;
          clickHudTarget(lockedEl);
          lastClickAt = now;
          lastClickedEl = lockedEl;
          lockedAt = now;
          lockPos = { x, y };
        }
        return;
      }
    }

    const raw = document.elementFromPoint(x, y);
    const target = findHudTarget(raw);

    if (!target) { pendingEl = null; pendingSince = 0; return; }
    if (!pendingEl || pendingEl !== target) { pendingEl = target; pendingSince = now; return; }

    if ((now - pendingSince) >= RETARGET_STABLE_MS) {
      lockOn(target, x, y, "driver-hover");
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

      // ✅ install autosave + STT helpers once we can
      installAutoSaveNoPrompt(eyeWin);

      if (!textTrackingWired) {
        wireTextTargetTracking(eyeWin);
        textTrackingWired = true;
      }

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

      const iframeDoc = eyeWin.document;
      const iframeCursor = iframeDoc.getElementById("__knowsnav_cursor");
      if (iframeCursor) {
        iframeCursor.style.left = `${mapped.x}px`;
        iframeCursor.style.top  = `${mapped.y}px`;
      }
      moveDriverCursor(mapped.x, mapped.y);

      xyState.textContent = `${tx}, ${ty}`;
      feedState.textContent = "live";
      lastGood = performance.now();

      const snazyFront = document.body.classList.contains("snazy-front");
      const overHud = !!findHudTarget(document.elementFromPoint(mapped.x, mapped.y));

      if (snazyFront || overHud) {
        setDriverCursorVisible(true);
        setIframeCursorVisible(eyeWin, false);
        hoverControllerHud(mapped.x, mapped.y);
      } else {
        setDriverCursorVisible(false);
        setIframeCursorVisible(eyeWin, true);
        hoverControllerEyeWrite(eyeWin, mapped.x, mapped.y);
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

  setSttUi(false, "off");
  tick();
})();
