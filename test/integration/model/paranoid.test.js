import Support from '../support.js';
import DataTypes from '../../../lib/data-types.js';
import { expect } from 'chai';
import sinon from 'sinon';

const current = Support.sequelize;

describe(Support.getTestDialectTeaser('Model'), () => {
  describe('paranoid', () => {
    before(function () {
      this.clock = sinon.useFakeTimers();
    });

    after(function () {
      this.clock.restore();
    });

    it('should be able to soft delete with timestamps', async function () {
      const Account = this.sequelize.define(
        'Account',
        {
          ownerId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            field: 'owner_id'
          },
          name: {
            type: DataTypes.STRING
          }
        },
        {
          paranoid: true,
          timestamps: true
        }
      );

      await Account.sync({ force: true });
      await Account.create({ ownerId: 12 });

      expect(await Account.count()).to.be.equal(1);

      const result = await Account.destroy({ where: { ownerId: 12 } });
      expect(result).to.be.equal(1);

      expect(await Account.count()).to.be.equal(0);
      expect(await Account.count({ paranoid: false })).to.be.equal(1);

      await Account.restore({ where: { ownerId: 12 } });

      expect(await Account.count()).to.be.equal(1);
    });

    it('should be able to soft delete without timestamps', async function () {
      const Account = this.sequelize.define(
        'Account',
        {
          ownerId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            field: 'owner_id'
          },
          name: {
            type: DataTypes.STRING
          },
          deletedAt: {
            type: DataTypes.DATE,
            allowNull: true,
            field: 'deleted_at'
          }
        },
        {
          paranoid: true,
          timestamps: true,
          deletedAt: 'deletedAt',
          createdAt: false,
          updatedAt: false
        }
      );

      await Account.sync({ force: true });
      await Account.create({ ownerId: 12 });

      expect(await Account.count()).to.be.equal(1);

      await Account.destroy({ where: { ownerId: 12 } });

      expect(await Account.count()).to.be.equal(0);
      expect(await Account.count({ paranoid: false })).to.be.equal(1);

      await Account.restore({ where: { ownerId: 12 } });

      expect(await Account.count()).to.be.equal(1);
    });

    if (current.dialect.supports.JSON) {
      describe('JSON', () => {
        before(function () {
          this.Model = this.sequelize.define(
            'Model',
            {
              name: {
                type: DataTypes.STRING
              },
              data: {
                type: DataTypes.JSON
              },
              deletedAt: {
                type: DataTypes.DATE,
                allowNull: true,
                field: 'deleted_at'
              }
            },
            {
              paranoid: true,
              timestamps: true,
              deletedAt: 'deletedAt'
            }
          );
        });

        beforeEach(function () {
          return this.Model.sync({ force: true });
        });

        it('should soft delete with JSON condition', async function () {
          await this.Model.bulkCreate([
            {
              name: 'One',
              data: {
                field: {
                  deep: true
                }
              }
            },
            {
              name: 'Two',
              data: {
                field: {
                  deep: false
                }
              }
            }
          ]);

          await this.Model.destroy({
            where: {
              data: {
                field: {
                  deep: true
                }
              }
            }
          });

          const records = await this.Model.findAll();
          expect(records.length).to.equal(1);
          expect(records[0].get('name')).to.equal('Two');
        });
      });
    }
  });
});
