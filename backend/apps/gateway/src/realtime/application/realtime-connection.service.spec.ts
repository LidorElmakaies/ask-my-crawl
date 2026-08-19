/* eslint-disable @typescript-eslint/unbound-method --
   false positive: these are jest.fn() mocks, not real prototype methods relying on `this`. */
import type { Socket } from 'socket.io';
import type { IConnectionStore } from '../infrastructure/interfaces/connection-store.interface';
import { RealtimeConnectionService } from './realtime-connection.service';

function fakeSocket(connected: boolean): Socket {
  return { connected, emit: jest.fn() } as unknown as Socket;
}

function makeStore(): jest.Mocked<IConnectionStore> {
  return { set: jest.fn(), get: jest.fn(), deleteBySocket: jest.fn() };
}

describe('RealtimeConnectionService', () => {
  it('registers a connecting user in the store', () => {
    const store = makeStore();
    const service = new RealtimeConnectionService(store);
    const socket = fakeSocket(true);

    service.handleConnect('user-1', socket);

    expect(store.set).toHaveBeenCalledWith('user-1', socket);
  });

  it('unregisters a socket on disconnect', () => {
    const store = makeStore();
    const service = new RealtimeConnectionService(store);
    const socket = fakeSocket(true);

    service.handleDisconnect(socket);

    expect(store.deleteBySocket).toHaveBeenCalledWith(socket);
  });

  it('delivers an event and returns true when the user has an open connection', () => {
    const store = makeStore();
    const socket = fakeSocket(true);
    store.get.mockReturnValue(socket);
    const service = new RealtimeConnectionService(store);

    const delivered = service.pushToUser('user-1', { type: 'job.completed' });

    expect(delivered).toBe(true);
    expect(socket.emit).toHaveBeenCalledWith('message', {
      type: 'job.completed',
    });
  });

  it('returns false, without throwing, when the user has no connection', () => {
    const store = makeStore();
    store.get.mockReturnValue(undefined);
    const service = new RealtimeConnectionService(store);

    expect(service.pushToUser('user-1', { type: 'job.completed' })).toBe(false);
  });

  it("returns false when the user's socket exists but is not connected", () => {
    const store = makeStore();
    const socket = fakeSocket(false);
    store.get.mockReturnValue(socket);
    const service = new RealtimeConnectionService(store);

    expect(service.pushToUser('user-1', { type: 'job.completed' })).toBe(false);
    expect(socket.emit).not.toHaveBeenCalled();
  });
});
