const PUSH_ENABLED_KEY = '200game:pushEnabled';

// Web Push wants the VAPID public key as a raw Uint8Array, but the server
// hands it over as the usual base64url string - this is the standard
// conversion between the two.
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

export function isPushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window;
}

export async function getExistingSubscription() {
  if (!isPushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration().catch(() => null);
  if (!reg) return null;
  return reg.pushManager.getSubscription();
}

export async function enablePush(vapidPublicKey) {
  if (!isPushSupported()) throw new Error('Push notifications are not supported in this browser');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Notification permission was not granted');

  const reg = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;
  const subscription = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
  });

  try {
    localStorage.setItem(PUSH_ENABLED_KEY, '1');
  } catch {
    // ignore
  }
  return subscription;
}

export async function disablePush() {
  const sub = await getExistingSubscription();
  if (sub) await sub.unsubscribe();
  try {
    localStorage.setItem(PUSH_ENABLED_KEY, '0');
  } catch {
    // ignore
  }
}

export function wasPushEnabled() {
  try {
    return localStorage.getItem(PUSH_ENABLED_KEY) === '1';
  } catch {
    return false;
  }
}
