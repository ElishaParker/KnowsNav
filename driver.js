/*
 * driver.js — KnowsNav integration driver
 *
 * This script ties together the EyeWrite UI and SnazyCam nose
 * tracking without modifying either codebase. It performs three
 * primary functions:
 *   1. Dispatch synthetic mousemove events based on
 *      `window.smoothedCursor` so EyeWrite’s dwell ring follows
 *      nose movements.
 *   2. Synchronize hover/dwell timing between EyeWrite’s QuickType
 *      and Precision modes by adjusting `window.HOVER_TIME` used by
 *      SnazyCam’s hoverClick.js.
 *   3. Provide a toggle button to show/hide the full SnazyCam
 *      interface (webcam feed, overlay, and control panel) on top
 *      of EyeWrite. This allows users to tune tracking settings
 *      without leaving the writing interface.
 *
 * IMPORTANT:
 * - This file is the only place where “integration glue” lives.
 * - EyeWrite and SnazyCam folders remain verbatim / unmodified.
 * - Layering is controlled by z-index + pointer-events so SnazyCam
 *   can run “under” EyeWrite, then be lifted above it on demand.
 */

(() => {
  /**
   * Lazily load SnazyCam control and hoverClick scripts the first
   * time the user toggles the SnazyCam interface. Once loaded,
   * subsequent calls will invoke the callback immediately.
   *
   * @param {Function} cb Callback invoked after scripts have loaded
   */
  function loadSnazyScripts(cb) {
    if (window._snazyScriptsLoaded) {
      // Ensure elements are found before callback
      if (!snazyPanel || !snazyControlsToggle) findSnazyElements();
      cb();
      return;
    }
    let pending = 2;
    const done = () => {
      pending--;
      if (pending === 0) {
        window._snazyScriptsLoaded = true;
        // Discover panel and toggle created by controls.js
        findSnazyElements();
        cb();
      }
    };

    const script1 = document.createElement('script');
    script1.src = 'snazycam/controls.js';
    script1.onload = done;
    document.body.appendChild(script1);

    const script2 = document.createElement('script');
    script2.src = 'snazycam/hoverClick.js';
    script2.onload = done;
    document.body.appendChild(script2);
  }

  // --- DOM references ---
  const snazyContainer = document.getElementById('snazycam-container');
  const toggleBtn = document.getElementById('snazycam-toggle-btn');

  // Hold references to SnazyCam control panel and its toggle so we can
  // show/hide them when switching modes.
  let snazyPanel = null;
  let snazyControlsToggle = null;

  // Visibility state
  let snazyVisible = false;

  /**
   * Attempt to locate SnazyCam’s control panel and toggle button.
   * They are created dynamically by snazycam/controls.js and appended
   * to document.body. We search for a div containing the heading
   * “Tracking Settings” and a button whose label includes “Controls”.
   */
  function findSnazyElements() {
    // Reset references
    snazyPanel = null;
    snazyControlsToggle = null;

    // Identify the control panel by computed styles rather than exact text
    // (keeps this resilient if text changes).
    // The panel is typically a fixed-position div with maxWidth ~ 260px
    // and a visible border.
    const divs = Array.from(document.querySelectorAll('div'));
    for (const el of divs) {
      const cs = window.getComputedStyle(el);
      if (cs.position === 'fixed' && cs.maxWidth === '260px' && cs.borderStyle === 'solid') {
        snazyPanel = el;
        break;
      }
    }

    // Identify the panel toggle button:
    // a fixed-position button (not our driver button) whose text includes "Controls"
    const btns = Array.from(document.querySelectorAll('button'));
    for (const el of btns) {
      if (el === toggleBtn) continue;
      const cs = window.getComputedStyle(el);
      const text = (el.textContent || '').trim();
      if (cs.position === 'fixed' && text && text.includes('Controls')) {
        snazyControlsToggle = el;
        break;
      }
    }

    // Apply correct visibility + stacking immediately
    if (!snazyVisible) hideSnazy();
    else showSnazy();
  }

  // Delay element lookup until controls.js has executed (when it exists)
  setTimeout(findSnazyElements, 1000);

  /**
   * Hide the SnazyCam interface: video, overlay, panel, and panel toggle.
   * Also drop SnazyCam behind EyeWrite.
   */
  function hideSnazy() {
    if (snazyContainer) {
      // Hide camera layer
      snazyContainer.style.display = 'none';

      // Drop behind EyeWrite when hidden
      snazyContainer.style.zIndex = '50';
      snazyContainer.style.pointerEvents = 'none';
    }

    if (snazyPanel) {
      snazyPanel.style.display = 'none';
      snazyPanel.style.zIndex = '50';
      snazyPanel.style.pointerEvents = 'none';
    }

    if (snazyControlsToggle) {
      snazyControlsToggle.style.display = 'none';
      snazyControlsToggle.style.zIndex = '50';
      snazyControlsToggle.style.pointerEvents = 'none';
    }
  }

  /**
   * Show the SnazyCam interface: video, overlay, panel, and panel toggle.
   * Also lift SnazyCam above EyeWrite.
   */
  function showSnazy() {
    if (snazyContainer) {
      snazyContainer.style.display = 'block';

      // Bring EVERYTHING above EyeWrite
      snazyContainer.style.zIndex = '9999';
      snazyContainer.style.pointerEvents = 'auto';
    }

    // The controls UI (panel + its button) must be even higher so it
    // can be clicked above webcam/canvas and above EyeWrite toolbar.
    if (snazyPanel) {
      snazyPanel.style.display = '';
      snazyPanel.style.zIndex = '10000';
      snazyPanel.style.pointerEvents = 'auto';
    }

    if (snazyControlsToggle) {
      snazyControlsToggle.style.display = '';
      snazyControlsToggle.style.zIndex = '10001';
      snazyControlsToggle.style.pointerEvents = 'auto';
    }
  }

  // Initial state: SnazyCam hidden
  hideSnazy();

  // Toggle handler for SnazyCam
  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      snazyVisible = !snazyVisible;

      if (snazyVisible) {
        // Lazily load SnazyCam controls and hoverClick scripts if not loaded
        loadSnazyScripts(() => {
          showSnazy();
          toggleBtn.textContent = 'Hide SnazyCam';
        });
      } else {
        hideSnazy();
        toggleBtn.textContent = 'SnazyCam Controls';
      }
    });
  }

  /**
   * Update SnazyCam’s dwell time to match EyeWrite’s QuickType/Precision
   * mode. EyeWrite displays the current mode in #kbMode. When
   * QuickType is active the dwell time should be shorter (0.7 s);
   * otherwise it defaults to 1.5 s.
   */
  function updateHoverTime() {
    const modeEl = document.getElementById('kbMode');
    if (!modeEl) return;
    const text = modeEl.textContent || '';
    const quick = text.includes('QuickType');
    window.HOVER_TIME = quick ? 700 : 1500;
  }

  // Observe QuickType toggle changes
  const kbToggle = document.getElementById('kbToggle');
  if (kbToggle) {
    kbToggle.addEventListener('click', () => {
      // Delay slightly to let EyeWrite update the label
      setTimeout(updateHoverTime, 50);
    });
  }

  // Set dwell time once at startup
  updateHoverTime();

  /**
   * Dispatch a synthetic mousemove event on the document. This lets
   * EyeWrite’s event listeners pick up nose position updates and move
   * the dwell ring accordingly.
   *
   * @param {number} x Client X coordinate
   * @param {number} y Client Y coordinate
   */
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

  /**
   * Animation loop: read smoothedCursor from SnazyCam and dispatch
   * mousemove events each frame. This ensures EyeWrite follows the
   * nose cursor in real time.
   */
  function animate() {
    const sc = window.smoothedCursor;
    if (sc && typeof sc.x === 'number' && typeof sc.y === 'number') {
      dispatchMouseMove(sc.x, sc.y);
    }
    requestAnimationFrame(animate);
  }
  requestAnimationFrame(animate);
})();
