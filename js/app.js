/**
 * PolySchedule Application Entrypoint
 * Thin bootstrap: loads app modules and registers the PWA service worker.
 */

import { init } from './app/bootstrap.js';

init();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then(reg => {
        console.log('PolySchedule Service Worker registered with scope: ', reg.scope);
      })
      .catch(err => {
        console.error('PolySchedule Service Worker registration failed: ', err);
      });
  });
}
