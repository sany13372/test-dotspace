import { UniqueConstraintError } from 'sequelize';
import { Event, Registration, User, sequelize } from '../models';

export type RegistrationOutcome =
  | { kind: 'created'; registration: Registration }
  | { kind: 'existing'; registration: Registration }
  | { kind: 'event-not-found' }
  | { kind: 'user-not-found' }
  | { kind: 'event-cancelled' }
  | { kind: 'event-full' };

/**
 * Регистрирует пользователя на мероприятие ровно один раз и никогда не
 * превышает вместимость.
 *
 * Корректность обеспечивает база, а не процесс Node, поэтому решение работает
 * и когда над одной PostgreSQL запущено несколько процессов API:
 *
 *  1. `SELECT ... FOR UPDATE` по строке мероприятия сериализует все попытки
 *     регистрации на него. Связка «посчитать места → вставить» становится
 *     атомарной относительно других попыток на это же мероприятие, при этом
 *     разные мероприятия обрабатываются полностью параллельно.
 *  2. Unique-constraint на (event_id, user_id) — жёсткий инвариант
 *     идемпотентности. Дубликат может только проиграть гонку, но не создать
 *     вторую строку.
 */
export async function registerUserForEvent(
  eventId: string,
  userId: string,
): Promise<RegistrationOutcome> {
  try {
    return await sequelize.transaction(async (transaction) => {
      const event = await Event.findByPk(eventId, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });

      if (!event) {
        return { kind: 'event-not-found' };
      }

      const user = await User.findByPk(userId, { transaction });
      if (!user) {
        return { kind: 'user-not-found' };
      }

      // Идемпотентность проверяется до вместимости намеренно: повтор успешного
      // запроса обязан вернуть ту же регистрацию с 200, даже если к этому
      // моменту мероприятие уже заполнилось.
      const existing = await Registration.findOne({
        where: { eventId: event.id, userId: user.id },
        transaction,
      });

      if (existing) {
        return { kind: 'existing', registration: existing };
      }

      // Стоит ниже ветки идемпотентности по той же причине, что и вместимость:
      // отмена мероприятия не должна превращать повтор уже успешной
      // регистрации в ошибку.
      if (event.status === 'CANCELLED') {
        return { kind: 'event-cancelled' };
      }

      const taken = await Registration.count({
        where: { eventId: event.id },
        transaction,
      });

      if (taken >= event.capacity) {
        return { kind: 'event-full' };
      }

      const registration = await Registration.create(
        { eventId: event.id, userId: user.id },
        { transaction },
      );

      return { kind: 'created', registration };
    });
  } catch (error) {
    // Страховка. Блокировка мероприятия выше уже сериализует дубликаты, но
    // настоящий инвариант — это constraint, поэтому уважаем его, а не
    // превращаем параллельный повтор в 5xx.
    if (error instanceof UniqueConstraintError) {
      const existing = await Registration.findOne({
        where: { eventId, userId },
      });

      if (existing) {
        return { kind: 'existing', registration: existing };
      }
    }

    throw error;
  }
}
