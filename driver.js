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
 */

(() => {
  // ----------------------------
  // DOM references (from index.html)
  // ----------------------------
  const snazyContainer = document.getElementById('snazycam-container');
  const toggleBtn      = document.getElementById('snazycam-toggle-btn');

  if (!snazyContainer || !toggleBtn) {
    console.error('[KnowsNav] Missing #snazycam-container or #snazycam-toggle-btn in index.html');
    return;
  }

  // SnazyCam creates these dynamically (controls.js)
  let snazyPanel          = null; // the right-side settings panel
  let snazyControlsToggle = null; // SnazyCam's own open/close button (we will hide/disable it)

  let snazyPanelVisible = false; // our single source of truth
  let scriptsLoaded     = false;

  // ----------------------------
  // Hidden/visible modes for SnazyCam container
  // ----------------------------
  function setSnazyHiddenMode() {
    snazyContainer.style.opacity       = '0';
    snazyContainer.style.pointerEvents = 'none';
    snazyContainer.style.zIndex        = '0';
  }

  function setSnazyVisibleMode() {
    snazyContainer.style.opacity       = '1';
    snazyContainer.style.pointerEvents = 'auto';
    snazyContainer.style.zIndex        = '2000'; // below cursor ring
  }

  // ----------------------------
  // Find SnazyCam panel and internal toggle button
  // ----------------------------
  function findSnazyElements() {
    snazyPanel          = null;
    snazyControlsToggle = null;

    // Identify the SnazyCam control panel
    const divs = Array.from(document.querySelectorAll('div'));
    for (const el of divs) {
      const cs = window.getComputedStyle(el);
      const looksLikePanel =
        cs.position === 'fixed' &&
        (cs.right === '0px' || cs.right === '10px') &&
        cs.borderStyle === 'solid' &&
        cs.borderWidth !== '0px' &&
        (cs.maxWidth === '260px' || cs.maxWidth === '280px');

      if (looksLikePanel) {
        snazyPanel = el;
        break;
      }
    }

    // Identify SnazyCam's own "Open/Close Controls" button and hide it
    const btns = Array.from(document.querySelectorAll('button'));
    for (const el of btns) {
      if (el === toggleBtn) continue;
      const cs  = window.getComputedStyle(el);
      const txt = (el.textContent || '').toLowerCase();
      const looksLikeSnazyToggle =
        cs.position === 'fixed' && (txt.includes('open controls') || txt.includes('close controls') || txt.includes('controls'));

      if (looksLikeSnazyToggle) {
        snazyControlsToggle = el;
        break;
      }
    }

    if (snazyControlsToggle) {
      snazyControlsToggle.style.display       = 'none';
      snazyControlsToggle.style.pointerEvents = 'none';
      snazyControlsToggle.setAttribute('aria-hidden', 'true');
    }

    if (snazyPanel) {
      snazyPanel.style.zIndex        = '3000'; // above SnazyContainer and cursor ring
      snazyPanel.style.pointerEvents = 'auto';
    }

    if (snazyPanelVisible) showSnazyPanel();
    else hideSnazyPanel();
  }

  // ----------------------------
  // Load SnazyCam extra scripts only once
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
        // Give the DOM time for controls.js to append its panel
        setTimeout(() => {
          findSnazyElements();
          cb();
        }, 50);
      }
    };

    const script1 = document.createElement('script');
    script1.src = 'snazycam/controls.js';
    script1.onload = done;
    script1.onerror = () => {
      console.error('[KnowsNav] Failed to load snazycam/controls.js');
      done();
    };
    document.body.appendChild(script1);

    const script2 = document.createElement('script');
    script2.src = 'snazycam/hoverClick.js';
    script2.onload = done;
    script2.onerror = () => {
      console.error('[KnowsNav] Failed to load snazycam/hoverClick.js');
      done();
    };
    document.body.appendChild(script2);
  }

  // ----------------------------
  // Show/hide SnazyCam panel and video feed
  // ----------------------------
  function showSnazyPanel() {
    // Make SnazyCam video + overlay visible
    setSnazyVisibleMode();

    if (snazyPanel) {
      snazyPanel.style.display      = '';
      snazyPanel.style.opacity      = '1';
      snazyPanel.style.pointerEvents = 'auto';
    }

    snazyPanelVisible = true;
    toggleBtn.textContent = 'Hide SnazyCam';
  }

  function hideSnazyPanel() {
    // Keep SnazyCam running but hidden
    setSnazyHiddenMode();

    if (snazyPanel) {
      snazyPanel.style.display = 'none';
    }

    snazyPanelVisible = false;
    toggleBtn.textContent = 'SnazyCam Controls';
  }

  // ----------------------------
  // Single-toggle button handler
  // ----------------------------
  toggleBtn.addEventListener('click', () => {
    if (!scriptsLoaded) {
      loadSnazyScripts(() => {
        if (snazyPanelVisible) hideSnazyPanel();
        else showSnazyPanel();
      });
      return;
    }

    if (snazyPanelVisible) hideSnazyPanel();
    else showSnazyPanel();
  });

  // ----------------------------
  // Sync hover time between EyeWrite modes and SnazyCam hoverClick.js
  // ----------------------------
  function updateHoverTime() {
    const modeEl = document.getElementById('kbMode');
    if (!modeEl) return;
    const label  = (modeEl.textContent || '').toLowerCase();
    const isQuick = label.includes('quicktype');
    window.HOVER_TIME = isQuick ? 700 : 1500;
  }

  const kbToggle = document.getElementById('kbToggle');
  if (kbToggle) {
    kbToggle.addEventListener('click', () => setTimeout(updateHoverTime, 50));
  }
  updateHoverTime();

  // ----------------------------
  // Force EyeWrite cursor ring visible and on top
  // ----------------------------
  function forceCursorRingVisible() {
    const ring = document.getElementById('cursorRing');
    if (!ring) return;
    ring.classList.remove('hidden');
    ring.style.display      = 'block';
    ring.style.position     = 'fixed';
    ring.style.zIndex       = '2500';
    ring.style.pointerEvents = 'none';
  }
  forceCursorRingVisible();
  setTimeout(forceCursorRingVisible, 500);
  setTimeout(forceCursorRingVisible, 1500);

  // ----------------------------
  // Dispatch synthetic mouse move from SnazyCam to EyeWrite
  // ----------------------------
  function dispatchMouseMove(x, y) {
    const evt = new MouseEvent('mousemove', {
      clientX: x,
      clientY: y,
      bubbles:   true,
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
  // Initialize hidden mode and start loop
  // ----------------------------
  setSnazyHiddenMode();
  hideSnazyPanel();
  requestAnimationFrame(animate);
  setTimeout(findSnazyElements, 1000);
})();
