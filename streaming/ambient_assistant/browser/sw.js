// Minimal service worker — enables PWA install + push notifications
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

// Show notification from push event (for future FCM integration)
self.addEventListener('push', (e) => {
  const data = e.data ? e.data.json() : {};
  e.waitUntil(
    self.registration.showNotification(data.title || 'Ambient Assistant', {
      body: data.body || 'Tool completed',
      icon: '../shared/ailang-logo.svg',
      tag: data.tag || 'ambient-tool',
      silent: false
    })
  );
});

// Click notification → focus the app
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clients) => {
      if (clients.length > 0) return clients[0].focus();
      return self.clients.openWindow('.');
    })
  );
});
