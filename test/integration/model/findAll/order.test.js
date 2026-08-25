import { describe, it, beforeEach } from 'vitest';
import { expect } from 'chai';
import Support from '../../support.js';
import DataTypes from '../../../../lib/data-types.js';

const current = Support.sequelize;

describe(Support.getTestDialectTeaser('Model'), () => {
  describe('findAll', () => {
    describe('order', () => {
      describe('Sequelize.literal()', () => {
        let User;

        beforeEach(async () => {
          User = current.define('User', {
            email: DataTypes.STRING
          });

          await User.sync({ force: true });
          await User.create({
            email: 'test@sequelizejs.com'
          });
        });

        it('should work with order: literal()', async () => {
          const users = await User.findAll({
            order: current.literal('email = ' + current.escape('test@sequelizejs.com'))
          });

          expect(users.length).to.equal(1);
          users.forEach((user) => {
            expect(user.get('email')).to.be.ok;
          });
        });

        it('should work with order: [literal()]', async () => {
          const users = await User.findAll({
            order: [current.literal('email = ' + current.escape('test@sequelizejs.com'))]
          });

          expect(users.length).to.equal(1);
          users.forEach((user) => {
            expect(user.get('email')).to.be.ok;
          });
        });

        it('should work with order: [[literal()]]', async () => {
          const users = await User.findAll({
            order: [[current.literal('email = ' + current.escape('test@sequelizejs.com'))]]
          });

          expect(users.length).to.equal(1);
          users.forEach((user) => {
            expect(user.get('email')).to.be.ok;
          });
        });
      });

      describe('injections', () => {
        let User, Group;

        beforeEach(() => {
          User = current.define('user', {
            name: DataTypes.STRING
          });
          Group = current.define('group', {});
          User.belongsTo(Group);
          return current.sync({ force: true });
        });

        if (current.dialect.supports['ORDER NULLS']) {
          it('should not throw with on NULLS LAST/NULLS FIRST', () => {
            return User.findAll({
              include: [Group],
              order: [
                ['id', 'ASC NULLS LAST'],
                [Group, 'id', 'DESC NULLS FIRST']
              ]
            });
          });
        }

        it('should not throw on a literal', () => {
          return User.findAll({
            order: [['id', current.literal('ASC, name DESC')]]
          });
        });

        it('should not throw with include when last order argument is a field', () => {
          return User.findAll({
            include: [Group],
            order: [[Group, 'id']]
          });
        });
      });
    });
  });
});
