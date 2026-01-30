/*
 * driver.js — KnowsNav integration driver (EyeWrite + SnazyCam)
 *
 * Bench Goals (Step 1):
 *  - SnazyCam always runs (camera + overlay + tracking loop never stops)
 *  - EyeWrite stays on top as the primary UI
 *  - SnazyCam’s OWN Controls button stays visible (bottom-right)
 *  - When SnazyCam Controls panel is OPEN:
 *        SnazyCam video+overlay comes to TOP so user sees full tracker UI
 *  - When Controls panel is CLOSED:
 *        SnazyCam goes back behind EyeWrite (still running)
 *  - SnazyCam cursor drives EyeWrite cursor via synthetic mousemove
 *
 * IMPORTANT:
 *  - We do NOT “replace” SnazyCam logic. We READ its output.
 *  - Best source is SnazyCam’s exported cursor object (commonly window.smoothedCursor).
 *  - If your build also prints X/Y into a DOM element, we attempt a DOM parse fallback.
 */

(() => {
  const snazyContainer = document.getElementById("snazycam-container");
  if (!snazyContainer) {
    console.error("[KnowsNav] Missing #snazycam-container");
    return;
  }

  // ----------------------------
  // Layer modes
  // ----------------------------
  function setSnazyBehind() {
    snazyContainer.style.zIndex = "0";
    snazyContainer.style.opacity = "0";          // hidden but still running
    snazyContainer.style.pointerEvents = "none";
  }

  function setSnazyOnTop() {
    // Put SnazyCam ABOVE EyeWrite so full tracker UI is visible
    snazyContainer.style.zIndex = "5000";
    snazyContainer.style.opacity = "1";
    snazyContainer.style.pointerEvents = "auto";
  }

  // Always start behind
  setSnazyBehind();

  // ----------------------------
  // Keep EyeWrite cursor ring visible
  // ----------------------------
  function forceCursorRingVisible() {
    const ring = document.getElementById("cursorRing");
    if (!ring) return;
    ring.classList.remove("hidden");
    ring.style.display = "block";
    ring.style.position = "fixed";
    ring.style.zIndex = "6000"; // above SnazyCam when SnazyCam is on top
    ring.style.pointerEvents = "none";
  }
  forceCursorRingVisible();
  setTimeout(forceCursorRingVisible, 300);
  setTimeout(forceCursorRingVisible, 1200);

  // ----------------------------
  // Find SnazyCam’s existing UI elements:
  //  - its panel (Tracking Settings)
  //  - its button (Open/Close Controls)
  // ----------------------------
  let snazyPanel = null;
  let snazyBtn = null;

  function findSnazyUI() {
    // Panel: usually a fixed div on right with cyan border
    const divs = Array.from(document.querySelectorAll("div"));
    snazyPanel = divs.find((el) => {
      const cs = getComputedStyle(el);
      const txt = (el.textContent || "").toLowerCase();
      return (
        cs.position === "fixed" &&
        (cs.right === "0px" || cs.right === "10px") &&
        cs.borderStyle === "solid" &&
        cs.borderWidth !== "0px" &&
        (txt.includes("tracking settings") || txt.includes("smoothing alpha"))
      );
    }) || null;

    // Button: fixed button that says Open/Close Controls (SnazyCam original)
    const btns = Array.from(document.querySelectorAll("button"));
    snazyBtn = btns.find((el) => {
      const cs = getComputedStyle(el);
      const txt = (el.textContent || "").toLowerCase();
      return (
        cs.position === "fixed" &&
        txt.includes("controls") &&
        // exclude EyeWrite toolbar buttons (not fixed)
        (txt.includes("open") || txt.includes("close"))
      );
    }) || null;

    // Ensure SnazyCam button stays visible + bottom-right
    if (snazyBtn) {
      snazyBtn.style.zIndex = "7000";
      snazyBtn.style.right = "10px";
      snazyBtn.style.bottom = "10px";
      snazyBtn.style.top = "auto";
      snazyBtn.style.left = "auto";
      snazyBtn.style.position = "fixed";
      snazyBtn.style.display = "";
      snazyBtn.style.pointerEvents = "auto";
    }

    // Ensure panel above EyeWrite when visible
    if (snazyPanel) {
      snazyPanel.style.zIndex = "7000";
      snazyPanel.style.pointerEvents = "auto";
    }
  }

  // Try now, then again later (SnazyCam appends UI after load)
  findSnazyUI();
  setTimeout(findSnazyUI, 400);
  setTimeout(findSnazyUI, 1200);

  // ----------------------------
  // Detect whether Snazy panel is OPEN, then set SnazyCam layer mode
  // We do NOT control SnazyCam’s internal open/close logic.
  // We observe it.
  // ----------------------------
  function isPanelOpen() {
    if (!snazyPanel) return false;
    const cs = getComputedStyle(snazyPanel);
    // In your controls.js, panel fades via opacity and pointerEvents (not display none)
    const visibleByOpacity = parseFloat(cs.opacity || "1") > 0.2;
    const interactive = cs.pointerEvents !== "none";
    const notDisplayNone = cs.display !== "none";
    return notDisplayNone && visibleByOpacity && interactive;
  }

  // Watch for changes (panel open/close)
  const mo = new MutationObserver(() => {
    findSnazyUI();
    if (isPanelOpen()) setSnazyOnTop();
    else setSnazyBehind();
  });

  mo.observe(document.documentElement, {
    attributes: true,
    childList: true,
    subtree: true,
  });

  // Also poll lightly (safe fallback)
  setInterval(() => {
    findSnazyUI();
    if (isPanelOpen()) setSnazyOnTop();
    else setSnazyBehind();
  }, 250);

  // ----------------------------
  // Cursor Bridge:
  // Read SnazyCam cursor output -> drive EyeWrite via synthetic mousemove.
  // ----------------------------

  function parseXYFromDOM() {
    // If your SnazyCam writes coordinates to a DOM element like: "X: 253, Y: 441"
    // this will find it. If the text is drawn onto canvas, this will NOT work.
    const all = Array.from(document.querySelectorAll("div,span,p"));
    for (const el of all) {
      const t = (el.textContent || "").trim();
      if (!t) continue;
      const m = t.match(/x:\s*(-?\d+)\s*,\s*y:\s*(-?\d+)/i);
      if (m) return { x: parseInt(m[1], 10), y: parseInt(m[2], 10) };
    }
    return null;
  }

  function getSnazyCursor() {
    // Preferred: exported cursor object
    // (your earlier integration used window.smoothedCursor already)
    const sc = window.smoothedCursor;
    if (sc && typeof sc.x === "number" && typeof sc.y === "number") {
      return { x: sc.x, y: sc.y };
    }

    // Fallback if SnazyCam exports something else
    if (typeof window.cursorX === "number" && typeof window.cursorY === "number") {
      return { x: window.cursorX, y: window.cursorY };
    }

    // Last fallback: DOM text readout (only if it exists as DOM text)
    const domXY = parseXYFromDOM();
    if (domXY) return domXY;

    return null;
  }

  function dispatchMouseMove(x, y) {
    const evt = new MouseEvent("mousemove", {
      clientX: x,
      clientY: y,
      bubbles: true,
      cancelable: true,
      view: window,
    });
    document.dispatchEvent(evt);
  }

  function animate() {
    const xy = getSnazyCursor();
    if (xy) dispatchMouseMove(xy.x, xy.y);
    requestAnimationFrame(animate);
  }
  requestAnimationFrame(animate);

  // ----------------------------
  // Sync HOVER_TIME (optional bridge)
  // ----------------------------
  function updateHoverTime() {
    const modeEl = document.getElementById("kbMode");
    if (!modeEl) return;
    const label = (modeEl.textContent || "").toLowerCase();
    const isQuick = label.includes("quicktype");
    window.HOVER_TIME = isQuick ? 700 : 1500;
  }
  const kbToggle = document.getElementById("kbToggle");
  if (kbToggle) kbToggle.addEventListener("click", () => setTimeout(updateHoverTime, 50));
  updateHoverTime();

  console.log("✅ KnowsNav driver initialized: SnazyCam running + layer observer + cursor bridge");
})();
