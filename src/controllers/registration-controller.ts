import { NextFunction, Request, Response } from 'express';
import { Registration } from '../models';
import { registerUserForEvent } from '../services/registration-service';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function registrationJson(registration: Registration) {
  return {
    id: registration.id,
    eventId: registration.eventId,
    userId: registration.userId,
    createdAt: registration.createdAt,
  };
}

export async function registerForEvent(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const eventId = req.params.eventId as string;
    const { userId } = (req.body ?? {}) as { userId?: unknown };

    // Без этой проверки некорректный id уходит в PostgreSQL как невалидный
    // uuid-литерал и возвращается наружу как 500.
    if (!UUID_PATTERN.test(eventId)) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'eventId must be a uuid',
        },
      });
      return;
    }

    if (typeof userId !== 'string' || !UUID_PATTERN.test(userId)) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'userId must be a uuid',
        },
      });
      return;
    }

    const outcome = await registerUserForEvent(eventId, userId);

    switch (outcome.kind) {
      case 'created':
        res
          .status(201)
          .json({ registration: registrationJson(outcome.registration) });
        return;

      case 'existing':
        res
          .status(200)
          .json({ registration: registrationJson(outcome.registration) });
        return;

      case 'event-not-found':
        res.status(404).json({
          error: { code: 'EVENT_NOT_FOUND', message: 'Event was not found' },
        });
        return;

      case 'user-not-found':
        res.status(404).json({
          error: { code: 'USER_NOT_FOUND', message: 'User was not found' },
        });
        return;

      case 'event-cancelled':
        res.status(409).json({
          error: {
            code: 'EVENT_CANCELLED',
            message: 'Event was cancelled',
          },
        });
        return;

      case 'event-full':
        res.status(409).json({
          error: { code: 'EVENT_FULL', message: 'There are no free places' },
        });
        return;
    }
  } catch (error) {
    next(error);
  }
}
