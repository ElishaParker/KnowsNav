/*
 * driver.js — KnowsNav integration driver (EyeWrite + SnazyCam)
 *
 * Goals:
 *  1) Preserve BOTH codebases (EyeWrite + SnazyCam) with zero edits to their internal files.
 *  2) Keep SnazyCam tracking always running in the background (video + overlay active),
 *     while EyeWrite remains the primary visible UI.
 *  3) Lock EyeWrite hover/cursor movement to SnazyCam's exported cursor: window.smoothedCursor.
 *  4) Use ONE KnowsNav button to toggle SnazyCam's SETTINGS PANEL on top layer.
 *     (SnazyCam's own "Open Controls" button is hidden/disabled to prevent duplicate toggles.)
 *
 * This file intentionally avoids modifying snazycam/*.js and eyewrite/*.js.
 */

(() => {
  // ----------------------------
  // DOM references (from index.html)
  // ----------------------------
  const snazyContainer = document.getElementById('snazycam-container');
  const toggleBtn = document.getElementById('snazycam-toggle-btn');

  if (!snazyContainer || !toggleBtn) {
    console.error('[KnowsNav] Missing #snazycam-container or #snazycam-toggle-btn in index.html');
    return;
  }

  // SnazyCam creates these dynamically (controls.js)
  let snazyPanel = null;          // the right-side settings panel
  let snazyControlsToggle = null; // SnazyCam's own open/close button (we will hide/disable it)

  let snazyPanelVisible = false;  // our single source of truth
  let scriptsLoaded = false;

  // ----------------------------
  // Ensure SnazyCam stays "running" in background
  // (visible = hidden, but display stays active so camera + tracking keep going)
  // ----------------------------
  function setSnazyBackgroundMode() {
    // Keep it present so the camera/tracking loop stays alive
    snazyContainer.style.display = 'block';
    snazyContainer.style.opacity = '0';
    snazyContainer.style.pointerEvents = 'none';
    snazyContainer.style.zIndex = '0';
  }

  // ----------------------------
  // Find SnazyCam panel + its internal toggle button after controls.js loads
  // ----------------------------
  function findSnazyElements() {
    snazyPanel = null;
    snazyControlsToggle = null;

    // The SnazyCam panel is a fixed div with cyan border and a bunch of sliders.
    // We identify it by fixed position + right alignment + border color presence.
    const divs = Array.from(document.querySelectorAll('div'));
    for (const el of divs) {
      const cs = window.getComputedStyle(el);
      const looksLikePanel =
        cs.position === 'fixed' &&
        (cs.right === '0px' || cs.right === '10px') &&
        cs.borderStyle === 'solid' &&
        cs.borderWidth !== '0px' &&
        (cs.maxWidth === '260px' || cs.width === '260px' || cs.maxWidth === '280px');

      if (looksLikePanel) {
        snazyPanel = el;
        break;
      }
    }

    // SnazyCam also spawns its own "Open Controls" / "Close Controls" button.
    // We force-hide it so only KnowsNav button controls the panel.
    const btns = Array.from(document.querySelectorAll('button'));
    for (const el of btns) {
      if (el === toggleBtn) continue;
      const cs = window.getComputedStyle(el);
      const txt = (el.textContent || '').toLowerCase();
      const looksLikeSnazyToggle =
        cs.position === 'fixed' &&
        (txt.includes('open controls') || txt.includes('close controls') || txt.includes('controls'));

      if (looksLikeSnazyToggle) {
        snazyControlsToggle = el;
        break;
      }
    }

    // Force-hide/disable SnazyCam's own toggle button if found
    if (snazyControlsToggle) {
      snazyControlsToggle.style.display = 'none';
      snazyControlsToggle.style.pointerEvents = 'none';
      snazyControlsToggle.setAttribute('aria-hidden', 'true');
    }

    // Force panel layering rules (panel should be above EyeWrite when visible)
    if (snazyPanel) {
      snazyPanel.style.zIndex = '3000';
      snazyPanel.style.pointerEvents = 'auto';
    }

    // Apply current visibility state
    if (snazyPanelVisible) showSnazyPanel();
    else hideSnazyPanel();
  }

  // ----------------------------
  // Load SnazyCam extra scripts only once (controls + hover click)
  // nose.js is loaded in index.html and runs immediately.
  // ----------------------------
  function loadSnazyScripts(cb) {
    if (scriptsLoaded) {
      findSnazyElements();
      cb();
      return;
    }

    let pending = 2;
    const done = () => {
      pending--;
      if (pending === 0) {
        scriptsLoaded = true;
        // Give the DOM a breath for controls.js to append its panel
        setTimeout(() => {
          findSnazyElements();
          cb();
        }, 50);
      }
    };

    const s1 = document.createElement('script');
    s1.src = 'snazycam/controls.js';
    s1.onload = done;
    s1.onerror = () => {
      console.error('[KnowsNav] Failed to load snazycam/controls.js');
      done();
    };
    document.body.appendChild(s1);

    const s2 = document.createElement('script');
    s2.src = 'snazycam/hoverClick.js';
    s2.onload = done;
    s2.onerror = () => {
      console.error('[KnowsNav] Failed to load snazycam/hoverClick.js');
      done();
    };
    document.body.appendChild(s2);
  }

  // ----------------------------
  // Panel show/hide (ONLY the panel, NOT the video)
  // ----------------------------
  function showSnazyPanel() {
    // Keep SnazyCam background running but invisible
    setSnazyBackgroundMode();

    if (snazyPanel) {
      snazyPanel.style.display = '';
      snazyPanel.style.zIndex = '3000';
      snazyPanel.style.pointerEvents = 'auto';
    }

    snazyPanelVisible = true;
    toggleBtn.textContent = 'Hide SnazyCam';
  }

  function hideSnazyPanel() {
    setSnazyBackgroundMode();

    if (snazyPanel) {
      snazyPanel.style.display = 'none';
    }

    snazyPanelVisible = false;
    toggleBtn.textContent = 'SnazyCam Controls';
  }

  // ----------------------------
  // Single-toggle button (KnowsNav button)
  // ----------------------------
  toggleBtn.addEventListener('click', () => {
    if (!scriptsLoaded) {
      loadSnazyScripts(() => {
        // Toggle after loading
        if (snazyPanelVisible) hideSnazyPanel();
        else showSnazyPanel();
      });
      return;
    }

    // Toggle
    if (snazyPanelVisible) hideSnazyPanel();
    else showSnazyPanel();
  });

  // ----------------------------
  // Sync hover time between EyeWrite modes and SnazyCam hoverClick.js
  // EyeWrite shows mode label in #kbMode (Precision vs QuickType)
  // ----------------------------
  function updateHoverTime() {
    const modeEl = document.getElementById('kbMode');
    if (!modeEl) return;
    const label = modeEl.textContent || '';
    const isQuick = label.toLowerCase().includes('quicktype');
    window.HOVER_TIME = isQuick ? 700 : 1500;
  }

  const kbToggle = document.getElementById('kbToggle');
  if (kbToggle) {
    kbToggle.addEventListener('click', () => setTimeout(updateHoverTime, 50));
  }
  updateHoverTime();

  // ----------------------------
  // Force EyeWrite cursor ring visible and on top
  // (fixes the "no cursor at all now" cases)
  // ----------------------------
  function forceCursorRingVisible() {
    const ring = document.getElementById('cursorRing');
    if (!ring) return;
    ring.classList.remove('hidden');
    ring.style.display = 'block';
    ring.style.position = ring.style.position || 'fixed';
    ring.style.zIndex = '2500';
    ring.style.pointerEvents = 'none';
  }
  // Run once now + again after everything initializes
  forceCursorRingVisible();
  setTimeout(forceCursorRingVisible, 500);
  setTimeout(forceCursorRingVisible, 1500);

  // ----------------------------
  // Dispatch synthetic mouse move from SnazyCam -> EyeWrite
  // Uses SnazyCam exported cursor: window.smoothedCursor {x,y}
  // ----------------------------
  function dispatchMouseMove(x, y) {
    const evt = new MouseEvent('mousemove', {
      clientX: x,
      clientY: y,
      bubbles: true,
      cancelable: true,
      view: window
    });
    document.dispatchEvent(evt);
  }

  function animate() {
    const sc = window.smoothedCursor;
    if (sc && typeof sc.x === 'number' && typeof sc.y === 'number') {
      dispatchMouseMove(sc.x, sc.y);
    }
    requestAnimationFrame(animate);
  }

  // ----------------------------
  // Initialize background mode immediately
  // ----------------------------
  setSnazyBackgroundMode();
  hideSnazyPanel();

  // Start animation loop
  requestAnimationFrame(animate);

  // Re-scan Snazy elements after a moment (in case scripts load later)
  setTimeout(findSnazyElements, 1000);
})();
