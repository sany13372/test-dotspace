import { sequelize } from '../config/database';
import { Event, initEvent } from './event';
import { initRegistration, Registration } from './registration';
import { initUser, User } from './user';

initUser(sequelize);
initEvent(sequelize);
initRegistration(sequelize);

Event.hasMany(Registration, {
  foreignKey: 'eventId',
  as: 'registrations',
});
Registration.belongsTo(Event, {
  foreignKey: 'eventId',
  as: 'event',
});

User.hasMany(Registration, {
  foreignKey: 'userId',
  as: 'registrations',
});
Registration.belongsTo(User, {
  foreignKey: 'userId',
  as: 'user',
});

export { Event, Registration, sequelize, User };
