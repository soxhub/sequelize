import { describe, it, beforeAll, beforeEach, afterEach, expect } from 'vitest';
import Support from '../support.js';
import sinon from 'sinon';
import DataTypes from '../../../lib/data-types.js';

const current = Support.sequelize;

describe(Support.getTestDialectTeaser('Model'), () => {
  if (current.dialect.supports.upserts) {
    describe('method upsert', () => {
      let User, UserNoTime, sandbox, upsertStub;

      beforeAll(() => {
        User = current.define('User', {
          name: DataTypes.STRING,
          virtualValue: {
            type: DataTypes.VIRTUAL,
            set(val) {
              return (this.value = val);
            },
            get() {
              return this.value;
            }
          },
          value: DataTypes.STRING,
          secretValue: {
            type: DataTypes.INTEGER,
            allowNull: false
          },
          createdAt: {
            type: DataTypes.DATE,
            field: 'created_at'
          }
        });

        UserNoTime = current.define(
          'UserNoTime',
          {
            name: DataTypes.STRING
          },
          {
            timestamps: false
          }
        );
      });

      beforeEach(() => {
        sandbox = sinon.createSandbox();

        sandbox.stub(current, 'query').returns(Promise.resolve());
        upsertStub = sandbox.stub(current.getQueryInterface(), 'upsert').returns(Promise.resolve([true, undefined]));
      });

      afterEach(() => {
        sandbox.restore();
      });

      it('skip validations for missing fields', async () => {
        // Resolving at all is the assertion: a validation on the missing fields would reject.
        await expect(
          User.upsert({
            name: 'Grumpy Cat'
          })
        ).resolves.toBeDefined();
      });

      it('creates new record with correct field names', async () => {
        await User.upsert({
          name: 'Young Cat',
          virtualValue: 999
        });

        expect(Object.keys(upsertStub.getCall(0).args[1])).to.deep.equal(['name', 'value', 'created_at', 'updatedAt']);
      });

      it('creates new record with timestamps disabled', async () => {
        await UserNoTime.upsert({
          name: 'Young Cat'
        });

        expect(Object.keys(upsertStub.getCall(0).args[1])).to.deep.equal(['name']);
      });

      it('updates all changed fields by default', async () => {
        await User.upsert({
          name: 'Old Cat',
          virtualValue: 111
        });

        expect(Object.keys(upsertStub.getCall(0).args[2])).to.deep.equal(['name', 'value', 'updatedAt']);
      });
    });
  }
});
