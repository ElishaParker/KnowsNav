(() => {
  // ============================================================
  //  BlazeFace Tracker – Control Panel (Benchmark Edition)
  //  Keeps same behavior, ensures full hover-click compatibility
  // ============================================================

  // ---- Parameter descriptors ----
  const descriptors = [
    { key: 'SMOOTHING_ALPHA',      label: 'Smoothing Alpha',      min: 0.01, max: 0.5,  step: 0.01, def: 0.1  },
    { key: 'NOSE_SMOOTH_ALPHA',    label: 'Nose Smooth Alpha',    min: 0.01, max: 0.5,  step: 0.01, def: 0.08 },
    { key: 'CURSOR_ALPHA',         label: 'Cursor Alpha',         min: 0.01, max: 0.5,  step: 0.01, def: 0.2  },
    { key: 'SENSITIVITY_X',        label: 'Sensitivity X',        min: 0.1,  max: 5,    step: 0.1,  def: 1.0  },
    { key: 'SENSITIVITY_Y',        label: 'Sensitivity Y',        min: 0.1,  max: 5,    step: 0.1,  def: 1.0  },
    { key: 'VIRTUAL_SCALE',        label: 'Virtual Scale',        min: 1,    max: 30,   step: 1,    def: 15   },
    { key: 'CLAMP_THRESHOLD',      label: 'Clamp Threshold',      min: 0.1,  max: 10,   step: 0.1,  def: 1.0  },
    { key: 'CLAMP_EASE',           label: 'Clamp Ease',           min: 0.01, max: 1,    step: 0.01, def: 0.05 },
    { key: 'VERTICAL_FINE_TUNE',   label: 'Vertical Fine Tune',   min: -100, max: 100,  step: 1,    def: 15   },
    { key: 'HORIZONTAL_FINE_TUNE', label: 'Horizontal Fine Tune', min: -100, max: 100,  step: 1,    def: 25   },
    { key: 'HOVER_TIME',           label: 'Hover Time (ms)',      min: 500,  max: 3000, step: 100,  def: 1500 },
    { key: 'CURSOR_RADIUS',        label: 'Cursor Radius',        min: 5,    max: 100,  step: 1,    def: 15   }
  ];

  // ---- Ensure defaults exist ----
  descriptors.forEach(d => {
    if (typeof window[d.key] === 'undefined') window[d.key] = d.def;
  });

  // ============================================================
  //  Control Panel UI
  // ============================================================

  const panel = document.createElement("div");
  Object.assign(panel.style, {
    position: "fixed",
    bottom: "50px",
    right: "10px",
    background: "rgba(0,0,0,0.8)",
    border: "1px solid #00ffff",
    borderRadius: "12px",
    padding: "10px",
    color: "#00ffff",
    fontFamily: "monospace",
    fontSize: "11px",
    zIndex: "4",              // below hover cursor (z=5) & wheel (z=6)
    transition: "opacity 0.3s ease, transform 0.3s ease",
    maxWidth: "260px",
    maxHeight: "90vh",      // limits height to 80% of screen
    overflowY: "auto",
    backdropFilter: "blur(6px)",
    overflow: "hidden",
    opacity: "1",
    transform: "scale(1)",
    pointerEvents: "auto"
  });

  // ---- Toggle Button ----
  const toggleButton = document.createElement("button");
  toggleButton.textContent = "Close Controls";
  Object.assign(toggleButton.style, {
    position: "fixed",
    bottom: "10px",
    right: "10px",
    background: "#00ffff",
    color: "#000",
    fontWeight: "bold",
    border: "none",
    borderRadius: "20px",
    padding: "8px 14px",
    cursor: "pointer",
    boxShadow: "0 0 10px #00ffff88",
    zIndex: "4",
    transition: "0.3s ease"
  });

  let visible = true;
  toggleButton.onclick = () => {
    visible = !visible;
    panel.style.opacity = visible ? "1" : "0";
    panel.style.pointerEvents = visible ? "auto" : "none";
    panel.style.transform = visible ? "scale(1)" : "scale(0.9)";
    toggleButton.textContent = visible ? "Close Controls" : "Open Controls";
  };

  document.body.appendChild(panel);
  document.body.appendChild(toggleButton);

  // ---- Title ----
  const title = document.createElement("div");
  title.textContent = "Tracking Settings";
  Object.assign(title.style, {
    textAlign: "center",
    marginBottom: "8px",
    color: "#00ffff",
    fontWeight: "bold"
  });
  panel.appendChild(title);

  // ============================================================
  //  Dynamic Slider Generation
  // ============================================================

  const inputs = new Map();

  descriptors.forEach(d => {
    const wrap = document.createElement("div");
    wrap.style.marginBottom = "8px";

    const label = document.createElement("label");
    label.textContent = `${d.label}: `;
    label.style.display = "block";

    const valueEl = document.createElement("span");
    valueEl.textContent = Number(window[d.key]).toFixed(d.step < 1 ? 2 : 0);
    label.appendChild(valueEl);

    const input = document.createElement("input");
    input.type = "range";
    input.min = d.min;
    input.max = d.max;
    input.step = d.step;
    input.value = window[d.key];
    input.dataset.key = d.key;
    input.style.width = "100%";
    input.oninput = () => {
      const v = parseFloat(input.value);
      window[d.key] = v;
      valueEl.textContent = Number(v).toFixed(d.step < 1 ? 2 : 0);
    };

    inputs.set(d.key, { input, valueEl, desc: d });
    wrap.appendChild(label);
    wrap.appendChild(input);
    panel.appendChild(wrap);
  });

  // ============================================================
  //  Reset Button
  // ============================================================

  const resetButton = document.createElement("button");
  resetButton.textContent = "🔄 Reset to Default";
  Object.assign(resetButton.style, {
    marginTop: "10px",
    width: "100%",
    padding: "6px",
    border: "none",
    borderRadius: "6px",
    cursor: "pointer",
    background: "#00ffff",
    color: "#000",
    fontWeight: "bold"
  });
  resetButton.onmouseenter = () => (resetButton.style.opacity = "0.85");
  resetButton.onmouseleave = () => (resetButton.style.opacity = "1.0");

  resetButton.onclick = () => {
    descriptors.forEach(d => {
      window[d.key] = d.def;
      const rec = inputs.get(d.key);
      if (rec) {
        rec.input.value = d.def;
        rec.valueEl.textContent = Number(d.def).toFixed(d.step < 1 ? 2 : 0);
      }
    });
  };

  panel.appendChild(resetButton);

  // ============================================================
  console.log("✅ Controls initialized");
})();
