/*
  Patch for EyeWrite Save Function
  ---------------------------------
  This patch runs in the parent KnowsNav driver page and injects logic into
  the EyeWrite iframe to bypass the filename prompt and perform an
  immediate TXT download when the user selects a save format. If DOCX
  or PDF buttons are clicked, the patch falls back to TXT until proper
  exporters are implemented.

  UPDATED FILENAME RULE:
  - Filename uses first 3 words of the editor text (sanitized)
  - Then "__YYYY_MM_DD_N" where N counts up per day (stored in localStorage)
  - Example: "This_is_KnowsNav__2026_01_30_1.txt"

  Usage: include this script after driver.js in driver.html. It will
  automatically attach itself when the EyeWrite iframe is ready.
*/

(function () {
  // ---------- Helpers: filename generation ----------

  // Get local date stamp YYYY_MM_DD
  function getDateStamp() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}_${m}_${day}`;
  }

  // Sanitize and extract first 3 words, joined by underscores
  function firstThreeWordsSlug(text) {
    const cleaned = (text || "")
      .replace(/[^\w\s]/g, "")   // remove punctuation/symbols
      .trim();

    if (!cleaned) return "EyeWrite";

    const words = cleaned.split(/\s+/).slice(0, 3).join("_");
    return words || "EyeWrite";
  }

  // Increment and return daily counter stored in localStorage (per browser)
  function nextDailyCounter(dateStamp) {
    const key = `eyewrite_save_counter_${dateStamp}`;
    const current = Number(localStorage.getItem(key) || 0) + 1;
    localStorage.setItem(key, String(current));
    return current;
  }

  // Generate filename based on content
  function generateFilenameFromContent(content, ext) {
    const dateStamp = getDateStamp();
    const n = nextDailyCounter(dateStamp);
    const slug = firstThreeWordsSlug(content);
    return `${slug}__${dateStamp}_${n}.${ext}`;
  }

  // ---------- Download the current text content as TXT ----------
  function downloadTxt(eyeWin) {
    try {
      const doc = eyeWin.document;
      const textEl = doc.getElementById("textArea");
      if (!textEl) return;

      // Use innerText for plain text export
      const content = textEl.innerText || "";
      const blob = new Blob([content], { type: "text/plain" });

      // NEW: filename from first 3 words + YYYY_MM_DD + daily counter
      const fileName = generateFilenameFromContent(content, "txt");

      const url = eyeWin.URL.createObjectURL(blob);
      const a = doc.createElement("a");
      a.href = url;
      a.download = fileName;

      // Append to body to ensure the click works in all browsers
      doc.body.appendChild(a);
      a.click();

      // Cleanup
      doc.body.removeChild(a);
      eyeWin.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("downloadTxt error", err);
    }
  }

  // ---------- Hook save buttons inside EyeWrite ----------
  function attachSaveInterceptor(eyeWin) {
    const doc = eyeWin.document;
    if (!doc) return;

    // Safety: override prompt to avoid blocking dialogues if legacy code calls it
    // Return something harmless; we don't rely on it anymore.
    try {
      eyeWin.prompt = function () {
        return "EyeWrite";
      };
    } catch {}

    // Capture click events on the document before EyeWrite's handler
    doc.addEventListener(
      "click",
      function (e) {
        const target = e.target.closest("[data-format]");
        if (!target) return;

        const fmt = (target.dataset && target.dataset.format) || "";
        if (!fmt) return;

        // Intercept and prevent EyeWrite's default save handler
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();

        // Only TXT export is currently supported; fallback for DOCX/PDF too
        if (fmt === "txt" || fmt === "docx" || fmt === "pdf") {
          downloadTxt(eyeWin);
        }
      },
      true
    );
  }

  // ---------- Wait for the EyeWrite iframe to load and attach the interceptor ----------
  function initSavePatch() {
    const frame = document.getElementById("eyeFrame");
    if (!frame) return;

    function tryAttach() {
      const eyeWin = frame.contentWindow;
      if (!eyeWin || !eyeWin.document) {
        setTimeout(tryAttach, 100);
        return;
      }

      if (eyeWin.document.readyState !== "complete") {
        setTimeout(tryAttach, 100);
        return;
      }

      attachSaveInterceptor(eyeWin);
    }

    frame.addEventListener("load", tryAttach);
    tryAttach();
  }

  // ---------- Initialize when parent document is ready ----------
  if (document.readyState === "complete" || document.readyState === "interactive") {
    initSavePatch();
  } else {
    document.addEventListener("DOMContentLoaded", initSavePatch);
  }
})();
