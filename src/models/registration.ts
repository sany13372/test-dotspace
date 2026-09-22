import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  Sequelize,
} from 'sequelize';

export class Registration extends Model<
  InferAttributes<Registration>,
  InferCreationAttributes<Registration>
> {
  declare id: CreationOptional<string>;
  declare eventId: string;
  declare userId: string;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

export function initRegistration(sequelize: Sequelize): void {
  Registration.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      eventId: {
        type: DataTypes.UUID,
        allowNull: false,
        field: 'event_id',
      },
      userId: {
        type: DataTypes.UUID,
        allowNull: false,
        field: 'user_id',
      },
      createdAt: DataTypes.DATE,
      updatedAt: DataTypes.DATE,
    },
    {
      sequelize,
      tableName: 'registrations',
      underscored: true,
    },
  );
}
