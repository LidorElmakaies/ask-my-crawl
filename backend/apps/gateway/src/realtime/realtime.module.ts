import { Module } from '@nestjs/common';
import { AuthKernelModule } from '@app/auth-kernel';
import { RealtimeGateway } from './api/realtime.gateway';
import { RealtimeConnectionService } from './application/realtime-connection.service';
import { InMemoryConnectionStore } from './infrastructure/websocket/in-memory-connection-store';
import { CONNECTION_STORE, REALTIME_CONNECTION_SERVICE } from '../tokens';

@Module({
  imports: [AuthKernelModule],
  providers: [
    RealtimeGateway,
    {
      provide: REALTIME_CONNECTION_SERVICE,
      useClass: RealtimeConnectionService,
    },
    { provide: CONNECTION_STORE, useClass: InMemoryConnectionStore },
  ],
})
export class RealtimeModule {}
