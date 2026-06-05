import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const toArrayMock = vi.fn();
const getMock = vi.fn();
const putMock = vi.fn();
const deleteMock = vi.fn();

vi.mock('@/lib/utils/database', () => ({
  db: {
    scheduledClassEvents: {
      toArray: toArrayMock,
      get: getMock,
      put: putMock,
      delete: deleteMock,
    },
  },
}));

describe('local scheduled class storage', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-11T17:00:00.000Z'));
    toArrayMock.mockReset();
    getMock.mockReset();
    putMock.mockReset();
    deleteMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('lists local events sorted by start time', async () => {
    toArrayMock.mockResolvedValue([
      {
        id: 'later',
        title: 'Later',
        startsAt: '2026-05-13T17:00:00.000Z',
        createdAt: '2026-05-11T00:00:00.000Z',
        updatedAt: '2026-05-11T00:00:00.000Z',
      },
      {
        id: 'sooner',
        title: 'Sooner',
        startsAt: '2026-05-12T17:00:00.000Z',
        createdAt: '2026-05-11T00:00:00.000Z',
        updatedAt: '2026-05-11T00:00:00.000Z',
      },
    ]);

    const { listLocalScheduledClassEvents } = await import('@/lib/utils/scheduled-classes-storage');

    await expect(listLocalScheduledClassEvents()).resolves.toMatchObject([
      { id: 'sooner' },
      { id: 'later' },
    ]);
  });

  it('creates, updates, and deletes local events', async () => {
    const {
      createLocalScheduledClassEvent,
      updateLocalScheduledClassEvent,
      deleteLocalScheduledClassEvent,
    } = await import('@/lib/utils/scheduled-classes-storage');

    const created = await createLocalScheduledClassEvent({
      title: 'Lab',
      startsAt: '2026-05-12T17:00:00.000Z',
      durationMinutes: 30,
      classroomId: 'room-1',
    });
    expect(created).toEqual(
      expect.objectContaining({
        title: 'Lab',
        startsAt: '2026-05-12T17:00:00.000Z',
        durationMinutes: 30,
        classroomId: 'room-1',
        createdAt: '2026-05-11T17:00:00.000Z',
      }),
    );
    expect(putMock).toHaveBeenCalledWith(expect.objectContaining({ title: 'Lab' }));

    getMock.mockResolvedValue(created);
    const updated = await updateLocalScheduledClassEvent(created.id, {
      title: 'Updated lab',
      startsAt: '2026-05-12T18:00:00.000Z',
    });
    expect(updated).toEqual(expect.objectContaining({ title: 'Updated lab' }));
    expect(updated.durationMinutes).toBeUndefined();
    expect(updated.classroomId).toBeUndefined();
    expect(putMock).toHaveBeenLastCalledWith(expect.objectContaining({ title: 'Updated lab' }));

    await deleteLocalScheduledClassEvent(created.id);
    expect(deleteMock).toHaveBeenCalledWith(created.id);
  });

  it('preserves multiplayer invite metadata on same classroom', async () => {
    const { updateLocalScheduledClassEvent } =
      await import('@/lib/utils/scheduled-classes-storage');

    const existing = {
      id: 'class-id',
      title: 'Physics',
      startsAt: '2026-05-12T17:00:00.000Z',
      durationMinutes: 30,
      classroomId: 'room-1',
      createdAt: '2026-05-11T17:00:00.000Z',
      updatedAt: '2026-05-11T17:00:00.000Z',
      multiplayerGame: {
        enabled: true,
        mode: 'both',
        linkPolicy: 'always_open',
        inviteExpiresAt: '2026-05-12T18:30:00.000Z',
        joinTokenId: 'old-token',
        inviteUrl: 'https://open-raic.com/join/old',
      },
    };
    getMock.mockResolvedValue(existing);

    const updated = await updateLocalScheduledClassEvent('class-id', {
      title: 'Physics updated',
      startsAt: '2026-05-12T18:00:00.000Z',
      durationMinutes: 60,
      classroomId: 'room-1',
      multiplayerGame: {
        enabled: true,
        mode: 'leaderboard',
      },
    });

    expect(updated.multiplayerGame).toEqual(
      expect.objectContaining({
        enabled: true,
        mode: 'leaderboard',
        linkPolicy: 'always_open',
        joinTokenId: 'old-token',
        inviteUrl: 'https://open-raic.com/join/old',
      }),
    );
    expect(putMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        multiplayerGame: expect.objectContaining({
          joinTokenId: 'old-token',
          inviteUrl: 'https://open-raic.com/join/old',
        }),
      }),
    );
  });

  it('clears multiplayer metadata when multiplayer mode is omitted', async () => {
    const { updateLocalScheduledClassEvent } =
      await import('@/lib/utils/scheduled-classes-storage');

    getMock.mockResolvedValue({
      id: 'class-id',
      title: 'Physics',
      startsAt: '2026-05-12T17:00:00.000Z',
      durationMinutes: 30,
      classroomId: 'room-1',
      createdAt: '2026-05-11T17:00:00.000Z',
      updatedAt: '2026-05-11T17:00:00.000Z',
      multiplayerGame: {
        enabled: true,
        mode: 'both',
        linkPolicy: 'always_open',
        joinTokenId: 'old-token',
        inviteUrl: 'https://open-raic.com/join/old',
      },
    });

    const updated = await updateLocalScheduledClassEvent('class-id', {
      title: 'Physics updated',
      startsAt: '2026-05-12T18:00:00.000Z',
      durationMinutes: 60,
      classroomId: 'room-1',
    });

    expect(updated.multiplayerGame).toBeUndefined();
    expect(putMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        multiplayerGame: undefined,
      }),
    );
  });

  it('does not preserve invite metadata when classroom changes', async () => {
    const { updateLocalScheduledClassEvent } =
      await import('@/lib/utils/scheduled-classes-storage');

    getMock.mockResolvedValue({
      id: 'class-id',
      title: 'Physics',
      startsAt: '2026-05-12T17:00:00.000Z',
      durationMinutes: 30,
      classroomId: 'room-1',
      createdAt: '2026-05-11T17:00:00.000Z',
      updatedAt: '2026-05-11T17:00:00.000Z',
      multiplayerGame: {
        enabled: true,
        mode: 'both',
        linkPolicy: 'always_open',
        joinTokenId: 'old-token',
        inviteUrl: 'https://open-raic.com/join/old',
      },
    });

    const updated = await updateLocalScheduledClassEvent('class-id', {
      title: 'Physics moved',
      startsAt: '2026-05-12T18:00:00.000Z',
      durationMinutes: 60,
      classroomId: 'room-2',
      multiplayerGame: {
        enabled: true,
        mode: 'leaderboard',
      },
    });

    expect(updated.multiplayerGame).toEqual(
      expect.objectContaining({
        enabled: true,
        mode: 'leaderboard',
        linkPolicy: 'always_open',
      }),
    );
    expect(updated.multiplayerGame?.joinTokenId).toBeUndefined();
    expect(updated.multiplayerGame?.inviteUrl).toBeUndefined();
    expect(putMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        classroomId: 'room-2',
        multiplayerGame: expect.not.objectContaining({
          joinTokenId: expect.any(String),
          inviteUrl: expect.any(String),
        }),
      }),
    );
  });
});
