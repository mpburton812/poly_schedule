/**
 * PolySchedule PWA Service Worker
 * Handles offline resource caching and native device notification event mapping.
 */

const CACHE_NAME = 'polyschedule-v5';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './css/styles.css',
  './js/app.js',
  './js/app/state.js',
  './js/app/context.js',
  './js/app/modals.js',
  './js/app/router.js',
  './js/app/bootstrap.js',
  './js/app/bindings/schedule.js',
  './js/app/bindings/proposals.js',
  './js/app/bindings/create.js',
  './js/app/bindings/logistics.js',
  './js/app/bindings/admin.js',
  './js/views/index.js',
  './js/auth.js',
  './js/calendar.js',
  './js/gcal-sync.js',
  './js/helpers.js',
  './js/pronouns.js',
  './js/change-log.js',
  './js/proposal-workflow.js',
  './js/rules.js',
  './js/views.js',
  './version.json',
  './release-notes.json',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&family=Work+Sans:wght@400;500&family=JetBrains+Mono:wght@500&family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap'
];

// Install Event
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Pre-caching offline assets...');
        return cache.addAll(ASSETS_TO_CACHE);
      })
      .then(() => self.skipWaiting())
  );
});

// Activate Event
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.map(key => {
          if (key !== CACHE_NAME) {
            console.log('[SW] Clearing old cache:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event - Network First for local static files, Cache First for external fonts/assets
self.addEventListener('fetch', event => {
  // Only cache GET requests (ignore API post calls or OAuth tokens)
  if (event.request.method !== 'GET') return;

  const url = event.request.url;
  const isLocalStatic = url.includes(self.location.origin) && 
    (url.endsWith('.html') || url.includes('/js/') || url.includes('/css/') || url === self.location.origin + '/');

  if (isLocalStatic) {
    // Network First
    event.respondWith(
      fetch(event.request)
        .then(networkResponse => {
          if (networkResponse.status === 200) {
            const responseCopy = networkResponse.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseCopy));
          }
          return networkResponse;
        })
        .catch(() => caches.match(event.request))
    );
  } else {
    // Cache First with background validation (stale-while-revalidate)
    event.respondWith(
      caches.match(event.request)
        .then(cachedResponse => {
          if (cachedResponse) {
            fetch(event.request).then(networkResponse => {
              if (networkResponse.status === 200) {
                caches.open(CACHE_NAME).then(cache => cache.put(event.request, networkResponse));
              }
            }).catch(() => {});
            return cachedResponse;
          }

          return fetch(event.request).then(response => {
            if (response.status === 200 && (
              event.request.url.includes('fonts.googleapis.com') ||
              event.request.url.includes('fonts.gstatic.com')
            )) {
              const responseCopy = response.clone();
              caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseCopy));
            }
            return response;
          });
        })
    );
  }
});

// Push Notification Event Listener
self.addEventListener('push', event => {
  let data = { title: 'PolySchedule Update', body: 'You have a new proposal review.' };
  
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data = { title: 'PolySchedule Update', body: event.data.text() };
    }
  }

  const options = {
    body: data.body,
    icon: 'icons/icon-192.png',
    badge: 'icons/icon-192.png',
    vibrate: [100, 50, 100],
    data: {
      url: './index.html#proposals'
    }
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Notification Click Event
self.addEventListener('notificationclick', event => {
  event.notification.close();
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      // Focus existing tab if open
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus().then(() => client.navigate(event.notification.data.url));
        }
      }
      // Or open a new tab
      if (clients.openWindow) {
        return clients.openWindow(event.notification.data.url);
      }
    })
  );
});
