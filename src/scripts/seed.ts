import { Event, User, sequelize } from '../models';

export const SEED_EVENT_IDS = {
  main: '00000000-0000-4000-8000-000000000010',
  singleSeat: '00000000-0000-4000-8000-000000000011',
  cancelled: '00000000-0000-4000-8000-000000000012',
} as const;

export function seedUserId(number: number): string {
  return `00000000-0000-4000-8000-${number.toString().padStart(12, '0')}`;
}

export async function seedDatabase(): Promise<void> {
  const events = [
    {
      id: SEED_EVENT_IDS.main,
      title: 'Backend Community Meetup',
      capacity: 10,
      status: 'OPEN' as const,
    },
    {
      id: SEED_EVENT_IDS.singleSeat,
      title: 'Small TypeScript Workshop',
      capacity: 1,
      status: 'OPEN' as const,
    },
    {
      id: SEED_EVENT_IDS.cancelled,
      title: 'Cancelled PostgreSQL Talk',
      capacity: 10,
      status: 'CANCELLED' as const,
    },
  ];

  for (const event of events) {
    await Event.upsert(event);
  }

  for (let number = 1; number <= 25; number += 1) {
    await User.upsert({
      id: seedUserId(number),
      name: `Participant ${number}`,
      email: `participant${number}@example.test`,
    });
  }
}

if (require.main === module) {
  seedDatabase()
    .then(() => sequelize.close())
    .catch(async (error) => {
      console.error('Seed failed', error);
      await sequelize.close();
      process.exit(1);
    });
}
