import { io } from 'socket.io-client';

// In production the server serves the built client itself, so the socket
// connects to the same origin the page was loaded from by default. Dev
// overrides this via VITE_SERVER_URL (see client/.env.development) since
// the Vite dev server and the API server run on different ports.
const SERVER_URL = import.meta.env.VITE_SERVER_URL || undefined;

export const socket = io(SERVER_URL, { autoConnect: true });

export function call(event, payload = {}) {
  return new Promise((resolve, reject) => {
    socket.emit(event, payload, (res) => {
      if (res?.ok) resolve(res);
      else reject(new Error(res?.error || 'Request failed'));
    });
  });
}
