import { describe, it, before, after, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import Support from '../support.js';
import sinon from 'sinon';
import DataTypes from '../../../lib/data-types.js';
import * as Utils from '../../../lib/utils.js';
import * as sequelizeErrors from '../../../lib/errors.js';

const current = Support.sequelize;

describe(Support.getTestDialectTeaser('Model'), () => {
  describe('warnOnInvalidOptions', () => {
    let loggerSpy;

    beforeEach(() => {
      // A stub rather than a spy: the warning is the assertion target, so there
      // is no reason to let it through into the reporter output as well.
      loggerSpy = sinon.stub(Utils.getLogger(), 'warn');
    });

    afterEach(() => {
      loggerSpy.restore();
    });

    it('Warns the user if they use a model attribute without a where clause', () => {
      const User = current.define('User', { firstName: 'string' });
      User.warnOnInvalidOptions({ firstName: 12, order: [] }, ['firstName']);
      const expectedError =
        'Model attributes (firstName) passed into finder method options of model User, but the options.where object is empty. Did you forget to use options.where?';
      expect(loggerSpy.calledWith(expectedError)).to.equal(true);
    });

    it('Does not warn the user if they use a model attribute without a where clause that shares its name with a query option', () => {
      const User = current.define('User', { order: 'string' });
      User.warnOnInvalidOptions({ order: [] }, ['order']);
      expect(loggerSpy.called).to.equal(false);
    });

    it('Does not warn the user if they use valid query options', () => {
      const User = current.define('User', { order: 'string' });
      User.warnOnInvalidOptions({ where: { order: 1 }, order: [] });
      expect(loggerSpy.called).to.equal(false);
    });
  });

  describe('method findAll', () => {
    const Model = current.define(
      'model',
      {
        name: DataTypes.STRING
      },
      { timestamps: false }
    );

    let selectStub, warnOnInvalidOptionsStub;

    before(() => {
      selectStub = sinon.stub(current.getQueryInterface(), 'select').callsFake(() => {
        return Model.build({});
      });
      warnOnInvalidOptionsStub = sinon.stub(Model, 'warnOnInvalidOptions');
    });

    beforeEach(() => {
      selectStub.resetHistory();
      warnOnInvalidOptionsStub.resetHistory();
    });

    after(() => {
      selectStub.restore();
      warnOnInvalidOptionsStub.restore();
    });

    describe('handles input validation', () => {
      it('calls warnOnInvalidOptions', () => {
        Model.findAll();
        expect(warnOnInvalidOptionsStub.calledOnce).to.equal(true);
      });

      it('Throws an error when the attributes option is formatted incorrectly', () => {
        return expect(Model.findAll({ attributes: 'name' })).to.be.rejectedWith(sequelizeErrors.QueryError);
      });
    });

    describe('attributes include / exclude', () => {
      it('allows me to include additional attributes', async () => {
        await Model.findAll({
          attributes: {
            include: ['foobar']
          }
        });

        expect(selectStub.getCall(0).args[2].attributes).to.deep.equal(['id', 'name', 'foobar']);
      });

      it('allows me to exclude attributes', async () => {
        await Model.findAll({
          attributes: {
            exclude: ['name']
          }
        });

        expect(selectStub.getCall(0).args[2].attributes).to.deep.equal(['id']);
      });

      it('include takes precendence over exclude', async () => {
        await Model.findAll({
          attributes: {
            exclude: ['name'],
            include: ['name']
          }
        });

        expect(selectStub.getCall(0).args[2].attributes).to.deep.equal(['id', 'name']);
      });

      it('works for models without PK #4607', async () => {
        const PklessModel = current.define('model', {}, { timestamps: false });
        const Foo = current.define('foo');
        PklessModel.hasOne(Foo);

        PklessModel.removeAttribute('id');

        await PklessModel.findAll({
          attributes: {
            include: ['name']
          },
          include: [Foo]
        });

        expect(selectStub.getCall(0).args[2].attributes).to.deep.equal(['name']);
      });
    });
  });
});
