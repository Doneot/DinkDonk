import api from "../../shared/api/client";
import type {
  CanReceiveDmResponse,
  NotificationChannelId,
  NotificationChannelsResponse,
  PublicKeyResponse,
} from "../../shared/types/api";

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const bytes = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    bytes[i] = rawData.charCodeAt(i);
  }
  return bytes;
}

export function isWebPushSupported(): boolean {
  return (
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export async function getExistingPushSubscription(): Promise<PushSubscription | null> {
  if (!isWebPushSupported()) return null;
  const registration = await navigator.serviceWorker.register("/sw.js");
  return registration.pushManager.getSubscription();
}

export async function enableWebPushNotifications(): Promise<PushSubscription> {
  if (!isWebPushSupported())
    throw new Error("Web Push is not supported in this browser.");

  const permission = await Notification.requestPermission();
  if (permission !== "granted")
    throw new Error("Notification permission was not granted.");

  const [{ data }, registration] = await Promise.all([
    api.get<PublicKeyResponse>("/notifications/web-push/public-key"),
    navigator.serviceWorker.register("/sw.js"),
  ]);

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(data.publicKey),
  });

  await api.post("/notifications/web-push/subscriptions", { subscription });
  return subscription;
}

export async function disableWebPushNotifications(): Promise<boolean> {
  const subscription = await getExistingPushSubscription();
  if (!subscription) return false;
  await api.delete("/notifications/web-push/subscriptions", {
    params: { endpoint: subscription.endpoint },
  });
  await subscription.unsubscribe();
  return true;
}

export function fetchNotificationChannels(): Promise<NotificationChannelsResponse> {
  return api
    .get<NotificationChannelsResponse>("/notifications/channels")
    .then((res) => res.data);
}

export function setNotificationChannelPreference(
  channel: NotificationChannelId,
  enabled: boolean,
): Promise<void> {
  return api
    .post("/notifications/channels", { channel, enabled })
    .then(() => undefined);
}

export async function checkCanReceiveDM(): Promise<boolean> {
  try {
    // POST, not GET: this route has a real side effect (a live probe DM to
    // the user, plus persisting the result) - the backend only ever
    // registered it as POST /api/can-receive-dm.
    const res = await api.post<CanReceiveDmResponse>("/can-receive-dm");
    return res.data.canReceiveDM;
  } catch (err) {
    console.error("Failed to check DM permission", err);
    throw err;
  }
}
