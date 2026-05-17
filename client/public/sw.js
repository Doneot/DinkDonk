self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (_error) {
    payload = { title: 'DinkDonk', body: event.data?.text() || 'A streamer is live!' };
  }

  const title = payload.title || 'DinkDonk';
  const options = {
    body: payload.body || 'A streamer is live!',
    icon: payload.icon || '/DinkDonk.png',
    badge: payload.badge || '/DinkDonk.png',
    data: payload.data || { url: payload.url || '/' },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';

  event.waitUntil((async () => {
    const clientsList = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existingClient = clientsList.find((client) => client.url === url || client.url === self.location.origin + url);
    if (existingClient) return existingClient.focus();
    return clients.openWindow(url);
  })());
});
