/*
  Speech‑to‑Text (STT) driver for KnowsNav
  ---------------------------------------
  This script adds a hover‑clickable STT toggle button to the KnowsNav
  driver HUD.  It uses the Web Speech API to perform speech recognition
  in the browser and inserts recognized text into the EyeWrite editor.

  Features:
  - One button toggles STT on/off; states are reflected in the label.
  - Handles microphone permission request on first activation.
  - Continuous recognition with auto‑restart on unexpected stops.
  - Pauses recognition while the EyeWrite Speak (TTS) feature is speaking.
  - Inserts final transcripts at the end of the contenteditable editor.

  Limitations:
  - Browser support varies; Chrome provides the most stable experience.
  - Only plain English recognition is configured; to support other
    languages, set recognition.lang accordingly.

  Usage: include this script after driver.js in driver.html.  It will
  automatically append a button to the driverControls element.
*/

(function () {
  // Create and insert the STT button into the driver HUD
  function createSttButton() {
    const controls = document.getElementById('driverControls');
    if (!controls) return null;
    const btn = document.createElement('button');
    btn.id = 'btnSTT';
    btn.textContent = 'STT: OFF';
    // Style matches existing HUD buttons via driver.css
    controls.appendChild(btn);
    return btn;
  }

  // Insert text at the end of the EyeWrite editor
  function insertTextAtEnd(text) {
    try {
      const frame = document.getElementById('eyeFrame');
      if (!frame) return;
      const eyeWin = frame.contentWindow;
      if (!eyeWin) return;
      const doc = eyeWin.document;
      const editor = doc.getElementById('textArea');
      if (!editor) return;
      // If the editor is contenteditable (div), append a text node
      if (editor.isContentEditable) {
        // Move caret to end
        editor.focus();
        const sel = eyeWin.getSelection();
        if (!sel) return;
        sel.removeAllRanges();
        const range = doc.createRange();
        range.selectNodeContents(editor);
        range.collapse(false);
        sel.addRange(range);
        // Insert text
        const node = doc.createTextNode(text);
        range.insertNode(node);
        // Move caret after inserted text
        range.setStartAfter(node);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
      } else {
        // Fallback: append to value/innerText
        editor.innerText += text;
      }
    } catch (err) {
      console.error('insertTextAtEnd error', err);
    }
  }

  // STT state management
  let recognition = null;
  let sttActive = false;
  let pausedForTts = false;
  let sttReady = false;
  let lastError = '';

  // Update button label according to state
  function updateButton(btn, state) {
    btn.textContent = `STT: ${state}`;
  }

  // Initialize SpeechRecognition instance
  function initRecognition(btn) {
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRec) {
      lastError = 'unsupported';
      updateButton(btn, 'UNAVAIL');
      btn.disabled = true;
      return;
    }
    recognition = new SpeechRec();
    recognition.lang = 'en-US';
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          const transcript = result[0].transcript;
          // Insert recognized text followed by a space
          insertTextAtEnd(transcript.trim() + ' ');
        }
      }
    };
    recognition.onerror = (event) => {
      console.error('STT error:', event.error);
      lastError = event.error || 'error';
      updateButton(btn, 'ERROR');
      sttActive = false;
    };
    recognition.onend = () => {
      // If STT should be active and not paused for TTS, restart automatically
      if (sttActive && !pausedForTts && recognition) {
        try {
          recognition.start();
          updateButton(btn, 'ON');
        } catch (err) {
          console.error('STT restart error', err);
        }
      }
    };
    sttReady = true;
  }

  // Start recognition (requires user gesture for permission)
  function startStt(btn) {
    if (!recognition) initRecognition(btn);
    if (!recognition || !sttReady) return;
    try {
      recognition.start();
      sttActive = true;
      updateButton(btn, 'ON');
    } catch (err) {
      console.error('STT start error', err);
      lastError = err.message || 'error';
      updateButton(btn, 'ERROR');
    }
  }

  // Stop recognition
  function stopStt(btn) {
    if (recognition) {
      try {
        recognition.stop();
      } catch {}
    }
    sttActive = false;
    pausedForTts = false;
    updateButton(btn, 'OFF');
  }

  // Monitor SpeechSynthesis to pause/resume STT
  function monitorTts(btn) {
    // Use a polling loop to check TTS state
    setInterval(() => {
      try {
        const synth = window.speechSynthesis;
        const speaking = synth && synth.speaking;
        if (sttActive) {
          if (speaking && !pausedForTts) {
            // Pause STT while TTS is speaking
            pausedForTts = true;
            if (recognition) {
              try { recognition.stop(); } catch {}
            }
            updateButton(btn, 'PAUSED');
          } else if (!speaking && pausedForTts) {
            // Resume STT when TTS stops
            pausedForTts = false;
            if (recognition && sttActive) {
              try { recognition.start(); updateButton(btn, 'ON'); } catch {}
            }
          }
        }
      } catch (err) {
        console.error('TTS monitor error', err);
      }
    }, 600);
  }

  // Main initialization
  function initSttDriver() {
    const btn = createSttButton();
    if (!btn) return;
    // Click handler for toggle (hover-click triggers a synthetic click)
    btn.addEventListener('click', () => {
      // On first click, init recognition if not ready
      if (!recognition && !sttReady) {
        initRecognition(btn);
      }
      if (!sttReady) return;
      if (!sttActive) {
        startStt(btn);
      } else {
        stopStt(btn);
      }
    });
    // Start monitoring TTS
    monitorTts(btn);
  }

  // Initialize after DOM is ready
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    initSttDriver();
  } else {
    document.addEventListener('DOMContentLoaded', initSttDriver);
  }
})();
