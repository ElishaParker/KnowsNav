(() => {
  const snazyFrame = document.getElementById("snazyFrame");
  const eyeFrame   = document.getElementById("eyeFrame");

  const btnSnazy = document.getElementById("btnSnazy");
  const btnEye   = document.getElementById("btnEye");

  const bridgeState = document.getElementById("bridgeState");
  const feedState   = document.getElementById("feedState");
  const xyState     = document.getElementById("xyState");

  // ---------- Layer toggle (driver-owned) ----------
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

  // ---------- EyeWrite injection (driver-owned) ----------
  function ensureEyewriteInjected(eyeWin) {
    const doc = eyeWin.document;
    if (!doc || !doc.body) return false;

    // Create a driver-owned cursor overlay inside EyeWrite
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
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace",
        fontSize: "14px",
        zIndex: "2147483647",
        pointerEvents: "none"
      });
      readout.textContent = "X: —, Y: —";
      doc.body.appendChild(readout);
    }

    return true;
  }

  // Map SnazyCam viewport coords -> EyeWrite viewport coords
  // (Both iframes are full-screen in this shell, so this is 1:1.
  // If later you change sizes, we compute scaling.)
  function mapXY(snazyXY, snazyWin, eyeWin) {
    const sx = snazyWin.innerWidth  || 1;
    const sy = snazyWin.innerHeight || 1;
    const ex = eyeWin.innerWidth    || 1;
    const ey = eyeWin.innerHeight   || 1;

    const scaleX = ex / sx;
    const scaleY = ey / sy;

    return {
      x: snazyXY.x * scaleX,
      y: snazyXY.y * scaleY
    };
  }

  // ---------- Main bridge loop ----------
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

      // Make sure EyeWrite has our overlay injected
      const injected = ensureEyewriteInjected(eyeWin);
      bridgeState.textContent = injected ? "ready" : "injecting…";

      const sc = snazyWin.smoothedCursor; // authoritative feed
      if (!sc || typeof sc.x !== "number" || typeof sc.y !== "number") {
        feedState.textContent = "SnazyCam feed not ready";
        requestAnimationFrame(tick);
        return;
      }

      const mapped = mapXY({ x: sc.x, y: sc.y }, snazyWin, eyeWin);

      // Apply cursor protocol inside EyeWrite (driver-owned)
      const doc = eyeWin.document;
      const cursor = doc.getElementById("__knowsnav_cursor");
      const readout = doc.getElementById("__knowsnav_xy");

      if (cursor) {
        cursor.style.left = `${mapped.x}px`;
        cursor.style.top  = `${mapped.y}px`;
      }
      if (readout) {
        const tx = Math.round(mapped.x);
        const ty = Math.round(mapped.y);
        readout.textContent = `X: ${tx}, Y: ${ty}`;
        xyState.textContent = `${tx}, ${ty}`;
      }

      feedState.textContent = "live";
      lastGood = performance.now();

    } catch (e) {
      // If something goes temporarily unavailable, keep looping.
      feedState.textContent = "bridge error (looping)";
    }

    requestAnimationFrame(tick);
  }

  // Watchdog status (stale feed)
  setInterval(() => {
    const age = performance.now() - lastGood;
    if (lastGood === 0) return;
    if (age > 500) feedState.textContent = `stale (${Math.round(age)}ms)`;
  }, 250);

  tick();
})();
