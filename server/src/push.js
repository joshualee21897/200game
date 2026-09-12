import webpush from 'web-push';

// Push is entirely optional infrastructure - if the VAPID keys aren't
// configured (e.g. a fresh deploy that hasn't set the env vars yet), every
// function here just quietly no-ops instead of crashing the server.
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@example.com';

const enabled = !!(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);

if (enabled) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
} else {
  console.warn('Push notifications disabled - set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY to enable them.');
}

export function isPushEnabled() {
  return enabled;
}

export function getPublicKey() {
  return VAPID_PUBLIC_KEY || null;
}

/**
 * Sends one push notification. Throws on failure so the caller can decide
 * what to do with a dead subscription (a 404/410 means the browser itself
 * unsubscribed, uninstalled, or cleared data - that's expected background
 * noise, not a real error worth logging every time it happens).
 */
export async function sendPush(subscription, payload) {
  if (!enabled || !subscription) return;
  await webpush.sendNotification(subscription, JSON.stringify(payload));
}
