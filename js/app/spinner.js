// Spinner utility for showing/hiding a loading overlay
// Creates a simple full-screen overlay with a CSS animated spinner.
// The overlay is inserted into the document body if not present.

/**
 * Ensure the spinner DOM element exists and return it.
 * @returns {HTMLElement}
 */
function getSpinnerElement() {
  let el = document.getElementById('loading-spinner');
  if (el) return el;
  // Create overlay
  el = document.createElement('div');
  el.id = 'loading-spinner';
  el.style.position = 'fixed';
  el.style.top = '0';
  el.style.left = '0';
  el.style.width = '100%';
  el.style.height = '100%';
  el.style.display = 'flex';
  el.style.alignItems = 'center';
  el.style.justifyContent = 'center';
  el.style.backgroundColor = 'rgba(0,0,0,0.4)';
  el.style.zIndex = '10000';
  el.style.pointerEvents = 'none';

  // Spinner inner element
  const spinner = document.createElement('div');
  spinner.style.border = '8px solid #f3f3f3';
  spinner.style.borderTop = '8px solid #3498db';
  spinner.style.borderRadius = '50%';
  spinner.style.width = '60px';
  spinner.style.height = '60px';
  spinner.style.animation = 'spin 1s linear infinite';
  // Keyframes
  const style = document.createElement('style');
  style.textContent = `@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`;
  document.head.appendChild(style);

  el.appendChild(spinner);
  document.body.appendChild(el);
  return el;
}

/**
 * Show or hide the loading spinner.
 * @param {boolean} show - true to show, false to hide.
 */
export function toggleLoadingSpinner(show) {
  const el = getSpinnerElement();
  el.style.display = show ? 'flex' : 'none';
}
