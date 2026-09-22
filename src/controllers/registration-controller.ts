import { NextFunction, Request, Response } from 'express';
import { Event, Registration, User } from '../models';

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
    const { userId } = req.body as { userId?: string };

    const event = await Event.findByPk(eventId);
    if (!event) {
      res.status(404).json({
        error: { code: 'EVENT_NOT_FOUND', message: 'Event was not found' },
      });
      return;
    }

    const registrationsNow = await Registration.count({ where: { eventId } });
    if (registrationsNow >= event.capacity) {
      res.status(409).json({
        error: { code: 'EVENT_FULL', message: 'There are no free places' },
      });
      return;
    }

    const user = await User.findByPk(userId);
    if (!user) {
      res.status(404).json({
        error: { code: 'USER_NOT_FOUND', message: 'User was not found' },
      });
      return;
    }

    const sameRegistration = await Registration.findOne({
      where: { eventId, userId: user.id },
    });

    if (sameRegistration) {
      res.status(200).json({
        registration: {
          id: sameRegistration.id,
          eventId: sameRegistration.eventId,
          userId: sameRegistration.userId,
          createdAt: sameRegistration.createdAt,
        },
      });
      return;
    }

    const created = await Registration.create({ eventId, userId: user.id });

    res.status(201).json({ registration: registrationJson(created) });
  } catch (error) {
    next(error);
  }
}
