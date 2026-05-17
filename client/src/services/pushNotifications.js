import api from './api';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

export function isWebPushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export async function getExistingPushSubscription() {
  if (!isWebPushSupported()) return null;
  const registration = await navigator.serviceWorker.register('/sw.js');
  return registration.pushManager.getSubscription();
}

export async function enableWebPushNotifications() {
  if (!isWebPushSupported()) throw new Error('Web Push is not supported in this browser.');

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Notification permission was not granted.');

  const [{ data }, registration] = await Promise.all([
    api.get('/notifications/web-push/public-key'),
    navigator.serviceWorker.register('/sw.js'),
  ]);

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(data.publicKey),
  });

  await api.post('/notifications/web-push/subscriptions', { subscription });
  return subscription;
}

export async function disableWebPushNotifications() {
  const subscription = await getExistingPushSubscription();
  if (!subscription) return false;
  await api.delete('/notifications/web-push/subscriptions', { data: { subscription } });
  await subscription.unsubscribe();
  return true;
}
