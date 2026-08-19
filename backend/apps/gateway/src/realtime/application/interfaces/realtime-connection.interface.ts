import type { Socket } from 'socket.io';

/**
 * Implemented by the Application layer (RealtimeConnectionService). Consumed by the API layer
 * (RealtimeGateway, and later the `result-saved` Kafka consumer once it exists) to manage and
 * push through user connections, without knowing how connections are actually stored.
 */
export interface IRealtimeConnectionService {
  /** Registers an authenticated socket for a user. */
  handleConnect(userId: string, socket: Socket): void;

  /** Unregisters a socket on disconnect (looked up by the socket instance itself). */
  handleDisconnect(socket: Socket): void;

  /**
   * Pushes an event to a user's active connection, if they have one. Delivered as a single
   * `message` Socket.IO event carrying the full payload (keeps the wire payload shape
   * identical to docs/specs/event-schemas.md regardless of transport).
   * Returns true if delivered, false if the user has no open connection right now
   * (per api-contracts.md: that's not an error — the user still gets the result via
   * GET /jobs/:id and the other notification channels).
   */
  pushToUser(userId: string, event: Record<string, unknown>): boolean;
}
