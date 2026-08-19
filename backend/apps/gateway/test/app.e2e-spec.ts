import type { Server } from 'http';
import type { AddressInfo } from 'net';
import { INestApplication } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { Test, TestingModule } from '@nestjs/testing';
import jwt from 'jsonwebtoken';
import { io, type Socket } from 'socket.io-client';
import type { IRealtimeConnectionService } from '../src/realtime/application/interfaces/realtime-connection.interface';
import { GatewayModule } from '../src/gateway.module';
import { REALTIME_CONNECTION_SERVICE } from '../src/tokens';

const JWT_SECRET = 'e2e-test-secret';

describe('Realtime WS (e2e)', () => {
  let app: INestApplication;
  let baseUrl: string;
  let connectionService: IRealtimeConnectionService;
  const clients: Socket[] = [];

  beforeAll(async () => {
    process.env.JWT_SECRET = JWT_SECRET;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [GatewayModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useWebSocketAdapter(new IoAdapter(app));
    await app.listen(0);

    connectionService = moduleFixture.get(REALTIME_CONNECTION_SERVICE);

    const httpServer = app.getHttpServer() as Server;
    const address = httpServer.address() as AddressInfo;
    baseUrl = `http://localhost:${address.port}`;
  });

  afterEach(() => {
    clients.forEach((client) => client.disconnect());
    clients.length = 0;
  });

  afterAll(async () => {
    await app.close();
  });

  function connect(token?: string): Socket {
    const client = io(baseUrl, {
      path: '/ws',
      transports: ['websocket'],
      auth: token ? { token } : undefined,
      reconnection: false,
    });
    clients.push(client);
    return client;
  }

  it('rejects a connection with no token', (done) => {
    const client = connect();
    client.on('connect_error', (err) => {
      expect(err.message).toBe('Unauthorized');
      done();
    });
    client.on('connect', () => {
      done(new Error('Should not have connected'));
    });
  });

  it('rejects a connection with an invalid token', (done) => {
    const client = connect('not-a-real-token');
    client.on('connect_error', (err) => {
      expect(err.message).toBe('Unauthorized');
      done();
    });
    client.on('connect', () => {
      done(new Error('Should not have connected'));
    });
  });

  it('accepts a valid token and delivers a pushed event to the right user', (done) => {
    const userId = 'e2e-user';
    const token = jwt.sign({ sub: userId, role: 'user' }, JWT_SECRET, {
      expiresIn: '1h',
    });
    const client = connect(token);

    client.on('connect', () => {
      const delivered = connectionService.pushToUser(userId, {
        type: 'job.completed',
        job_id: 'job-e2e',
        answer_text: 'hi',
      });
      expect(delivered).toBe(true);
    });

    client.on('message', (payload: unknown) => {
      expect(payload).toMatchObject({
        type: 'job.completed',
        job_id: 'job-e2e',
        answer_text: 'hi',
      });
      done();
    });
  });

  it('does not deliver a push meant for a different, unconnected user', (done) => {
    const connectedUserId = 'e2e-user-connected';
    const otherUserId = 'e2e-user-not-connected';
    const token = jwt.sign({ sub: connectedUserId, role: 'user' }, JWT_SECRET, {
      expiresIn: '1h',
    });
    const client = connect(token);

    client.on('message', () => {
      done(
        new Error('Should not have received a message meant for another user'),
      );
    });

    client.on('connect', () => {
      const delivered = connectionService.pushToUser(otherUserId, {
        type: 'job.completed',
        job_id: 'job-e2e-2',
        answer_text: 'hi',
      });
      expect(delivered).toBe(false);
      done();
    });
  });
});
