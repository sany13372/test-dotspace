import { QueryInterface } from 'sequelize';

interface MigrationContext {
  context: QueryInterface;
}

export const UNIQUE_REGISTRATION_CONSTRAINT = 'registrations_event_user_uniq';

/**
 * Добавляет инвариант, которого не хватало на уровне БД: одна регистрация на
 * пару (мероприятие, пользователь). Именно он делает повторные запросы
 * безопасными, даже когда вставку одновременно выполняют два процесса API.
 */
export async function up({ context: queryInterface }: MigrationContext) {
  // На уже существующих дубликатах создание constraint упало бы. Удалять данные
  // нельзя, поэтому вместо этого падаем явно и показываем проблемные пары.
  const [duplicates] = (await queryInterface.sequelize.query(`
    SELECT event_id, user_id, COUNT(*)::int AS total
    FROM registrations
    GROUP BY event_id, user_id
    HAVING COUNT(*) > 1
    ORDER BY total DESC
    LIMIT 20;
  `)) as [Array<{ event_id: string; user_id: string; total: number }>, unknown];

  if (duplicates.length > 0) {
    const sample = duplicates
      .map((row) => `${row.event_id}/${row.user_id} (x${row.total})`)
      .join(', ');

    throw new Error(
      'Cannot add the unique (event_id, user_id) constraint: duplicate ' +
        `registrations already exist. Resolve them manually first: ${sample}`,
    );
  }

  await queryInterface.addConstraint('registrations', {
    fields: ['event_id', 'user_id'],
    type: 'unique',
    name: UNIQUE_REGISTRATION_CONSTRAINT,
  });
}

export async function down({ context: queryInterface }: MigrationContext) {
  await queryInterface.removeConstraint(
    'registrations',
    UNIQUE_REGISTRATION_CONSTRAINT,
  );
}
