/* ============================================================
   EyeWrite v1.6.4 — Stable Layout + Hover + Save Patch (Clean)
   ============================================================ */
document.addEventListener("DOMContentLoaded", () => {
  const textBox = document.getElementById("textArea");
  const ring = document.getElementById("cursorRing");
  const hoverBtn = document.getElementById("hoverToggle");
  const saveBtn = document.getElementById("saveBtn");
  const saveMenu = document.getElementById("saveMenu");
  let quickType = false, shiftOn = false, capsOn = false;
  let hoverMode = true, dwellTimer = null, debounce = false;

  // ---------- Cursor Mode Controls ----------
  document.getElementById("cursorDefault").onclick = () => (textBox.style.cursor = "default");
  document.getElementById("cursorCross").onclick = () => (textBox.style.cursor = "crosshair");
  document.getElementById("cursorText").onclick = () => (textBox.style.cursor = "text");

  // ---------- Hover Toggle ----------
  hoverBtn.onclick = () => {
    hoverMode = !hoverMode;
    hoverBtn.textContent = hoverMode ? "🌀 Hover ON" : "🌀 Hover OFF";
    hoverBtn.classList.toggle("active", hoverMode);
  };

  // ---------- Font & Formatting ----------
  document.getElementById("fontSelect").onchange = e => (textBox.style.fontFamily = e.target.value);
  document.getElementById("fontSize").onchange = e => (textBox.style.fontSize = e.target.value + "px");
  document.getElementById("boldBtn").onclick = () => document.execCommand("bold");
  document.getElementById("italicBtn").onclick = () => document.execCommand("italic");
  document.getElementById("underlineBtn").onclick = () => document.execCommand("underline");

  // ---------- Autosave ----------
  textBox.innerHTML = localStorage.getItem("textData") || "";
  setInterval(() => localStorage.setItem("textData", textBox.innerHTML), 5000);

  // ---------- Scroll Buttons ----------
  const scrollStep = 150;
  document.getElementById("scrollUp").onclick = () =>
    textBox.scrollBy({ top: -scrollStep, behavior: "smooth" });
  document.getElementById("scrollDown").onclick = () =>
    textBox.scrollBy({ top: scrollStep, behavior: "smooth" });

  // ---------- Dwell Ring ----------
  document.addEventListener("mousemove", e => {
    ring.style.left = `${e.clientX - 11}px`;
    ring.style.top = `${e.clientY - 11}px`;
  });

  function startDwell(el) {
    if (debounce || !hoverMode) return;
    if (!el.matches("button,select,input")) return;

    ring.classList.remove("hidden");
    const dwellTime = quickType ? 700 : 1500;
    ring.style.animation = "none";
    void ring.offsetWidth;
    ring.style.animation = `ringFill ${dwellTime}ms linear forwards`;
    dwellTimer = setTimeout(() => el.click(), dwellTime);
  }

  function endDwell() {
    ring.classList.add("hidden");
    clearTimeout(dwellTimer);
  }

  function registerHoverables() {
    document.querySelectorAll("button,select,input").forEach(el => {
      el.onmouseenter = () => startDwell(el);
      el.onmouseleave = endDwell;
    });
  }
  registerHoverables();
  new MutationObserver(registerHoverables).observe(document.body, { childList: true, subtree: true });

  // ---------- Keyboard ----------
  const layout = [
    ["`","1","2","3","4","5","6","7","8","9","0","-","=","⌫"],
    ["Tab","Q","W","E","R","T","Y","U","I","O","P","[","]","\\"],
    ["Caps","A","S","D","F","G","H","J","K","L",";","'","↵"],
    ["Shift","Z","X","C","V","B","N","M",",",".","/","↑"],
    ["Ctrl","␣","Alt","←","↓","→"]
  ];
  const rows = ["row1","row2","row3","row4","row5"];

  function buildKeyboard() {
    rows.forEach((r, i) => {
      const row = document.getElementById(r);
      row.innerHTML = "";
      layout[i].forEach(k => {
        const b = document.createElement("button");
        b.textContent = k;
        if (["⌫","Tab","Caps","Shift","Ctrl","Alt","␣","↵"].includes(k))
          b.classList.add(k === "␣" ? "extraWide" : "wide");
        b.onclick = () => keyAction(k);
        row.appendChild(b);
      });
    });
    registerHoverables();
  }
  buildKeyboard();

  function keyAction(k) {
    if (debounce) return;
    debounce = true; setTimeout(() => (debounce = false), 200);
    switch (k) {
      case "␣": insert(" "); break;
      case "↵": insert("\n"); break;
      case "⌫": document.execCommand("delete"); break;
      case "Tab": insert("    "); break;
      case "Caps": capsOn = !capsOn; break;
      case "Shift": shiftOn = true; setTimeout(() => (shiftOn = false), 800); break;
      default: insert(formatChar(k));
    }
  }
  function formatChar(k) {
    const base = k.length === 1 ? k : k.charAt(0);
    return (shiftOn ^ capsOn) ? base.toUpperCase() : base.toLowerCase();
  }
  function insert(c) {
    document.execCommand("insertText", false, c);
  }

  // ---------- Search & Speak ----------
  document.getElementById("searchBtn").onclick = () =>
    window.open(`https://duckduckgo.com/?q=${encodeURIComponent(textBox.innerText)}`,
      "_blank",
      `width=${screen.availWidth / 2},height=${screen.availHeight},left=${screen.availWidth / 2},top=0`);
  document.getElementById("speakBtn").onclick = () => {
    const u = new SpeechSynthesisUtterance(textBox.innerText);
    speechSynthesis.speak(u);
  };

   // ---------- Voice Modulation ----------
const voiceBtn = document.getElementById("voiceBtn");
const voiceControls = document.getElementById("voiceControls");
const voiceSelect = document.getElementById("voiceSelect");
const pitchSlider = document.getElementById("pitchSlider");
const rateSlider = document.getElementById("rateSlider");
const previewBtn = document.getElementById("previewVoice");

let availableVoices = [];

// Populate voices dynamically when browser loads them
function loadVoices() {
  availableVoices = speechSynthesis.getVoices();
  voiceSelect.innerHTML = "";
  availableVoices.forEach((v, i) => {
    const opt = document.createElement("option");
    opt.value = i;
    opt.textContent = `${v.name} (${v.lang})`;
    voiceSelect.appendChild(opt);
  });
}
loadVoices();
if (speechSynthesis.onvoiceschanged !== undefined)
  speechSynthesis.onvoiceschanged = loadVoices;

// Toggle visibility of control panel
voiceBtn.onclick = () => {
  voiceControls.classList.toggle("hidden");
};

// Speak function with modulation
function speakWithModulation(text) {
  const u = new SpeechSynthesisUtterance(text);
  u.pitch = parseFloat(pitchSlider.value);
  u.rate = parseFloat(rateSlider.value);
  u.voice = availableVoices[voiceSelect.value] || null;
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
}
// --- Persistence helpers ---
function saveVoiceSettings() {
  localStorage.setItem("voiceSettings", JSON.stringify({
    voiceIndex: voiceSelect.value,
    pitch: pitchSlider.value,
    rate: rateSlider.value
  }));
}
function loadVoiceSettings() {
  const saved = JSON.parse(localStorage.getItem("voiceSettings") || "{}");
  if (saved.voiceIndex) voiceSelect.value = saved.voiceIndex;
  if (saved.pitch) pitchSlider.value = saved.pitch;
  if (saved.rate) rateSlider.value = saved.rate;
}

// Restore saved values once voices are loaded
speechSynthesis.onvoiceschanged = () => {
  loadVoices();
  loadVoiceSettings();
};

// --- Speak with saved modulation ---
function speakWithModulation(text) {
  const u = new SpeechSynthesisUtterance(text);
  u.pitch = parseFloat(pitchSlider.value);
  u.rate = parseFloat(rateSlider.value);
  u.voice = availableVoices[voiceSelect.value] || null;
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
  saveVoiceSettings(); // persist after each use
}

// --- Live save when sliders or voice change ---
[pitchSlider, rateSlider, voiceSelect].forEach(el => {
  el.addEventListener("input", saveVoiceSettings);
});

// --- Preview ---
previewBtn.onclick = () => {
  speakWithModulation("Testing your saved voice settings.");
};

// --- Speak button integration ---
document.getElementById("speakBtn").onclick = () => {
  speakWithModulation(textBox.innerText || "No text detected.");
};

// Preview button
previewBtn.onclick = () => {
  speakWithModulation("Testing voice modulation parameters.");
};

// Update existing Speak button to use modulation
document.getElementById("speakBtn").onclick = () => {
  speakWithModulation(textBox.innerText || "No text detected.");
};

  // ---------- Voice Modulation Placeholder ----------
  document.getElementById("voiceBtn").onclick = () =>
    alert("Voice modulation feature coming soon!");

  // ---------- QuickType Toggle ----------
  document.getElementById("kbToggle").onclick = () => {
    quickType = !quickType;
    document.getElementById("kbMode").textContent = quickType ? "⚡ QuickType" : "🕊 Precision";
  };

  // ---------- Save Dropdown ----------
  if (saveMenu) saveMenu.classList.add("hidden");
  if (saveBtn && saveMenu) {
    saveBtn.addEventListener("click", e => {
      e.stopPropagation();
      saveMenu.classList.toggle("hidden");
    });

    saveMenu.querySelectorAll("button").forEach(b => {
      b.addEventListener("click", e => {
        e.stopPropagation();
        saveMenu.classList.add("hidden");
        saveFile(b.dataset.format);
      });
    });

    document.addEventListener("click", e => {
      if (!saveBtn.contains(e.target) && !saveMenu.contains(e.target))
        saveMenu.classList.add("hidden");
    });
  }

  function saveFile(fmt) {
    const name = prompt("Enter file name:", "EyeWrite-note");
    if (!name) return;
    const text = textBox.innerText;
    if (fmt === "txt") {
      const blob = new Blob([text], { type: "text/plain" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${name}.txt`;
      a.click();
    } else if (fmt === "pdf") {
      alert("PDF export support pending integration.");
    } else if (fmt === "docx") {
      alert("DOCX export support pending integration.");
    }
  }
// ---------- Instructions Modal ----------
const instructionsBtn = document.getElementById("instructionsBtn");
const instructionsModal = document.getElementById("instructionsModal");
const instructionsContent = document.getElementById("instructionsContent");
const closeInstructions = document.getElementById("closeInstructions");
let hoverCloseTimer = null;

// Open modal
instructionsBtn.onclick = () => {
  instructionsModal.classList.remove("hidden");
};

// Close on ESC
document.addEventListener("keydown", e => {
  if (e.key === "Escape") instructionsModal.classList.add("hidden");
});

// Close on hover-off for 0.7s
instructionsContent.addEventListener("mouseleave", () => {
  hoverCloseTimer = setTimeout(() => {
    instructionsModal.classList.add("hidden");
  }, 700);
});
instructionsContent.addEventListener("mouseenter", () => {
  clearTimeout(hoverCloseTimer);
});

// Manual close
closeInstructions.onclick = () => {
  instructionsModal.classList.add("hidden");
};


});
