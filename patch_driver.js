(() => {
  const appFrame = document.getElementById("app");

  // ---------- helpers ----------
  function pad2(n){ return String(n).padStart(2, "0"); }
  function tsStamp(d=new Date()){
    const Y = d.getFullYear();
    const M = pad2(d.getMonth()+1);
    const D = pad2(d.getDate());
    const h = pad2(d.getHours());
    const m = pad2(d.getMinutes());
    const s = pad2(d.getSeconds());
    return `${Y}${M}${D}-${h}${m}${s}`;
  }
  function autoFilename(ext){
    return `EyeWrite-note-${tsStamp()}.${ext}`;
  }

  function safeText(el){
    try {
      if (!el) return "";
      const tag = (el.tagName || "").toLowerCase();
      if (tag === "textarea" || tag === "input") return el.value || "";
      if (el.isContentEditable) return el.innerText || "";
      return el.textContent || "";
    } catch { return ""; }
  }

  function findBestEditor(doc){
    try {
      // Prefer focused element if it's editable
      const active = doc.activeElement;
      if (active) {
        const tag = (active.tagName || "").toLowerCase();
        if (tag === "textarea" || tag === "input" || active.isContentEditable) return active;
      }

      // Prefer contenteditable blocks
      const ce = Array.from(doc.querySelectorAll("[contenteditable='true'],[contenteditable=''],[contenteditable]"))
        .filter(el => el.offsetParent !== null);
      if (ce.length) {
        // pick biggest visible block
        ce.sort((a,b)=> (b.getBoundingClientRect().width*b.getBoundingClientRect().height) - (a.getBoundingClientRect().width*a.getBoundingClientRect().height));
        return ce[0];
      }

      // Prefer textareas
      const ta = Array.from(doc.querySelectorAll("textarea"))
        .filter(el => el.offsetParent !== null);
      if (ta.length) {
        ta.sort((a,b)=> (b.getBoundingClientRect().width*b.getBoundingClientRect().height) - (a.getBoundingClientRect().width*a.getBoundingClientRect().height));
        return ta[0];
      }

      // fallback
      return doc.body;
    } catch {
      return null;
    }
  }

  function insertTextAtCaret(doc, text){
    const el = findBestEditor(doc);
    if (!el) return;

    const tag = (el.tagName || "").toLowerCase();

    // textarea/input
    if (tag === "textarea" || tag === "input") {
      try {
        el.focus({ preventScroll: true });
      } catch {}
      try { el.focus(); } catch {}

      const start = el.selectionStart ?? el.value.length;
      const end   = el.selectionEnd   ?? el.value.length;
      const insert = text;

      // setRangeText is cleanest if supported
      if (typeof el.setRangeText === "function") {
        el.setRangeText(insert, start, end, "end");
      } else {
        const v = el.value || "";
        el.value = v.slice(0, start) + insert + v.slice(end);
        const pos = start + insert.length;
        try { el.setSelectionRange(pos, pos); } catch {}
      }

      // bubble input event so EyeWrite updates any bindings
      try {
        el.dispatchEvent(new Event("input", { bubbles: true }));
      } catch {}
      return;
    }

    // contenteditable
    if (el.isContentEditable) {
      try {
        el.focus({ preventScroll: true });
      } catch {}
      try { el.focus(); } catch {}

      const sel = doc.getSelection?.();
      if (!sel) {
        // append fallback
        el.innerText = (el.innerText || "") + text;
        return;
      }

      // If no range, append
      if (sel.rangeCount === 0) {
        el.innerText = (el.innerText || "") + text;
        return;
      }

      const range = sel.getRangeAt(0);
      range.deleteContents();

      const node = doc.createTextNode(text);
      range.insertNode(node);

      // move caret after inserted text
      range.setStartAfter(node);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);

      try {
        el.dispatchEvent(new Event("input", { bubbles: true }));
      } catch {}
      return;
    }

    // fallback append to body text
    try { el.textContent += text; } catch {}
  }

  function createDownload(doc, filename, mime, content){
    try {
      const blob = new Blob([content], { type: mime });
      const url = URL.createObjectURL(blob);
      const a = doc.createElement("a");
      a.href = url;
      a.download = filename;
      doc.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2500);
    } catch {}
  }

  // ---------- Save popup eliminator (inside EyeWrite iframe) ----------
  function injectAutosavePatch(benchWin){
    try {
      const eyeFrame = benchWin.document.getElementById("eyeFrame");
      if (!eyeFrame || !eyeFrame.contentWindow) return false;

      const eyeWin = eyeFrame.contentWindow;
      const eyeDoc = eyeWin.document;
      if (!eyeDoc || !eyeDoc.body) return false;

      if (eyeWin.__knowsnav_autosave_patched__) return true;
      eyeWin.__knowsnav_autosave_patched__ = true;

      // 1) Hard override prompt -> no UI, always returns generated filename
      const originalPrompt = eyeWin.prompt?.bind(eyeWin);
      eyeWin.prompt = function(promptText, defaultValue){
        // If default includes an extension, preserve it
        let ext = "txt";
        const dv = String(defaultValue || "");
        const m = dv.match(/\.(txt|docx|pdf)\b/i);
        if (m) ext = m[1].toLowerCase();

        // Sometimes they prompt only for basename -> still return full filename
        return autoFilename(ext);
      };
      eyeWin.__knowsnav_original_prompt__ = originalPrompt;

      // 2) Safety net: if they used a custom modal instead of prompt()
      //    Watch for a filename input + OK/Save button, auto-fill and click.
      const modalWatcher = new MutationObserver(() => {
        try {
          // Find a visible text input likely used for filename
          const inputs = Array.from(eyeDoc.querySelectorAll("input[type='text'], input:not([type])"))
            .filter(i => i.offsetParent !== null);

          if (!inputs.length) return;

          // If there is a select/radio for txt/docx/pdf, try to detect chosen ext
          let ext = "txt";
          const activeBtn = eyeDoc.querySelector("button.active, .active button, .active");
          const activeTxt = (activeBtn?.textContent || "").toLowerCase();
          if (activeTxt.includes("docx")) ext = "docx";
          else if (activeTxt.includes("pdf")) ext = "pdf";
          else if (activeTxt.includes("txt")) ext = "txt";

          // Fill first visible input
          const inp = inputs[0];
          const name = autoFilename(ext);
          inp.value = name;
          try { inp.dispatchEvent(new Event("input", { bubbles: true })); } catch {}

          // Try click OK / Save
          const btns = Array.from(eyeDoc.querySelectorAll("button"))
            .filter(b => b.offsetParent !== null);

          const ok = btns.find(b => /^(ok|save|download|export)$/i.test((b.textContent||"").trim()));
          if (ok) ok.click();
        } catch {}
      });
      modalWatcher.observe(eyeDoc.body, { childList: true, subtree: true });
      eyeWin.__knowsnav_modal_watcher__ = modalWatcher;

      // 3) Extra fallback: If EyeWrite has explicit "Save TXT" etc buttons that call prompt,
      //    overriding prompt is enough. But if it doesn’t call prompt, we still have the watcher.

      return true;
    } catch {
      return false;
    }
  }

  // ---------- STT (inject button into benchmark HUD so hover can click it) ----------
  function injectSTTButton(benchWin){
    try {
      const controls = benchWin.document.getElementById("driverControls");
      if (!controls) return false;

      if (benchWin.__knowsnav_stt_injected__) return true;
      benchWin.__knowsnav_stt_injected__ = true;

      const btn = benchWin.document.createElement("button");
      btn.id = "btnSTT";
      btn.textContent = "STT: OFF";
      btn.style.marginTop = "10px";

      // Keep styling consistent with existing HUD buttons (inherits your CSS)
      controls.appendChild(btn);

      // SpeechRecognition setup (runs in benchmark window context)
      const SR = benchWin.SpeechRecognition || benchWin.webkitSpeechRecognition;
      let rec = null;
      let sttOn = false;
      let restarting = false;
      let stopRequested = false;

      function setLabel(state){
        btn.textContent = `STT: ${state}`;
      }

      function getEyeDoc(){
        const eyeFrame = benchWin.document.getElementById("eyeFrame");
        if (!eyeFrame || !eyeFrame.contentWindow) return null;
        return eyeFrame.contentWindow.document || null;
      }

      function startRec(){
        if (!SR) {
          setLabel("UNSUPPORTED");
          return;
        }
        if (rec) {
          try { rec.stop(); } catch {}
          rec = null;
        }

        stopRequested = false;

        rec = new SR();
        // reliable-ish defaults for Chrome
        rec.continuous = true;
        rec.interimResults = true;
        rec.lang = "en-US"; // change later if you add language UI

        rec.onstart = () => {
          restarting = false;
          setLabel("ON");
        };

        rec.onerror = (e) => {
          // permission denied or no-speech etc.
          if (e && e.error) {
            if (e.error === "not-allowed" || e.error === "service-not-allowed") {
              setLabel("DENIED");
              sttOn = false;
              stopRequested = true;
              try { rec.stop(); } catch {}
              return;
            }
            // non-fatal errors can happen; keep state visible
            setLabel("ERROR");
          }
        };

        rec.onresult = (ev) => {
          try {
            const eyeDoc = getEyeDoc();
            if (!eyeDoc) return;

            let finalText = "";
            for (let i = ev.resultIndex; i < ev.results.length; i++) {
              const r = ev.results[i];
              if (r.isFinal) {
                finalText += (r[0]?.transcript || "");
              }
            }

            if (finalText && finalText.trim()) {
              // normalize spacing
              const insert = (finalText.trim() + " ");
              insertTextAtCaret(eyeDoc, insert);
            }
          } catch {}
        };

        rec.onend = () => {
          // Web Speech likes to end. Auto-restart when ON.
          if (stopRequested || !sttOn) {
            setLabel("OFF");
            return;
          }
          // simple restart cooldown
          if (!restarting) {
            restarting = true;
            setLabel("RESTART");
            setTimeout(() => {
              if (sttOn && !stopRequested) {
                try { rec.start(); } catch {}
              }
            }, 300);
          }
        };

        try {
          rec.start();
        } catch {
          setLabel("ERROR");
        }
      }

      function stopRec(){
        stopRequested = true;
        sttOn = false;
        setLabel("OFF");
        try { rec?.stop(); } catch {}
      }

      btn.addEventListener("click", () => {
        if (!sttOn) {
          sttOn = true;
          setLabel("START");
          startRec();
        } else {
          stopRec();
        }
      });

      return true;
    } catch {
      return false;
    }
  }

  // ---------- bootstrap ----------
  function tryInit(){
    const benchWin = appFrame.contentWindow;
    if (!benchWin || !benchWin.document) return;

    // inject autosave patch into EyeWrite
    injectAutosavePatch(benchWin);

    // inject STT button into benchmark HUD
    injectSTTButton(benchWin);
  }

  // Poll until benchmark DOM is ready + its inner iframes exist
  const timer = setInterval(() => {
    tryInit();

    const benchWin = appFrame.contentWindow;
    const ready =
      benchWin &&
      benchWin.document &&
      benchWin.document.getElementById("driverControls") &&
      benchWin.document.getElementById("eyeFrame");

    if (ready) {
      // still keep interval running lightly because EyeWrite iframe may reload
      // but we can slow down after first success
      clearInterval(timer);

      // Re-apply autosave patch periodically in case EyeWrite reloads
      setInterval(() => {
        try { injectAutosavePatch(appFrame.contentWindow); } catch {}
      }, 1200);
    }
  }, 300);

})();
