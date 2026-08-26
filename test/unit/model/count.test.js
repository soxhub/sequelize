import { describe, it, beforeAll, afterAll, beforeEach, expect } from 'vitest';
import Support from '../support.js';
import sinon from 'sinon';
import DataTypes from '../../../lib/data-types.js';

const current = Support.sequelize;

describe(Support.getTestDialectTeaser('Model'), () => {
  describe('method count', () => {
    let oldFindAll, oldAggregate, User, Project, aggregateStub;

    beforeAll(() => {
      oldFindAll = current.Model.findAll;
      oldAggregate = current.Model.aggregate;

      current.Model.findAll = sinon.stub().returns(Promise.resolve());

      User = current.define('User', {
        username: DataTypes.STRING,
        age: DataTypes.INTEGER
      });
      Project = current.define('Project', {
        name: DataTypes.STRING
      });

      User.hasMany(Project);
      Project.belongsTo(User);
    });

    afterAll(() => {
      current.Model.findAll = oldFindAll;
      current.Model.aggregate = oldAggregate;
    });

    beforeEach(() => {
      aggregateStub = current.Model.aggregate = sinon.stub().returns(Promise.resolve());
    });

    describe('should pass the same options to model.aggregate as findAndCount', () => {
      it('with includes', async () => {
        const queryObject = {
          include: [Project]
        };
        await User.count(queryObject);
        await User.findAndCountAll(queryObject);

        const count = aggregateStub.getCall(0).args;
        const findAndCount = aggregateStub.getCall(1).args;
        expect(count).to.eql(findAndCount);
      });

      it('attributes should be stripped in case of findAndCount', async () => {
        const queryObject = {
          attributes: ['username']
        };
        await User.count(queryObject);
        await User.findAndCountAll(queryObject);

        const count = aggregateStub.getCall(0).args;
        const findAndCount = aggregateStub.getCall(1).args;
        expect(count).not.to.eql(findAndCount);
        count[2].attributes = undefined;
        expect(count).to.eql(findAndCount);
      });
    });
  });
});
