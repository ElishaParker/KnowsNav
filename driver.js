/*
 * driver.js — Integrates SnazyCam with EyeWrite
 *
 * - Keeps SnazyCam running in the background (video feed always live)
 * - Locks EyeWrite’s hover cursor to SnazyCam’s smoothed nose cursor (window.smoothedCursor)
 * - Uses one toggle button (#snazycam-toggle-btn) to bring SnazyCam and its control panel to the front
 */

(() => {
  const snazyContainer = document.getElementById('snazycam-container');
  const toggleBtn = document.getElementById('snazycam-toggle-btn');
  if (!snazyContainer || !toggleBtn) {
    console.error('[KnowsNav] Missing SnazyCam container or toggle button');
    return;
  }

  // References to SnazyCam’s dynamically created control panel and toggle button
  let snazyPanel = null;
  let snazyControlsToggle = null;
  let scriptsLoaded = false;
  let snazyPanelVisible = false;

  // Keep SnazyCam video running but hidden by default
  function setSnazyHidden() {
    snazyContainer.style.opacity = '0';
    snazyContainer.style.pointerEvents = 'none';
    snazyContainer.style.zIndex = '0';
    if (snazyPanel) snazyPanel.style.display = 'none';
    snazyPanelVisible = false;
    toggleBtn.textContent = 'SnazyCam Controls';
  }

  function setSnazyVisible() {
    snazyContainer.style.opacity = '1';
    snazyContainer.style.pointerEvents = 'auto';
    snazyContainer.style.zIndex = '2000';
    if (snazyPanel) {
      snazyPanel.style.display = '';
      snazyPanel.style.zIndex = '3000';
      snazyPanel.style.pointerEvents = 'auto';
    }
    snazyPanelVisible = true;
    toggleBtn.textContent = 'Hide SnazyCam';
  }

  // After controls.js loads, locate its panel and hide SnazyCam’s own toggle
  function findSnazyElements() {
    snazyPanel = null;
    snazyControlsToggle = null;
    for (const el of document.querySelectorAll('div')) {
      const cs = getComputedStyle(el);
      if (cs.position === 'fixed' && (cs.right === '0px' || cs.right === '10px') &&
          cs.borderStyle === 'solid' && (cs.maxWidth === '260px' || cs.maxWidth === '280px')) {
        snazyPanel = el; break;
      }
    }
    for (const el of document.querySelectorAll('button')) {
      if (el === toggleBtn) continue;
      const txt = (el.textContent || '').toLowerCase();
      if (getComputedStyle(el).position === 'fixed' &&
          (txt.includes('open controls') || txt.includes('close controls') || txt.includes('controls'))) {
        snazyControlsToggle = el; break;
      }
    }
    if (snazyControlsToggle) {
      snazyControlsToggle.style.display = 'none';
      snazyControlsToggle.style.pointerEvents = 'none';
      snazyControlsToggle.setAttribute('aria-hidden', 'true');
    }
    if (snazyPanelVisible) setSnazyVisible(); else setSnazyHidden();
  }

  // Lazy-load SnazyCam’s control scripts
  function loadSnazyScripts(cb) {
    if (scriptsLoaded) { findSnazyElements(); cb(); return; }
    let pending = 2;
    const done = () => {
      if (--pending === 0) {
        scriptsLoaded = true;
        setTimeout(() => { findSnazyElements(); cb(); }, 50);
      }
    };
    const s1 = document.createElement('script');
    s1.src = 'snazycam/controls.js'; s1.onload = done; s1.onerror = done; document.body.appendChild(s1);
    const s2 = document.createElement('script');
    s2.src = 'snazycam/hoverClick.js'; s2.onload = done; s2.onerror = done; document.body.appendChild(s2);
  }

  // Toggle SnazyCam UI
  toggleBtn.addEventListener('click', () => {
    if (!scriptsLoaded) {
      loadSnazyScripts(() => { snazyPanelVisible ? setSnazyHidden() : setSnazyVisible(); });
      return;
    }
    snazyPanelVisible ? setSnazyHidden() : setSnazyVisible();
  });

  // Make sure EyeWrite’s cursor ring is always on top
  function forceCursorRing() {
    const ring = document.getElementById('cursorRing');
    if (ring) {
      ring.classList.remove('hidden');
      ring.style.display = 'block';
      ring.style.position = 'fixed';
      ring.style.zIndex = '2500';
      ring.style.pointerEvents = 'none';
    }
  }
  forceCursorRing();
  setTimeout(forceCursorRing, 500);
  setTimeout(forceCursorRing, 1500);

  // Sync dwell time between EyeWrite (QuickType/Precision) and SnazyCam’s hoverClick
  function updateHoverTime() {
    const mode = (document.getElementById('kbMode')?.textContent || '').toLowerCase();
    window.HOVER_TIME = mode.includes('quicktype') ? 700 : 1500;
  }
  document.getElementById('kbToggle')?.addEventListener('click', () => setTimeout(updateHoverTime, 50));
  updateHoverTime();

  // Drive EyeWrite’s cursor using SnazyCam’s smoothed cursor
  function dispatchMouseMove(x, y) {
    const evt = new MouseEvent('mousemove', { clientX: x, clientY: y, bubbles: true, cancelable: true, view: window });
    document.dispatchEvent(evt);
  }
  function animate() {
    const sc = window.smoothedCursor;
    if (sc && typeof sc.x === 'number' && typeof sc.y === 'number') {
      dispatchMouseMove(sc.x, sc.y);
    }
    requestAnimationFrame(animate);
  }
  // Initialize hidden mode and start
  setSnazyHidden();
  requestAnimationFrame(animate);
  setTimeout(findSnazyElements, 1000);
})();
