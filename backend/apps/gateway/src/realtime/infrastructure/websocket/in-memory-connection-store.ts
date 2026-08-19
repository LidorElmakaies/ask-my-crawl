import { Injectable } from '@nestjs/common';
import type { Socket } from 'socket.io';
import type { IConnectionStore } from '../interfaces/connection-store.interface';

/**
 * Single-instance, in-memory implementation of IConnectionStore. See the TODO on the
 * interface — this must become Redis-backed before the Gateway runs with more than one
 * replica.
 */
@Injectable()
export class InMemoryConnectionStore implements IConnectionStore {
  private readonly byUserId = new Map<string, Socket>();

  set(userId: string, socket: Socket): void {
    this.byUserId.set(userId, socket);
  }

  get(userId: string): Socket | undefined {
    return this.byUserId.get(userId);
  }

  deleteBySocket(socket: Socket): void {
    for (const [userId, existing] of this.byUserId.entries()) {
      if (existing === socket) {
        this.byUserId.delete(userId);
        return;
      }
    }
  }
}
