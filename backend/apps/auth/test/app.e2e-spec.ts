/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call --
   supertest types `res.body` as `any` (it can't know the response shape) — this file asserts
   on JSON response bodies throughout, which is the normal shape of an e2e test. */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import request from 'supertest';
import type { IUserRepository } from '../src/infrastructure/interfaces/user-repository.interface';
import { AuthModule } from '../src/auth.module';
import { USER_REPOSITORY } from '../src/tokens';

describe('Auth Service (e2e)', () => {
  let container: StartedPostgreSqlContainer;
  let app: INestApplication;
  let httpServer: import('http').Server;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').start();

    process.env.DATABASE_URL = container.getConnectionUri();
    process.env.JWT_SECRET = 'e2e-test-secret';
    process.env.PASSWORD_PEPPER = 'e2e-test-pepper';
    process.env.NODE_ENV = 'test'; // not 'production' — TypeORM synchronize stays on

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AuthModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
    httpServer = app.getHttpServer() as import('http').Server;
  });

  afterAll(async () => {
    await app.close();
    await container.stop();
  });

  async function registerUser(
    email: string,
    password = 'correct-horse-battery',
  ) {
    const res = await request(httpServer)
      .post('/auth/register')
      .send({ email, password, name: 'Test User' });
    return res;
  }

  async function promoteToAdmin(userId: string) {
    const repo = app.get<IUserRepository>(USER_REPOSITORY);
    await repo.update(userId, { role: 'admin' });
  }

  describe('POST /auth/register', () => {
    it('creates a user and returns tokens, never the password hash/salt', async () => {
      const res = await registerUser('alice@example.com');

      expect(res.status).toBe(201);
      expect(res.body.user).toMatchObject({
        email: 'alice@example.com',
        role: 'user',
      });
      expect(res.body.user).not.toHaveProperty('password_hash');
      expect(res.body.user).not.toHaveProperty('passwordHash');
      expect(res.body.access_token).toEqual(expect.any(String));
      expect(res.body.refresh_token).toEqual(expect.any(String));
    });

    it('normalizes email case (Bob@x.com and bob@x.com are the same account)', async () => {
      await registerUser('Bob@Example.com');
      const res = await registerUser('bob@example.com');

      expect(res.status).toBe(409);
    });

    it('rejects a password shorter than 8 characters', async () => {
      const res = await request(httpServer)
        .post('/auth/register')
        .send({ email: 'short@example.com', password: 'short' });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /auth/login', () => {
    it('logs in with the correct password', async () => {
      await registerUser('carol@example.com', 'correct-password');
      const res = await request(httpServer)
        .post('/auth/login')
        .send({ email: 'carol@example.com', password: 'correct-password' });

      expect(res.status).toBe(200);
      expect(res.body.user.email).toBe('carol@example.com');
    });

    it('rejects the wrong password', async () => {
      await registerUser('dave@example.com', 'correct-password');
      const res = await request(httpServer)
        .post('/auth/login')
        .send({ email: 'dave@example.com', password: 'wrong-password' });

      expect(res.status).toBe(401);
    });
  });

  describe('POST /auth/refresh + /auth/logout', () => {
    it('rotates the refresh token, invalidating the old one', async () => {
      const registerRes = await registerUser('erin@example.com');
      const firstRefreshToken: string = registerRes.body.refresh_token;

      const refreshRes = await request(httpServer)
        .post('/auth/refresh')
        .send({ refresh_token: firstRefreshToken });
      expect(refreshRes.status).toBe(200);
      expect(refreshRes.body.refresh_token).not.toBe(firstRefreshToken);

      // The original token was rotated out — using it again must fail.
      const replayRes = await request(httpServer)
        .post('/auth/refresh')
        .send({ refresh_token: firstRefreshToken });
      expect(replayRes.status).toBe(401);
    });

    it('logout revokes the refresh token', async () => {
      const registerRes = await registerUser('frank@example.com');
      const refreshToken: string = registerRes.body.refresh_token;

      const logoutRes = await request(httpServer)
        .post('/auth/logout')
        .send({ refresh_token: refreshToken });
      expect(logoutRes.status).toBe(204);

      const refreshRes = await request(httpServer)
        .post('/auth/refresh')
        .send({ refresh_token: refreshToken });
      expect(refreshRes.status).toBe(401);
    });
  });

  describe('GET/PATCH /me', () => {
    it('rejects a request with no token', async () => {
      const res = await request(httpServer).get('/me');
      expect(res.status).toBe(401);
    });

    it('returns the authenticated user', async () => {
      const registerRes = await registerUser('grace@example.com');
      const res = await request(httpServer)
        .get('/me')
        .set(
          'Authorization',
          `Bearer ${registerRes.body.access_token as string}`,
        );

      expect(res.status).toBe(200);
      expect(res.body.email).toBe('grace@example.com');
    });

    it('updates the authenticated user', async () => {
      const registerRes = await registerUser('heidi@example.com');
      const res = await request(httpServer)
        .patch('/me')
        .set(
          'Authorization',
          `Bearer ${registerRes.body.access_token as string}`,
        )
        .send({ name: 'Heidi Updated' });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Heidi Updated');
    });
  });

  describe('/admin/users', () => {
    it('rejects a non-admin user with 403', async () => {
      const registerRes = await registerUser('ivan@example.com');
      const res = await request(httpServer)
        .get('/admin/users')
        .set(
          'Authorization',
          `Bearer ${registerRes.body.access_token as string}`,
        );

      expect(res.status).toBe(403);
    });

    it('allows an admin to list, update, and delete users', async () => {
      const adminRegister = await registerUser('judy-admin@example.com');
      await promoteToAdmin(adminRegister.body.user.id as string);
      // The access token minted at register time still has role: "user" baked in — admin
      // status only takes effect on the next login, matching how a real role change would
      // need a fresh token in any JWT-based system.
      const adminLogin = await request(httpServer).post('/auth/login').send({
        email: 'judy-admin@example.com',
        password: 'correct-horse-battery',
      });
      const adminToken = adminLogin.body.access_token as string;

      const targetRegister = await registerUser('kevin@example.com');
      const targetId = targetRegister.body.user.id as string;

      const listRes = await request(httpServer)
        .get('/admin/users')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(listRes.status).toBe(200);
      expect(Array.isArray(listRes.body)).toBe(true);
      expect(listRes.body.some((u: { id: string }) => u.id === targetId)).toBe(
        true,
      );

      const updateRes = await request(httpServer)
        .patch(`/admin/users/${targetId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ role: 'admin' });
      expect(updateRes.status).toBe(200);
      expect(updateRes.body.role).toBe('admin');

      const deleteRes = await request(httpServer)
        .delete(`/admin/users/${targetId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(deleteRes.status).toBe(204);

      const getDeletedRes = await request(httpServer)
        .get(`/admin/users/${targetId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(getDeletedRes.status).toBe(404);
    });
  });
});
