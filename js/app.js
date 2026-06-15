/**
 * PolySchedule Application Entrypoint
 * Uses dynamic imports so a broken dependency still allows boot recovery UI.
 */

const BOOT_ATTR = 'data-polyschedule-booted';

function markBooted() {
  document.documentElement.setAttribute(BOOT_ATTR, '1');
  if (typeof window.__polyscheduleMarkBooted === 'function') {
    window.__polyscheduleMarkBooted();
  }
}

function showBootFailure(err) {
  markBooted();
  console.error('[PolySchedule] Boot failed', err);

  const banner = document.getElementById('update-banner');
  if (banner) {
    banner.textContent = 'APP FAILED TO LOAD — CLICK TO RELOAD';
    banner.style.display = 'flex';
    document.body.classList.add('has-update-banner');
  }

  const container = document.getElementById('app-view-container');
  if (container) {
    const detail = err?.message ? `<p class="font-body-md" style="color: var(--on-surface-variant); margin-top: 8px;">${err.message}</p>` : '';
    container.innerHTML = `
      <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 50vh; padding: var(--space-lg); text-align: center;">
        <span class="material-symbols-outlined" style="font-size: 48px; color: var(--error);">error</span>
        <h2 class="font-headline-lg" style="margin-top: var(--space-sm);">PolySchedule failed to start</h2>
        <p class="font-body-md" style="color: var(--on-surface-variant); margin-top: 8px; max-width: 420px;">
          Your browser may be running an outdated cached copy. Click the blue banner above to clear cache and reload.
        </p>
        ${detail}
        <button class="btn btn-filled" id="boot-reload-btn" style="margin-top: var(--space-lg);">Reload now</button>
      </div>
    `;
    container.querySelector('#boot-reload-btn')?.addEventListener('click', () => {
      void import('./app/version-update.js').then(({ forceReloadApp }) => forceReloadApp());
    });
  }
}

async function boot() {
  try {
    const versionMod = await import('./app/version-update.js');
    versionMod.bindUpdateBanner();

    const { init } = await import('./app/bootstrap.js');
    markBooted();
    init();

    registerPolyScheduleServiceWorker();
  } catch (err) {
    showBootFailure(err);
  }
}

function registerPolyScheduleServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  const run = () => {
    import('./app/version-update.js').then((versionMod) => {
      navigator.serviceWorker.register('./sw.js')
        .then((reg) => {
          console.log('PolySchedule Service Worker registered with scope: ', reg.scope);
          versionMod.watchServiceWorkerUpdates(reg);
          setInterval(() => reg.update(), 60 * 60 * 1000);
        })
        .catch((err) => {
          console.error('PolySchedule Service Worker registration failed: ', err);
        });
    });
  };

  if (document.readyState === 'complete') {
    run();
  } else {
    window.addEventListener('load', run, { once: true });
  }
}

void boot();
