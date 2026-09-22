import { DataTypes, Op, QueryInterface, Sequelize } from 'sequelize';

interface MigrationContext {
  context: QueryInterface;
}

export async function up({ context: queryInterface }: MigrationContext) {
  await queryInterface.createTable('users', {
    id: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING(120),
      allowNull: false,
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
    },
    updated_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
    },
  });

  await queryInterface.createTable('events', {
    id: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true,
    },
    title: {
      type: DataTypes.STRING(180),
      allowNull: false,
    },
    capacity: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM('OPEN', 'CANCELLED'),
      allowNull: false,
      defaultValue: 'OPEN',
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
    },
    updated_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
    },
  });

  await queryInterface.addConstraint('events', {
    fields: ['capacity'],
    type: 'check',
    where: { capacity: { [Op.gte]: 1 } },
    name: 'events_capacity_positive',
  });

  await queryInterface.createTable('registrations', {
    id: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true,
    },
    event_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'events', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    },
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'users', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
    },
    updated_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
    },
  });

  // There are useful indexes here, but no database invariant for an event/user pair.
  await queryInterface.addIndex('registrations', ['event_id'], {
    name: 'registrations_event_id_idx',
  });
  await queryInterface.addIndex('registrations', ['user_id'], {
    name: 'registrations_user_id_idx',
  });
}

export async function down({ context: queryInterface }: MigrationContext) {
  await queryInterface.dropTable('registrations');
  await queryInterface.dropTable('events');
  await queryInterface.dropTable('users');
  await queryInterface.sequelize.query(
    'DROP TYPE IF EXISTS "enum_events_status";',
  );
}
