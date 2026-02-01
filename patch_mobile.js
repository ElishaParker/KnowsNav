// Mobile viewport height controller for KnowsNav
(function() {
  // Determine the available viewport height and assign to CSS variable.
  function setAppHeight() {
    var vh;
    if (window.visualViewport) {
      // Use visualViewport API when available for accurate viewport height on mobile.
      vh = window.visualViewport.height;
    } else {
      // Fallback to innerHeight.
      vh = window.innerHeight;
    }
    document.documentElement.style.setProperty('--knowsnav-app-height', vh + 'px');
  }

  // Initial calculation.
  setAppHeight();

  // Update on resize or orientation change.
  window.addEventListener('resize', setAppHeight);
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', setAppHeight);
  }

  // Optionally mark body as mobile based on coarse pointer and width threshold.
  try {
    var isMobile = window.matchMedia('(pointer: coarse) and (max-width: 768px)').matches;
    if (isMobile) {
      document.body.classList.add('mobile');
    }
  } catch (e) {
    // matchMedia may throw in some environments; ignore gracefully.
  }
})();
