import { ChildProcess, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Registration, sequelize } from '../src/models';
import { migrateDatabase } from '../src/scripts/migrate';
import {
  SEED_EVENT_IDS,
  seedDatabase,
  seedUserId,
} from '../src/scripts/seed';


/**
 * Набор тестов в одном процессе делит общий пул соединений, поэтому он не
 * отличает инвариант в базе от случайной сериализации внутри пула. Здесь мы
 * поднимаем три независимых процесса API над одной PostgreSQL и даём им
 * подраться за одни и те же места.
 */

const PROJECT_ROOT = path.resolve(__dirname, '..');
const TSX_BIN = path.join(PROJECT_ROOT, 'node_modules', '.bin', 'tsx');
const PORTS = [34101, 34102, 34103];
const MAIN_CAPACITY = 10;
const SEEDED_USERS = 25;

const children: ChildProcess[] = [];

function startApi(port: number): ChildProcess {
  const child = spawn(TSX_BIN, [path.join(PROJECT_ROOT, 'src', 'server.ts')], {
    cwd: PROJECT_ROOT,
    env: { ...process.env, PORT: String(port) },
    stdio: 'ignore',
  });

  children.push(child);
  return child;
}

async function waitForHealth(port: number, timeoutMs = 45_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      if (response.ok) {
        return;
      }
    } catch {
      // Процесс ещё поднимается.
    }

    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  throw new Error(`API on port ${port} did not become healthy in time`);
}

async function register(
  port: number,
  eventId: string,
  userId: string,
): Promise<{ status: number; body: any }> {
  const response = await fetch(
    `http://127.0.0.1:${port}/events/${eventId}/registrations`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    },
  );

  return { status: response.status, body: await response.json() };
}

function countByStatus(
  results: Array<{ status: number }>,
): Record<number, number> {
  const counts: Record<number, number> = {};
  for (const result of results) {
    counts[result.status] = (counts[result.status] ?? 0) + 1;
  }
  return counts;
}

// tsx есть только в development-образе; в остальных случаях пропускаем набор,
// а не падаем.
const suite = existsSync(TSX_BIN) ? describe : describe.skip;

suite('several API processes on one PostgreSQL', () => {
  beforeAll(async () => {
    if (!sequelize.getDatabaseName().endsWith('_test')) {
      throw new Error(
        `Refusing to truncate non-test database "${sequelize.getDatabaseName()}"`,
      );
    }

    await sequelize.authenticate();
    await migrateDatabase();

    PORTS.forEach(startApi);
    await Promise.all(PORTS.map((port) => waitForHealth(port)));
  }, 90_000);

  beforeEach(async () => {
    await sequelize.query(
      'TRUNCATE TABLE registrations, events, users CASCADE;',
    );
    await seedDatabase();
  });

  afterAll(async () => {
    await Promise.all(
      children.map(
        (child) =>
          new Promise<void>((resolve) => {
            if (child.exitCode !== null || child.signalCode !== null) {
              resolve();
              return;
            }
            child.once('exit', () => resolve());
            child.kill('SIGKILL');
          }),
      ),
    );

    await sequelize.close();
  }, 30_000);

  it(
    'fills the event exactly to capacity across processes',
    async () => {
      const results = await Promise.all(
        Array.from({ length: SEEDED_USERS }, (_unused, index) =>
          register(
            PORTS[index % PORTS.length] as number,
            SEED_EVENT_IDS.main,
            seedUserId(index + 1),
          ),
        ),
      );

      expect(results.filter((result) => result.status >= 500)).toEqual([]);
      expect(countByStatus(results)).toEqual({
        201: MAIN_CAPACITY,
        409: SEEDED_USERS - MAIN_CAPACITY,
      });
      expect(
        await Registration.count({ where: { eventId: SEED_EVENT_IDS.main } }),
      ).toBe(MAIN_CAPACITY);
    },
    60_000,
  );

  it(
    'gives the last seat to exactly one process',
    async () => {
      const attempts = 30;

      const results = await Promise.all(
        Array.from({ length: attempts }, (_unused, index) =>
          register(
            PORTS[index % PORTS.length] as number,
            SEED_EVENT_IDS.singleSeat,
            seedUserId((index % SEEDED_USERS) + 1),
          ),
        ),
      );

      expect(results.filter((result) => result.status >= 500)).toEqual([]);
      expect(countByStatus(results)[201]).toBe(1);
      expect(
        await Registration.count({
          where: { eventId: SEED_EVENT_IDS.singleSeat },
        }),
      ).toBe(1);
    },
    60_000,
  );

  it(
    'deduplicates the same event/user pair arriving at different processes',
    async () => {
      const userId = seedUserId(1);

      const results = await Promise.all(
        PORTS.flatMap((port) =>
          Array.from({ length: 5 }, () =>
            register(port, SEED_EVENT_IDS.main, userId),
          ),
        ),
      );

      expect(results.filter((result) => result.status >= 500)).toEqual([]);
      expect(countByStatus(results)).toEqual({
        201: 1,
        200: PORTS.length * 5 - 1,
      });

      const ids = new Set(
        results.map((result) => result.body.registration.id as string),
      );
      expect(ids.size).toBe(1);
      expect(await Registration.count()).toBe(1);
    },
    60_000,
  );
});
