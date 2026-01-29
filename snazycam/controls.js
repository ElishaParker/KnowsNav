/**
 * Dummy camera controls for SnazyCam
 *
 * The original SnazyCam implementation exposes UI sliders to adjust camera
 * properties such as exposure and brightness. In this simplified version we
 * provide a minimal API that satisfies the import expectations of the
 * nose tracking module without introducing external dependencies or UI
 * complexity. You can extend this file in the future to expose real
 * controls or hook into platform specific camera settings.
 */

/**
 * Create a slider control.
 *
 * @param {string} label A label for the slider (ignored in this dummy
 * implementation).
 * @param {number} min The minimum value.
 * @param {number} max The maximum value.
 * @param {number} initialValue The initial value.
 * @param {number} step The step interval between values.
 * @returns {Object} An object with an `element` property (a DOM element
 * representing the slider) and a `value()` method that returns the current
 * slider value.
 */
export function createSlider(label, min, max, initialValue, step = 1) {
  const container = document.createElement('div');
  container.style.display = 'flex';
  container.style.flexDirection = 'column';
  const input = document.createElement('input');
  input.type = 'range';
  input.min = min;
  input.max = max;
  input.step = step;
  input.value = initialValue ?? min;
  container.appendChild(input);
  return {
    element: container,
    value: () => parseFloat(input.value)
  };
}