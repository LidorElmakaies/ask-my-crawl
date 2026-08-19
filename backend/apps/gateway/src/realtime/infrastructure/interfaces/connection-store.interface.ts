import type { Socket } from 'socket.io';

/**
 * Implemented by the Infrastructure layer (InMemoryConnectionStore for now — see the TODO
 * below). Consumed by the Application layer (RealtimeConnectionService).
 *
 * TODO: this is in-memory, so it only works for a single Gateway instance. Once the Gateway
 * is deployed with more than one replica, this needs a Redis-backed implementation instead
 * (Socket.IO has an official Redis adapter for exactly this) — swapping it is exactly one new
 * class here plus one DI binding in realtime.module.ts, per docs/specs/backend-architecture.md.
 */
export interface IConnectionStore {
  set(userId: string, socket: Socket): void;
  get(userId: string): Socket | undefined;
  deleteBySocket(socket: Socket): void;
}
