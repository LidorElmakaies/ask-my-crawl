import { Inject, Logger } from '@nestjs/common';
import {
  OnGatewayDisconnect,
  OnGatewayInit,
  WebSocketGateway,
} from '@nestjs/websockets';
import type { DefaultEventsMap, Server, Socket } from 'socket.io';
import { AUTH_TOKEN_SERVICE, type IAuthTokenService } from '@app/auth-kernel';
import { REALTIME_CONNECTION_SERVICE } from '../tokens';
import type { IRealtimeConnectionService } from '../application/interfaces/realtime-connection.interface';

interface SocketData {
  userId: string;
}

type AppSocket = Socket<
  DefaultEventsMap,
  DefaultEventsMap,
  DefaultEventsMap,
  SocketData
>;

/**
 * API layer. Per docs/specs/api-contracts.md: Socket.IO at path `/ws`, token passed as
 * `auth: { token }` in the client handshake. Does exactly two things — authenticate the
 * handshake, hand off to the Application layer — no business logic here.
 */
@WebSocketGateway({ path: '/ws' })
export class RealtimeGateway implements OnGatewayInit, OnGatewayDisconnect {
  private readonly logger = new Logger(RealtimeGateway.name);

  constructor(
    @Inject(AUTH_TOKEN_SERVICE)
    private readonly authTokenService: IAuthTokenService,
    @Inject(REALTIME_CONNECTION_SERVICE)
    private readonly connectionService: IRealtimeConnectionService,
  ) {}

  // Auth middleware runs before a handshake is accepted — an invalid/missing token rejects the
  // connection outright (client gets `connect_error`), instead of accepting the connection and
  // closing it immediately after (what the raw-ws version had to do).
  afterInit(
    server: Server<
      DefaultEventsMap,
      DefaultEventsMap,
      DefaultEventsMap,
      SocketData
    >,
  ): void {
    server.use((socket: AppSocket, next) => {
      this.authenticate(socket, next).catch(next);
    });
  }

  handleConnection(client: AppSocket): void {
    this.connectionService.handleConnect(client.data.userId, client);
  }

  handleDisconnect(client: AppSocket): void {
    this.connectionService.handleDisconnect(client);
  }

  private async authenticate(
    socket: AppSocket,
    next: (err?: Error) => void,
  ): Promise<void> {
    const token = this.extractToken(socket);
    const identity = await this.authTokenService.verify(token);

    if (!identity) {
      this.logger.warn('Rejected WS connection: missing or invalid token');
      next(new Error('Unauthorized'));
      return;
    }

    socket.data.userId = identity.userId;
    next();
  }

  private extractToken(socket: AppSocket): string | null {
    const token: unknown = socket.handshake.auth?.token;
    return typeof token === 'string' ? token : null;
  }
}
