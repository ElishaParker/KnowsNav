/*
 * Enhanced mobile viewport controller for KnowsNav.
 *
 * Computes the true visible viewport height, updates a CSS custom
 * property on the root element, injects responsive overrides into
 * EyeWrite’s document, and hides the native mobile keyboard in
 * EyeWrite’s contenteditable area.
 */
(function () {
  // Return the visible viewport height (visualViewport if available)
  function getViewportHeight() {
    if (window.visualViewport && typeof window.visualViewport.height === 'number') {
      return window.visualViewport.height;
    }
    return window.innerHeight;
  }

  // Inject overrides and disable the OS keyboard inside EyeWrite
  function patchEyeWrite(frame, appHeight) {
    if (!frame || !frame.contentWindow) return;
    const eyeWin = frame.contentWindow;
    const eyeDoc = frame.contentDocument || eyeWin.document;
    if (!eyeDoc || !eyeDoc.head || !eyeDoc.documentElement) return;

    eyeDoc.documentElement.style.setProperty('--knowsnav-app-height', `${appHeight}px`);

    // Create/update a style tag that overrides the vh-dependent rules
    let style = eyeDoc.getElementById('__knowsnav_mobile_style');
    if (!style) {
      style = eyeDoc.createElement('style');
      style.id = '__knowsnav_mobile_style';
      eyeDoc.head.appendChild(style);
    }
    style.textContent = `
      :root {
        --knowsnav-app-height: ${appHeight}px;
      }
      body {
        height: var(--knowsnav-app-height) !important;
        min-height: var(--knowsnav-app-height) !important;
        max-height: var(--knowsnav-app-height) !important;
        overflow: hidden !important;
      }
      #keyboard {
        height: calc(var(--knowsnav-app-height) * 0.4) !important;
        min-height: calc(var(--knowsnav-app-height) * 0.4) !important;
        max-height: calc(var(--knowsnav-app-height) * 0.4) !important;
      }
      #textContainer {
        height: calc(var(--knowsnav-app-height) - (var(--knowsnav-app-height) * 0.36) - 64px) !important;
        min-height: calc(var(--knowsnav-app-height) - (var(--knowsnav-app-height) * 0.36) - 64px) !important;
        max-height: calc(var(--knowsnav-app-height) - (var(--knowsnav-app-height) * 0.36) - 64px) !important;
      }
      #scrollDown {
        bottom: calc(var(--knowsnav-app-height) * 0.41) !important;
      }
    `;

    // Mark the contenteditable as manual keyboard and hide the OS keyboard on focus/touch
    try {
      const textArea = eyeDoc.getElementById('textArea');
      if (textArea) {
        textArea.setAttribute('virtualkeyboardpolicy', 'manual'); // requires Chrome ≥116:contentReference[oaicite:1]{index=1}
        textArea.setAttribute('inputmode', 'none');
        const hideVK = () => {
          try {
            const vk = eyeWin.navigator && eyeWin.navigator.virtualKeyboard;
            if (vk && typeof vk.hide === 'function') vk.hide();
          } catch {}
        };
        textArea.removeEventListener('focus', hideVK);
        textArea.addEventListener('focus', hideVK);
        textArea.removeEventListener('touchstart', hideVK);
        textArea.addEventListener('touchstart', hideVK);
      }
    } catch {
      /* do nothing if we can’t access the element or API */
    }
  }

  // Update sizes and propagate them into EyeWrite
  function updateAppSizing() {
    const vh = getViewportHeight();
    document.documentElement.style.setProperty('--knowsnav-app-height', `${vh}px`);
    const eyeFrame = document.getElementById('eyeFrame');
    if (eyeFrame) {
      try {
        patchEyeWrite(eyeFrame, vh);
      } catch {}
    }
  }

  // Initial run
  updateAppSizing();

  // Recalculate on resize/orientation
  window.addEventListener('resize', updateAppSizing);
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', updateAppSizing);
  }

  // If the EyeWrite iframe reloads, reinject the overrides
  const eyeFrame = document.getElementById('eyeFrame');
  if (eyeFrame) {
    eyeFrame.addEventListener('load', () => {
      updateAppSizing();
    });
  }

  // Add a class on touch devices once
  try {
    const isMobile = window.matchMedia('(pointer: coarse) and (max-width: 768px)').matches;
    if (isMobile) document.body.classList.add('mobile');
  } catch {}
})();
