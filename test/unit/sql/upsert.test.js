import { describe, it } from 'vitest';
import Support from '../support.js';
import DataTypes from '../../../lib/data-types.js';

const expectsql = Support.expectsql;
const current = Support.sequelize;
const sql = current.dialect.QueryGenerator;

// Notice: [] will be replaced by dialect specific tick/quote character when there is not dialect specific expectation but only a default expectation

describe(Support.getTestDialectTeaser('SQL'), () => {
  describe('upsert', () => {
    const User = Support.sequelize.define(
      'user',
      {
        username: {
          type: DataTypes.STRING,
          field: 'user_name'
        }
      },
      { timestamps: false }
    );

    it('assigns the updated columns from EXCLUDED', () => {
      expectsql(
        sql.upsertQuery(User.tableName, { user_name: 'john' }, { user_name: 'jane' }, User, {
          returning: false,
          upsertKeys: ['id']
        }),
        {
          postgres:
            'INSERT INTO "users" ("user_name") VALUES (\'john\') ON CONFLICT ("id") ' +
            'DO UPDATE SET "user_name"=EXCLUDED."user_name" RETURNING (xmax = 0) AS "_sequelize_upsert_created";'
        }
      );
    });

    // Without a RETURNING clause there is no row to read `xmax` off, so the created flag is
    // requested unconditionally -- `returning` only controls whether the model's own columns
    // ride along with it.
    it('returns the created flag even when returning is not requested', () => {
      expectsql(
        sql.upsertQuery(User.tableName, { user_name: 'john' }, { user_name: 'jane' }, User, {
          returning: true,
          upsertKeys: ['id']
        }),
        {
          postgres:
            'INSERT INTO "users" ("user_name") VALUES (\'john\') ON CONFLICT ("id") ' +
            'DO UPDATE SET "user_name"=EXCLUDED."user_name" ' +
            'RETURNING "id","user_name",(xmax = 0) AS "_sequelize_upsert_created";'
        }
      );
    });

    it('targets a composite conflict key', () => {
      expectsql(
        sql.upsertQuery(User.tableName, { user_name: 'john' }, { user_name: 'jane' }, User, {
          returning: false,
          upsertKeys: ['user_name', 'id']
        }),
        {
          postgres:
            'INSERT INTO "users" ("user_name") VALUES (\'john\') ON CONFLICT ("user_name","id") ' +
            'DO UPDATE SET "user_name"=EXCLUDED."user_name" RETURNING (xmax = 0) AS "_sequelize_upsert_created";'
        }
      );
    });

    // A partial unique index is only usable as an arbiter if the statement repeats its predicate,
    // so `conflictWhere` is spliced in between the conflict target and the DO UPDATE.
    it('narrows the conflict target with conflictWhere', () => {
      expectsql(
        sql.upsertQuery(User.tableName, { user_name: 'john' }, { user_name: 'jane' }, User, {
          returning: false,
          upsertKeys: ['user_name'],
          conflictWhere: { deletedAt: null }
        }),
        {
          postgres:
            'INSERT INTO "users" ("user_name") VALUES (\'john\') ON CONFLICT ("user_name") WHERE "deletedAt" IS NULL ' +
            'DO UPDATE SET "user_name"=EXCLUDED."user_name" RETURNING (xmax = 0) AS "_sequelize_upsert_created";'
        }
      );
    });

    // Every supplied column is part of the conflict target, so there is nothing to assign from
    // EXCLUDED. `DO NOTHING` would suppress the RETURNING row and lose the created flag with it.
    it('self-assigns the conflict target when there is nothing else to update', () => {
      expectsql(
        sql.upsertQuery(User.tableName, { user_name: 'john' }, {}, User, {
          returning: false,
          upsertKeys: ['user_name']
        }),
        {
          postgres:
            'INSERT INTO "users" ("user_name") VALUES (\'john\') ON CONFLICT ("user_name") ' +
            'DO UPDATE SET "user_name"=EXCLUDED."user_name" RETURNING (xmax = 0) AS "_sequelize_upsert_created";'
        }
      );
    });

    it('uses the column a custom primary key is stored under', () => {
      const CustomUser = Support.sequelize.define(
        'customUser',
        {
          userId: {
            type: DataTypes.INTEGER,
            field: 'user_id',
            primaryKey: true,
            autoIncrement: true
          },
          username: {
            type: DataTypes.STRING,
            field: 'user_name'
          }
        },
        { timestamps: false, tableName: 'users' }
      );

      expectsql(
        sql.upsertQuery(CustomUser.tableName, { user_name: 'john' }, { user_name: 'jane' }, CustomUser, {
          returning: true,
          upsertKeys: ['user_id']
        }),
        {
          postgres:
            'INSERT INTO "users" ("user_name") VALUES (\'john\') ON CONFLICT ("user_id") ' +
            'DO UPDATE SET "user_name"=EXCLUDED."user_name" ' +
            'RETURNING "user_id","user_name",(xmax = 0) AS "_sequelize_upsert_created";'
        }
      );
    });
  });
});
