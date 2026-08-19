import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Socket } from 'socket.io';
import { CONNECTION_STORE } from '../../tokens';
import type { IConnectionStore } from '../infrastructure/interfaces/connection-store.interface';
import type { IRealtimeConnectionService } from './interfaces/realtime-connection.interface';

@Injectable()
export class RealtimeConnectionService implements IRealtimeConnectionService {
  private readonly logger = new Logger(RealtimeConnectionService.name);

  constructor(
    @Inject(CONNECTION_STORE) private readonly connections: IConnectionStore,
  ) {}

  handleConnect(userId: string, socket: Socket): void {
    this.connections.set(userId, socket);
    this.logger.log(`User ${userId} connected`);
  }

  handleDisconnect(socket: Socket): void {
    this.connections.deleteBySocket(socket);
  }

  pushToUser(userId: string, event: Record<string, unknown>): boolean {
    const socket = this.connections.get(userId);
    if (!socket || !socket.connected) {
      // Not an error — see api-contracts.md: the user still gets the result through the other
      // notification channels and GET /jobs/:id.
      return false;
    }
    socket.emit('message', event);
    return true;
  }
}
