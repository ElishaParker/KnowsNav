/*
 * nose.js — SnazyCam's nose tracking logic extracted from the
 * original index.html. This script initializes the BlazeFace model,
 * sets up the webcam feed, and continuously updates the global
 * `smoothedCursor` coordinates based on the user’s nose position.
 *
 * This file must remain unmodified to preserve the behavior of the
 * upstream project. Adjustments to smoothing or sensitivity should be
 * made via the controls.js panel in the SnazyCam module.
 */

let model, video, canvas, ctx;
let smoothedLandmarks = null;
let smoothedNose = null;

// --- Configurable parameters ---
window.SMOOTHING_ALPHA = 0.1;
window.NOSE_SMOOTH_ALPHA = 0.08;
window.CURSOR_ALPHA = 0.2;
window.SENSITIVITY_X = 1.0;
window.SENSITIVITY_Y = 1.0;
window.VIRTUAL_SCALE = 15;
window.CLAMP_THRESHOLD = 1.0;
window.CLAMP_EASE = 0.05;
window.VERTICAL_FINE_TUNE = 15;
window.HORIZONTAL_FINE_TUNE = 10;

// --- Cursor tracking ---
window.smoothedCursor = { x: 0, y: 0 }; // ensure global visibility
let viewW = 0, viewH = 0, dpr = 1;

async function setupCamera() {
  video = document.getElementById("video");
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
    audio: false
  });
  video.srcObject = stream;
  return new Promise(r => video.onloadedmetadata = () => r(video));
}

async function main() {
  await tf.setBackend("webgl");
  model = await blazeface.load();
  await setupCamera();
  video.play();
  canvas = document.getElementById("overlay");
  ctx = canvas.getContext("2d");
  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);
  window.addEventListener("orientationchange", () => setTimeout(resizeCanvas, 300));
  detectFaces();
}

function resizeCanvas() {
  viewW = window.innerWidth;
  viewH = window.innerHeight;
  dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(viewW * dpr);
  canvas.height = Math.round(viewH * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, viewW, viewH);
}

const lerp = (a, b, t) => a + (b - a) * t;

function smoothPoints(prev, next, alpha = SMOOTHING_ALPHA) {
  if (!prev) return next;
  return prev.map((p, i) => [
    lerp(p[0], next[i][0], alpha),
    lerp(p[1], next[i][1], alpha)
  ]);
}

function clampSmallMovement(prev, next, threshold = CLAMP_THRESHOLD, easeFactor = CLAMP_EASE) {
  if (!prev) return next;
  return next.map((p, i) => {
    const dx = p[0] - prev[i][0];
    const dy = p[1] - prev[i][1];
    const dist = Math.hypot(dx, dy);
    if (dist < threshold) return prev[i];
    const t = Math.min(1, easeFactor * dist / threshold);
    return [ prev[i][0] + dx * t, prev[i][1] + dy * t ];
  });
}

async function detectFaces() {
  const predictions = await model.estimateFaces(video, false);
  ctx.clearRect(0, 0, viewW, viewH);

  if (predictions.length > 0) {
    const pred = predictions[0];

    // --- Landmark smoothing ---
    let tempSmooth = smoothPoints(smoothedLandmarks, pred.landmarks);
    smoothedLandmarks = clampSmallMovement(smoothedLandmarks, tempSmooth, CLAMP_THRESHOLD, CLAMP_EASE);
    const [rEye, lEye, noseRaw, mR, mL, rEar] = smoothedLandmarks;

    // --- Nose smoothing ---
    if (!smoothedNose) smoothedNose = [...noseRaw];
    smoothedNose[0] = lerp(smoothedNose[0], noseRaw[0], NOSE_SMOOTH_ALPHA);
    smoothedNose[1] = lerp(smoothedNose[1], noseRaw[1], NOSE_SMOOTH_ALPHA);

    // --- Video scaling ---
    const videoW = video.videoWidth || viewW;
    const videoH = video.videoHeight || viewH;
    const videoAspect = videoW / videoH;
    const viewAspect = viewW / viewH;
    let drawWidth, drawHeight, offsetX, offsetY;
    if (videoAspect > viewAspect) {
      drawHeight = viewH;
      drawWidth  = viewH * videoAspect;
      offsetX = (drawWidth - viewW) / 2;
      offsetY = 0;
    } else {
      drawWidth  = viewW;
      drawHeight = viewW / videoAspect;
      offsetX = 0;
      offsetY = (drawHeight - viewH) / 2;
    }
    offsetY += VERTICAL_FINE_TUNE;
    offsetX += HORIZONTAL_FINE_TUNE;
    const scaleX = drawWidth / videoW;
    const scaleY = drawHeight / videoH;

    // --- Nose to cursor ---
    const scaledNoseX = smoothedNose[0] * scaleX - offsetX;
    const scaledNoseY = smoothedNose[1] * scaleY - offsetY;
    const mirroredNoseX = viewW - scaledNoseX;
    const mirroredNoseY = scaledNoseY;

    const normX = mirroredNoseX / viewW;
    const normY = mirroredNoseY / viewH;

    const screenCenterX = viewW / 2;
    const screenCenterY = viewH / 2;
    const offsetXcursor = (normX - 0.5) * viewW * VIRTUAL_SCALE;
    const offsetYcursor = (normY - 0.5) * viewH * VIRTUAL_SCALE;

    const cursorX = screenCenterX + offsetXcursor * SENSITIVITY_X;
    const cursorY = screenCenterY + offsetYcursor * SENSITIVITY_Y;

    const PAD = 8;
    const clampedX = Math.max(PAD, Math.min(viewW - PAD, cursorX));
    const clampedY = Math.max(PAD, Math.min(viewH - PAD, cursorY));

    window.smoothedCursor.x = lerp(window.smoothedCursor.x, clampedX, CURSOR_ALPHA);
    window.smoothedCursor.y = lerp(window.smoothedCursor.y, clampedY, CURSOR_ALPHA);

    // Drawing operations omitted in this extracted module — they will be
    // handled in the integrated interface when needed.
  }

  requestAnimationFrame(detectFaces);
}

// Kick off main routine
main();