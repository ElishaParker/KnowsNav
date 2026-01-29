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

    // Identify the control panel by its computed styles rather than text.
    // The panel is a fixed-position div with a cyan border and maxWidth of 260px.
    const divs = Array.from(document.querySelectorAll('div'));
    for (const el of divs) {
      const cs = window.getComputedStyle(el);
      if (cs.position === 'fixed' && cs.maxWidth === '260px' && cs.borderStyle === 'solid') {
        snazyPanel = el;
        break;
      }
    }

    // Identify the panel toggle button: a fixed-position button not equal to our driver button
    const btns = Array.from(document.querySelectorAll('button'));
    for (const el of btns) {
      if (el === toggleBtn) continue;
      const cs = window.getComputedStyle(el);
      const text = el.textContent || '';
      if (cs.position === 'fixed' && text && text.includes('Controls')) {
        snazyControlsToggle = el;
        break;
      }
    }

    // Hide them if not visible
    if (!snazyVisible) hideSnazy();
  }

  // Delay element lookup until controls.js has executed
  setTimeout(findSnazyElements, 1000);

  /**
   * Hide the SnazyCam interface: video, overlay, panel, and panel toggle.
   */
  function hideSnazy() {
    snazyContainer.style.display = 'none';
    if (snazyPanel) {
      snazyPanel.style.display = 'none';
    }
    if (snazyControlsToggle) {
      snazyControlsToggle.style.display = 'none';
    }
  }

  /**
   * Show the SnazyCam interface: video, overlay, panel, and panel toggle.
   */
  function showSnazy() {
    snazyContainer.style.display = 'block';
    if (snazyPanel) {
      snazyPanel.style.display = '';
    }
    if (snazyControlsToggle) {
      snazyControlsToggle.style.display = '';
    }
  }

  // Initial state: SnazyCam hidden
  hideSnazy();
  let snazyVisible = false;

  // Toggle handler for SnazyCam
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
