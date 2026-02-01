/*
 * Enhanced mobile viewport controller for KnowsNav.
 *
 * This script computes the true visible viewport height (using the smaller
 * of window.innerHeight and visualViewport.height), updates a root-level
 * CSS variable, injects responsive sizing into the EyeWrite iframe, and
 * suppresses the native mobile keyboard on EyeWrite’s text area.  It also
 * adapts the keyboard/text ratio for very small screens so controls aren’t
 * tiny.  The code re-runs whenever the viewport changes or the iframe reloads.
 */

(function () {
  // Determine the available viewport height without browser chrome.
  function getViewportHeight() {
    var inner = window.innerHeight;
    var visual = (window.visualViewport && typeof window.visualViewport.height === 'number') ? window.visualViewport.height : Infinity;
    return Math.min(inner, visual);
  }

  // Inject CSS overrides and disable the OS keyboard inside EyeWrite.
  function patchEyeWrite(frame, appHeight) {
    if (!frame || !frame.contentWindow) return;
    const eyeWin = frame.contentWindow;
    const eyeDoc = frame.contentDocument || eyeWin.document;
    if (!eyeDoc || !eyeDoc.head || !eyeDoc.documentElement) return;

    eyeDoc.documentElement.style.setProperty('--knowsnav-app-height', `${appHeight}px`);

    // Adjust ratios: phones under ~700 px tall get bigger keyboard and text area.
    const smallScreen = appHeight < 700;
    const ratioKeyboard = smallScreen ? 0.5 : 0.4;
    const ratioText    = smallScreen ? 0.45 : 0.36;
    const ratioScroll  = smallScreen ? (ratioKeyboard + 0.04) : 0.41;

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
        height: calc(var(--knowsnav-app-height) * ${ratioKeyboard}) !important;
        min-height: calc(var(--knowsnav-app-height) * ${ratioKeyboard}) !important;
        max-height: calc(var(--knowsnav-app-height) * ${ratioKeyboard}) !important;
      }
      #textContainer {
        height: calc(var(--knowsnav-app-height) - (var(--knowsnav-app-height) * ${ratioText}) - 64px) !important;
        min-height: calc(var(--knowsnav-app-height) - (var(--knowsnav-app-height) * ${ratioText}) - 64px) !important;
        max-height: calc(var(--knowsnav-app-height) - (var(--knowsnav-app-height) * ${ratioText}) - 64px) !important;
      }
      #scrollDown {
        bottom: calc(var(--knowsnav-app-height) * ${ratioScroll}) !important;
      }
    `;

    // Suppress the native mobile keyboard on the contenteditable div.
    try {
      const textArea = eyeDoc.getElementById('textArea');
      if (textArea) {
        textArea.setAttribute('inputmode', 'none');
        textArea.setAttribute('virtualkeyboardpolicy', 'manual');

        if (!textArea.__knowsnav_onFocus) {
          textArea.__knowsnav_onFocus = function (ev) {
            try {
              ev.preventDefault();
              ev.stopPropagation();
              textArea.blur();
              const vk = eyeWin.navigator && eyeWin.navigator.virtualKeyboard;
              if (vk && typeof vk.hide === 'function') {
                vk.hide();
              }
            } catch {}
          };
        }
        if (!textArea.__knowsnav_onTouchStart) {
          textArea.__knowsnav_onTouchStart = function (ev) {
            ev.preventDefault();
            ev.stopPropagation();
          };
        }
        textArea.removeEventListener('focus', textArea.__knowsnav_onFocus);
        textArea.addEventListener('focus', textArea.__knowsnav_onFocus);
        textArea.removeEventListener('touchstart', textArea.__knowsnav_onTouchStart);
        textArea.addEventListener('touchstart', textArea.__knowsnav_onTouchStart);
      }
    } catch {
      // If we can’t access the text area or VirtualKeyboard API, ignore.
    }
  }

  // Recompute the viewport height and update both driver and EyeWrite.
  function updateAppSizing() {
    const vh = getViewportHeight();
    document.documentElement.style.setProperty('--knowsnav-app-height', `${vh}px`);
    const eyeFrame = document.getElementById('eyeFrame');
    if (eyeFrame) {
      try { patchEyeWrite(eyeFrame, vh); } catch {}
    }
  }

  // Initial sizing and injection.
  updateAppSizing();

  // Respond to viewport changes.
  window.addEventListener('resize', updateAppSizing);
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', updateAppSizing);
  }

  // Reinjection when EyeWrite reloads.
  const eyeFrame = document.getElementById('eyeFrame');
  if (eyeFrame) {
    eyeFrame.addEventListener('load', () => {
      updateAppSizing();
    });
  }

  // Mark body as mobile when pointer is coarse and width is small.
  try {
    const isMobile = window.matchMedia('(pointer: coarse) and (max-width: 768px)').matches;
    if (isMobile) document.body.classList.add('mobile');
  } catch {}
})();
