import { UniqueConstraintError } from 'sequelize';
import { Response } from 'supertest';
import request from 'supertest';
import { beforeAll, beforeEach, afterAll, describe, expect, it } from 'vitest';
import { app } from '../src/app';
import { Event, Registration, sequelize } from '../src/models';
import { migrateDatabase } from '../src/scripts/migrate';
import {
  SEED_EVENT_IDS,
  seedDatabase,
  seedUserId,
} from '../src/scripts/seed';

const MAIN_CAPACITY = 10;
const SEEDED_USERS = 25;

function register(eventId: string, userId: string): Promise<Response> {
  return request(app)
    .post(`/events/${eventId}/registrations`)
    .send({ userId });
}

function countByStatus(responses: Response[]): Record<number, number> {
  const counts: Record<number, number> = {};
  for (const response of responses) {
    counts[response.status] = (counts[response.status] ?? 0) + 1;
  }
  return counts;
}

function serverErrors(responses: Response[]): Response[] {
  return responses.filter((response) => response.status >= 500);
}

beforeAll(async () => {
  if (!sequelize.getDatabaseName().endsWith('_test')) {
    throw new Error(
      `Refusing to truncate non-test database "${sequelize.getDatabaseName()}"`,
    );
  }

  await sequelize.authenticate();
  await migrateDatabase();
});

beforeEach(async () => {
  await sequelize.query('TRUNCATE TABLE registrations, events, users CASCADE;');
  await seedDatabase();
});

afterAll(async () => {
  await sequelize.close();
});

describe('capacity under concurrency', () => {
  it('never exceeds capacity when every seeded user registers at once', async () => {
    const responses = await Promise.all(
      Array.from({ length: SEEDED_USERS }, (_unused, index) =>
        register(SEED_EVENT_IDS.main, seedUserId(index + 1)),
      ),
    );

    expect(serverErrors(responses)).toEqual([]);
    expect(countByStatus(responses)).toEqual({
      201: MAIN_CAPACITY,
      409: SEEDED_USERS - MAIN_CAPACITY,
    });
    expect(
      await Registration.count({ where: { eventId: SEED_EVENT_IDS.main } }),
    ).toBe(MAIN_CAPACITY);
  });

  it('hands the single seat to exactly one of many simultaneous users', async () => {
    const responses = await Promise.all(
      Array.from({ length: SEEDED_USERS }, (_unused, index) =>
        register(SEED_EVENT_IDS.singleSeat, seedUserId(index + 1)),
      ),
    );

    expect(serverErrors(responses)).toEqual([]);
    expect(countByStatus(responses)).toEqual({
      201: 1,
      409: SEEDED_USERS - 1,
    });
    expect(
      await Registration.count({
        where: { eventId: SEED_EVENT_IDS.singleSeat },
      }),
    ).toBe(1);
  });

  it('keeps separate events independent when both are hammered at once', async () => {
    const responses = await Promise.all([
      ...Array.from({ length: SEEDED_USERS }, (_unused, index) =>
        register(SEED_EVENT_IDS.main, seedUserId(index + 1)),
      ),
      ...Array.from({ length: SEEDED_USERS }, (_unused, index) =>
        register(SEED_EVENT_IDS.singleSeat, seedUserId(index + 1)),
      ),
    ]);

    expect(serverErrors(responses)).toEqual([]);
    expect(
      await Registration.count({ where: { eventId: SEED_EVENT_IDS.main } }),
    ).toBe(MAIN_CAPACITY);
    expect(
      await Registration.count({
        where: { eventId: SEED_EVENT_IDS.singleSeat },
      }),
    ).toBe(1);
  });
});

describe('idempotency under concurrency', () => {
  it('creates one registration for a burst of identical retries', async () => {
    const userId = seedUserId(1);

    const responses = await Promise.all(
      Array.from({ length: 20 }, () => register(SEED_EVENT_IDS.main, userId)),
    );

    expect(serverErrors(responses)).toEqual([]);
    expect(countByStatus(responses)).toEqual({ 201: 1, 200: 19 });

    const ids = new Set(
      responses.map((response) => response.body.registration.id as string),
    );
    expect(ids.size).toBe(1);
    expect(await Registration.count()).toBe(1);
  });

  it('gives every user at most one seat when all of them retry concurrently', async () => {
    const attemptsPerUser = 3;

    const responses = await Promise.all(
      Array.from({ length: SEEDED_USERS * attemptsPerUser }, (_unused, index) =>
        register(SEED_EVENT_IDS.main, seedUserId((index % SEEDED_USERS) + 1)),
      ),
    );

    expect(serverErrors(responses)).toEqual([]);
    expect(countByStatus(responses)[201]).toBe(MAIN_CAPACITY);
    expect(await Registration.count()).toBe(MAIN_CAPACITY);

    const rows = await Registration.findAll({
      where: { eventId: SEED_EVENT_IDS.main },
    });
    expect(new Set(rows.map((row) => row.userId)).size).toBe(MAIN_CAPACITY);
  });

  it('still returns 200 for a retry after the event has filled up', async () => {
    // Регресс-тест: раньше проверка вместимости шла до проверки
    // идемпотентности, поэтому этот повтор отвечал 409 вместо исходной
    // регистрации.
    const first = await register(SEED_EVENT_IDS.singleSeat, seedUserId(1));
    expect(first.status).toBe(201);

    const loser = await register(SEED_EVENT_IDS.singleSeat, seedUserId(2));
    expect(loser.status).toBe(409);

    const retry = await register(SEED_EVENT_IDS.singleSeat, seedUserId(1));

    expect(retry.status).toBe(200);
    expect(retry.body.registration.id).toBe(first.body.registration.id);
    expect(await Registration.count()).toBe(1);
  });

  it('rejects a duplicate pair at the database level', async () => {
    const created = await Registration.create({
      eventId: SEED_EVENT_IDS.main,
      userId: seedUserId(1),
    });

    await expect(
      Registration.create({
        eventId: created.eventId,
        userId: created.userId,
      }),
    ).rejects.toBeInstanceOf(UniqueConstraintError);
  });
});

describe('cancelled events', () => {
  it('refuses a new registration for a cancelled event', async () => {
    const response = await register(SEED_EVENT_IDS.cancelled, seedUserId(1));

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('EVENT_CANCELLED');
    expect(await Registration.count()).toBe(0);
  });

  it('refuses every request of a concurrent burst on a cancelled event', async () => {
    const responses = await Promise.all(
      Array.from({ length: SEEDED_USERS }, (_unused, index) =>
        register(SEED_EVENT_IDS.cancelled, seedUserId(index + 1)),
      ),
    );

    expect(serverErrors(responses)).toEqual([]);
    expect(countByStatus(responses)).toEqual({ 409: SEEDED_USERS });
    expect(await Registration.count()).toBe(0);
  });

  // Отмена закрывает только создание новых регистраций, а не чтение уже
  // существующей: иначе отмена задним числом ломала бы работавшие повторы.
  it('still replays an existing registration if the event is cancelled later', async () => {
    const first = await register(SEED_EVENT_IDS.main, seedUserId(1));
    expect(first.status).toBe(201);

    await Event.update(
      { status: 'CANCELLED' },
      { where: { id: SEED_EVENT_IDS.main } },
    );

    const retry = await register(SEED_EVENT_IDS.main, seedUserId(1));

    expect(retry.status).toBe(200);
    expect(retry.body.registration.id).toBe(first.body.registration.id);
    expect(await Registration.count()).toBe(1);
  });

  it('refuses a different user once the event is cancelled', async () => {
    await Event.update(
      { status: 'CANCELLED' },
      { where: { id: SEED_EVENT_IDS.main } },
    );

    const response = await register(SEED_EVENT_IDS.main, seedUserId(2));

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('EVENT_CANCELLED');
    expect(await Registration.count()).toBe(0);
  });
});

describe('request validation', () => {
  it.each([
    ['a malformed event id', 'not-a-uuid', seedUserId(1)],
    ['a malformed user id', SEED_EVENT_IDS.main, 'not-a-uuid'],
  ])('answers 400 rather than 500 for %s', async (_name, eventId, userId) => {
    const response = await register(eventId, userId);

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('answers 400 when userId is missing', async () => {
    const response = await request(app)
      .post(`/events/${SEED_EVENT_IDS.main}/registrations`)
      .send({});

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });
});
