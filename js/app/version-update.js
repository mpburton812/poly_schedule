import { LOADED_BUILD_KEY } from '../storage-keys.js';

let updateAvailable = false;

export async function fetchVersionInfo() {
  const res = await fetch(`version.json?_=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) return null;
  return res.json();
}

export async function markLoadedBuild() {
  try {
    const data = await fetchVersionInfo();
    if (data?.commit) {
      localStorage.setItem(LOADED_BUILD_KEY, data.commit);
    }
  } catch {
    /* ignore */
  }
}

export function showUpdateBanner(version = null) {
  updateAvailable = true;
  document.body.classList.add('has-update-banner');
  const banner = document.getElementById('update-banner');
  if (!banner) return;
  const label = version?.commit ? `BUILD #${version.commit}` : 'a new version';
  banner.textContent = `UPDATE AVAILABLE (${label}) — CLICK TO RELOAD`;
  banner.style.display = 'flex';
}

export function hideUpdateBanner() {
  updateAvailable = false;
  document.body.classList.remove('has-update-banner');
  const banner = document.getElementById('update-banner');
  if (banner) banner.style.display = 'none';
}

export async function checkForAppUpdate() {
  try {
    const remote = await fetchVersionInfo();
    if (!remote?.commit) return false;
    const loaded = localStorage.getItem(LOADED_BUILD_KEY);
    if (loaded && loaded !== remote.commit) {
      showUpdateBanner(remote);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/** Clear caches, refresh the service worker, and hard reload. */
export async function forceReloadApp() {
  if ('caches' in window) {
    const names = await caches.keys();
    await Promise.all(names.map((name) => caches.delete(name)));
  }
  if (navigator.serviceWorker?.getRegistrations) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));
  }
  try {
    localStorage.removeItem(LOADED_BUILD_KEY);
  } catch {
    /* ignore */
  }
  window.location.reload();
}

export function bindUpdateBanner() {
  const banner = document.getElementById('update-banner');
  if (!banner || banner.dataset.bound) return;
  banner.dataset.bound = '1';
  banner.addEventListener('click', () => {
    void forceReloadApp();
  });
  banner.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      banner.click();
    }
  });
}

export function watchServiceWorkerUpdates(registration) {
  if (!registration) return;

  if (registration.waiting && navigator.serviceWorker.controller) {
    showUpdateBanner();
  }

  registration.addEventListener('updatefound', () => {
    const worker = registration.installing;
    if (!worker) return;
    worker.addEventListener('statechange', () => {
      if (worker.state === 'installed' && navigator.serviceWorker.controller) {
        showUpdateBanner();
      }
    });
  });
}

export function isUpdateAvailable() {
  return updateAvailable;
}
