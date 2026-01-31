/*
  Patch for EyeWrite Save Function
  ---------------------------------
  This patch runs in the parent KnowsNav driver page and injects logic into
  the EyeWrite iframe to bypass the filename prompt and perform an
  immediate TXT download when the user selects a save format.  If DOCX
  or PDF buttons are clicked, the patch falls back to TXT until proper
  exporters are implemented.

  Usage: include this script after driver.js in driver.html.  It will
  automatically attach itself when the EyeWrite iframe is ready.
*/

(function () {
  // Format a Date into YYYYMMDD-HHMMSS (local time, zero padded)
  function formatTimestamp(date) {
    const pad = (n) => String(n).padStart(2, '0');
    const y = date.getFullYear();
    const m = pad(date.getMonth() + 1);
    const d = pad(date.getDate());
    const h = pad(date.getHours());
    const mm = pad(date.getMinutes());
    const s = pad(date.getSeconds());
    return `${y}${m}${d}-${h}${mm}${s}`;
  }

  // Generate a filename with prefix and extension
  function generateFilename(ext) {
    const ts = formatTimestamp(new Date());
    return `EyeWrite-note-${ts}.${ext}`;
  }

  // Download the current text content as TXT
  function downloadTxt(eyeWin) {
    try {
      const doc = eyeWin.document;
      const textEl = doc.getElementById('textArea');
      if (!textEl) return;
      // Use innerText for plain text export
      const content = textEl.innerText || '';
      const blob = new Blob([content], { type: 'text/plain' });
      const fileName = generateFilename('txt');
      const url = eyeWin.URL.createObjectURL(blob);
      const a = doc.createElement('a');
      a.href = url;
      a.download = fileName;
      // Append to body to ensure the click works in all browsers
      doc.body.appendChild(a);
      a.click();
      // Cleanup
      doc.body.removeChild(a);
      eyeWin.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('downloadTxt error', err);
    }
  }

  // Hook save buttons inside EyeWrite
  function attachSaveInterceptor(eyeWin) {
    const doc = eyeWin.document;
    if (!doc) return;
    // Safety: override prompt to avoid blocking dialogues if any legacy code calls it
    try {
      eyeWin.prompt = function () {
        // Return a base name; extension will be added in download function
        return generateFilename('txt');
      };
    } catch {}
    // Capture click events on the document before EyeWrite's handler
    doc.addEventListener(
      'click',
      function (e) {
        // Determine if a save-menu button was clicked
        const target = e.target.closest('[data-format]');
        if (!target) return;
        const fmt = (target.dataset && target.dataset.format) || '';
        if (!fmt) return;
        // Intercept and prevent EyeWrite's default save handler
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        // Only TXT export is currently supported; fallback for others
        if (fmt === 'txt' || fmt === 'docx' || fmt === 'pdf') {
          // Fallback to TXT until other exporters are available
          downloadTxt(eyeWin);
        }
      },
      true
    );
  }

  // Wait for the EyeWrite iframe to load and attach the interceptor
  function initSavePatch() {
    const frame = document.getElementById('eyeFrame');
    if (!frame) return;
    // If the contentWindow is already ready
    function tryAttach() {
      const eyeWin = frame.contentWindow;
      if (!eyeWin || !eyeWin.document) {
        setTimeout(tryAttach, 100);
        return;
      }
      // Document might not be fully loaded yet; wait for ready state
      if (eyeWin.document.readyState !== 'complete') {
        setTimeout(tryAttach, 100);
        return;
      }
      attachSaveInterceptor(eyeWin);
    }
    // Use load event to ensure the iframe is ready
    frame.addEventListener('load', tryAttach);
    // Also attempt immediately in case the iframe is already loaded
    tryAttach();
  }

  // Initialize when parent document is ready
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    initSavePatch();
  } else {
    document.addEventListener('DOMContentLoaded', initSavePatch);
  }
})();
