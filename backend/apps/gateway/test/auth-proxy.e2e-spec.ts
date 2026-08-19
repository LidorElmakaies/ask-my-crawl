import type { Server } from 'http';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { GatewayModule } from '../src/gateway.module';
import { AUTH_SERVICE_CLIENT } from '../src/tokens';
import type { IAuthServiceClient } from '../src/auth-proxy/infrastructure/interfaces/auth-service-client.interface';
import type {
  ProxyRequest,
  ProxyResponse,
} from '../src/auth-proxy/application/interfaces/auth-proxy-service.interface';

// Contract tests for the Gateway's proxy surface — per docs/specs/testing conventions, the API
// layer gets e2e/contract tests against real HTTP routes. The one thing intentionally NOT real
// here is Auth Service itself: AUTH_SERVICE_CLIENT is swapped for an in-process fake, so these
// tests verify Gateway's own behavior (guards short-circuit correctly, requests are built
// correctly, responses relay verbatim) without needing a live Auth Service — that behavior (does
// Auth Service correctly handle what's forwarded) is Auth Service's own e2e suite's job.
const JWT_SECRET = 'e2e-proxy-test-secret';

describe('Auth proxy (e2e)', () => {
  let app: INestApplication;
  let server: Server;
  let recordedRequests: ProxyRequest[];
  let nextResponse: ProxyResponse;

  const fakeClient: IAuthServiceClient = {
    forward: (proxyRequest: ProxyRequest) => {
      recordedRequests.push(proxyRequest);
      return Promise.resolve(nextResponse);
    },
  };

  beforeAll(async () => {
    process.env.JWT_SECRET = JWT_SECRET;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [GatewayModule],
    })
      .overrideProvider(AUTH_SERVICE_CLIENT)
      .useValue(fakeClient)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    server = app.getHttpServer() as Server;
  });

  beforeEach(() => {
    recordedRequests = [];
    nextResponse = { status: 200, body: { ok: true } };
  });

  afterAll(async () => {
    await app.close();
  });

  function token(role: 'user' | 'admin' = 'user'): string {
    return jwt.sign({ sub: 'e2e-user', role }, JWT_SECRET, { expiresIn: '1h' });
  }

  describe('/auth/* — public, no guard', () => {
    it('forwards register verbatim and relays the response', async () => {
      nextResponse = {
        status: 201,
        body: { user: { id: '1' }, access_token: 'x', refresh_token: 'y' },
      };

      const res = await request(server)
        .post('/auth/register')
        .send({ email: 'a@b.com', password: 'x' });

      expect(res.status).toBe(201);
      expect(res.body).toEqual(nextResponse.body);
      expect(recordedRequests[0]).toMatchObject({
        method: 'POST',
        path: '/auth/register',
        body: { email: 'a@b.com', password: 'x' },
      });
      expect(recordedRequests[0].authorizationHeader).toBeUndefined();
    });

    it('relays a 4xx error response verbatim, not reshaped', async () => {
      nextResponse = {
        status: 409,
        body: { message: 'Email is already registered', error: 'Conflict', statusCode: 409 },
      };

      const res = await request(server)
        .post('/auth/register')
        .send({ email: 'a@b.com', password: 'x' });

      expect(res.status).toBe(409);
      expect(res.body).toEqual(nextResponse.body);
    });

    it('relays a 204 with no body (logout)', async () => {
      nextResponse = { status: 204, body: undefined };

      const res = await request(server)
        .post('/auth/logout')
        .send({ refresh_token: 'x' });

      expect(res.status).toBe(204);
      expect(res.body).toEqual({});
    });
  });

  describe('/me — requires a valid token, any role', () => {
    it('401s without ever calling the downstream client', async () => {
      const res = await request(server).get('/me');
      expect(res.status).toBe(401);
      expect(recordedRequests).toHaveLength(0);
    });

    it('forwards the Authorization header downstream on a valid token', async () => {
      const t = token('user');
      await request(server).get('/me').set('Authorization', `Bearer ${t}`);

      expect(recordedRequests[0]).toMatchObject({
        method: 'GET',
        path: '/me',
        authorizationHeader: `Bearer ${t}`,
      });
    });

    it('forwards a PATCH body alongside the header', async () => {
      const t = token('user');
      await request(server)
        .patch('/me')
        .set('Authorization', `Bearer ${t}`)
        .send({ name: 'New Name' });

      expect(recordedRequests[0]).toMatchObject({
        method: 'PATCH',
        path: '/me',
        body: { name: 'New Name' },
        authorizationHeader: `Bearer ${t}`,
      });
    });
  });

  describe('/admin/users* — requires a valid token AND admin role', () => {
    it('401s with no token, without calling the downstream client', async () => {
      const res = await request(server).get('/admin/users');
      expect(res.status).toBe(401);
      expect(recordedRequests).toHaveLength(0);
    });

    it('403s a valid non-admin token, without calling the downstream client', async () => {
      const res = await request(server)
        .get('/admin/users')
        .set('Authorization', `Bearer ${token('user')}`);

      expect(res.status).toBe(403);
      expect(recordedRequests).toHaveLength(0);
    });

    it('forwards for a valid admin token', async () => {
      const t = token('admin');
      await request(server).get('/admin/users').set('Authorization', `Bearer ${t}`);

      expect(recordedRequests[0]).toMatchObject({
        method: 'GET',
        path: '/admin/users',
        authorizationHeader: `Bearer ${t}`,
      });
    });

    it('builds the forwarded path from the :id param', async () => {
      const t = token('admin');
      await request(server)
        .delete('/admin/users/abc-123')
        .set('Authorization', `Bearer ${t}`);

      expect(recordedRequests[0]).toMatchObject({
        method: 'DELETE',
        path: '/admin/users/abc-123',
      });
    });
  });
});
