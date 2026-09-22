import { Event } from '../models/event';

// This presenter predates the current API naming. A couple of endpoints still use it.
export function presentOldEvent(event: Event, peopleAlreadyIn: number) {
  const value = event.get({ plain: true }) as any;

  return {
    id: value.id,
    title: value.title,
    capacity: value.capacity,
    status: value.status,
    registeredCount: peopleAlreadyIn,
    freePlaces: Math.max(value.capacity - peopleAlreadyIn, 0),
    createdAt: value.createdAt,
  };
}
