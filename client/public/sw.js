// A minimal service worker whose only job is showing a "your turn" push
// notification and focusing/opening the app when it's tapped - it doesn't
// do any caching or offline-support work, since this app needs a live
// socket connection to be useful anyway.

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    // Non-JSON payload - fall back to the defaults below.
  }
  const title = data.title || '200';
  const options = {
    body: data.body || "It's your turn!",
    icon: '/favicon.svg',
    badge: '/favicon.svg',
    // Same tag + renotify means a second "your turn" push replaces the
    // first on screen instead of piling up multiple notifications.
    tag: '200game-your-turn',
    renotify: true,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow('/');
    })
  );
});
