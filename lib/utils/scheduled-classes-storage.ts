import { nanoid } from 'nanoid';
import { db } from '@/lib/utils/database';
import type { ScheduledClassEvent, ScheduledClassEventInput } from '@/lib/types/scheduled-classes';
import {
  normalizeScheduledClassInput,
  sortScheduledClassEvents,
} from '@/lib/utils/scheduled-classes';

function nowIso() {
  return new Date().toISOString();
}

function preserveLocalMultiplayerInviteMetadata(
  multiplayerGame: ScheduledClassEvent['multiplayerGame'],
  existing: ScheduledClassEvent,
  classroomId: string | undefined,
): ScheduledClassEvent['multiplayerGame'] {
  if (!multiplayerGame || !existing.multiplayerGame || classroomId !== existing.classroomId) {
    return multiplayerGame;
  }

  return {
    ...multiplayerGame,
    joinTokenId: multiplayerGame.joinTokenId ?? existing.multiplayerGame.joinTokenId,
    inviteUrl: multiplayerGame.inviteUrl ?? existing.multiplayerGame.inviteUrl,
  };
}

export async function listLocalScheduledClassEvents(): Promise<ScheduledClassEvent[]> {
  const events = await db.scheduledClassEvents.toArray();
  return sortScheduledClassEvents(events);
}

export async function createLocalScheduledClassEvent(
  input: ScheduledClassEventInput,
): Promise<ScheduledClassEvent> {
  const normalized = normalizeScheduledClassInput(input, { requireFutureStart: true });
  if (!normalized.ok) {
    throw new Error(normalized.error);
  }

  const timestamp = nowIso();
  const event: ScheduledClassEvent = {
    id: nanoid(),
    ...normalized.value,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  await db.scheduledClassEvents.put(event);
  return event;
}

export async function updateLocalScheduledClassEvent(
  id: string,
  input: ScheduledClassEventInput,
): Promise<ScheduledClassEvent> {
  const existing = await db.scheduledClassEvents.get(id);
  if (!existing) {
    throw new Error('Scheduled class not found.');
  }

  const normalized = normalizeScheduledClassInput(input, { requireFutureStart: true });
  if (!normalized.ok) {
    throw new Error(normalized.error);
  }

  const eventInput = normalized.value;
  const multiplayerGame = preserveLocalMultiplayerInviteMetadata(
    eventInput.multiplayerGame,
    existing,
    eventInput.classroomId,
  );

  const event: ScheduledClassEvent = {
    ...existing,
    title: eventInput.title,
    startsAt: eventInput.startsAt,
    durationMinutes: eventInput.durationMinutes,
    classroomId: eventInput.classroomId,
    multiplayerGame,
    updatedAt: nowIso(),
  };
  await db.scheduledClassEvents.put(event);
  return event;
}

export async function deleteLocalScheduledClassEvent(id: string): Promise<void> {
  await db.scheduledClassEvents.delete(id);
}
