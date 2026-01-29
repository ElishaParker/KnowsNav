## 🧠 BlazeFace Virtual Joystick

**Copyright © 2025 Elisha B Parker. All Rights Reserved.**
Unauthorized copying, modification, or distribution of this code is prohibited.

### 🎯 Overview

The **BlazeFace Virtual Joystick** is an experimental browser-based interface that uses real-time facial tracking to control an on-screen cursor through smooth, amplified head and nose motion.
It leverages TensorFlow.js and Google’s BlazeFace model to create a responsive “virtual joystick” driven by subtle head movements.

The app runs entirely in the browser — no data is uploaded or stored anywhere.

---

### ⚙️ Features

✅ Real-time facial landmark tracking using TensorFlow.js
✅ Smooth nose stabilization and low-pass filtering to reduce jitter
✅ Adjustable amplification and sensitivity multipliers for extended range control
✅ Viewport-locked cursor overlay with motion clamping
✅ Fully mirrored camera feed for intuitive head motion alignment
✅ Works on both desktop and mobile browsers supporting WebGL

---

### 🧩 Tech Stack

* **TensorFlow.js** – for BlazeFace face detection
* **WebGL Backend** – real-time acceleration
* **HTML5 Canvas** – rendering of overlays and landmarks
* **JavaScript (Vanilla)** – lightweight, no external frameworks

---

### 🚀 How It Works

1. The webcam feed is mirrored and analyzed frame-by-frame by BlazeFace.
2. The model identifies key facial landmarks (eyes, nose, mouth, ears).
3. The *nose landmark* is smoothed independently to eliminate frame jitter.
4. Its position is mapped to a virtual 2D joystick overlay, amplified, and clamped to the viewport edges.
5. A visual cursor follows the user’s nose in real time, simulating a stable pointer.

---

### 🧱 File Structure

```
project/
│
├── index.html         # Main application file with BlazeFace + overlay logic
├── LICENSE            # Proprietary license (read-only, all rights reserved)
└── README.md          # This file
```

---

### 🔒 License

This project is **proprietary software**.
You are granted a limited, non-exclusive license to **use the app** but **not the source code**.
Copying, modification, redistribution, or reverse engineering of this code is **strictly prohibited** without written consent from the author.

For licensing or business inquiries, contact:
📧 **[Your Email Here]**

---

### ⚠️ Disclaimer

This software is provided “AS IS”, without warranty of any kind.
Use at your own risk. The author assumes no responsibility for any damage, loss, or misuse arising from its use.

---

Would you like me to make this README more **public-facing** (like for a product demo page or GitHub project site) or keep it **developer/internal use only**?
If it’s public-facing, I can reword the intro and add a “Live Demo” or “Preview” section.
