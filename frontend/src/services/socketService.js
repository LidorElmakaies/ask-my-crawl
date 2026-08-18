import { io } from 'socket.io-client';
import { URLS } from '../config/urls';

// Owns the actual Socket.IO client and nothing else — no Redux knowledge, no dispatching.
// wsSlice's thunks call this and decide what to dispatch for each callback; components never
// import this module directly.
let socket = null;

/**
 * Opens the connection and wires the given callbacks to Socket.IO's events. Returns nothing —
 * callers observe the connection through the callbacks, not by holding the socket themselves.
 */
export function connect(token, { onConnect, onDisconnect, onConnectError, onMessage } = {}) {
  if (socket) {
    socket.disconnect();
  }

  socket = io(URLS.gateway.wsOrigin, {
    path: URLS.gateway.wsPath,
    transports: ['websocket'],
    auth: { token },
  });

  if (onConnect) socket.on('connect', onConnect);
  if (onDisconnect) socket.on('disconnect', onDisconnect);
  if (onConnectError) socket.on('connect_error', onConnectError);
  if (onMessage) socket.on('message', onMessage);
}

export function disconnect() {
  socket?.disconnect();
  socket = null;
}

export function isConnected() {
  return socket?.connected ?? false;
}
