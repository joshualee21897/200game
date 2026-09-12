import { useEffect, useState } from 'react';
import { call } from '../socket';
import { isPushSupported, enablePush, disablePush, getExistingSubscription } from '../push';

// Rendered once at the App level whenever a room exists, so it's available
// in the waiting room and the active game alike.
export default function NotificationToggle({ playerId }) {
  const [supported] = useState(() => isPushSupported());
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!supported || !playerId) return;
    // If a subscription from an earlier visit already exists in this
    // browser, re-send it to the server rather than waiting for the user
    // to toggle it again - this also quietly repairs things if the server
    // restarted and lost its in-memory copy of who's subscribed.
    getExistingSubscription().then((sub) => {
      if (sub) {
        setEnabled(true);
        call('push:subscribe', { subscription: sub }).catch(() => {});
      }
    });
  }, [supported, playerId]);

  async function toggle() {
    if (busy) return;
    setBusy(true);
    try {
      if (enabled) {
        await disablePush();
        await call('push:unsubscribe', {}).catch(() => {});
        setEnabled(false);
      } else {
        const { key } = await call('push:getPublicKey', {});
        if (!key) throw new Error('Push notifications are not configured on this server yet');
        const subscription = await enablePush(key);
        await call('push:subscribe', { subscription });
        setEnabled(true);
      }
    } catch (err) {
      // Permission denied, unsupported browser, server not configured -
      // none of these are worth a hard error banner over a quiet toggle.
      console.warn('Push notification toggle failed:', err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!supported) return null;

  return (
    <button
      type="button"
      className="icon-button notification-fab"
      onClick={toggle}
      disabled={busy}
      title={enabled ? 'Turn off turn notifications' : "Get notified when it's your turn, even with the tab closed"}
    >
      {enabled ? '🔔' : '🔕'}
    </button>
  );
}
