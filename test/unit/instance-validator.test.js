import { describe, it, beforeEach } from 'vitest';
import { ValidationError as SequelizeValidationError } from '../../lib/errors.js';
import { expect } from 'chai';
import Support from './support.js';
import InstanceValidator from '../../lib/instance-validator.js';
import sinon from 'sinon';

describe(Support.getTestDialectTeaser('InstanceValidator'), () => {
  let User;

  beforeEach(() => {
    User = Support.sequelize.define('user', {
      fails: {
        type: Support.Sequelize.BOOLEAN,
        validate: {
          isNotTrue(value) {
            if (value) {
              throw Error('Manual model validation failure');
            }
          }
        }
      }
    });
  });

  it('configures itself to run hooks by default', () => {
    const instanceValidator = new InstanceValidator();
    expect(instanceValidator.options.hooks).to.equal(true);
  });

  describe('validate', () => {
    it('runs the validation sequence and hooks when the hooks option is true', () => {
      const instanceValidator = new InstanceValidator(User.build(), { hooks: true });
      const _validate = sinon.spy(instanceValidator, '_validate');
      const _validateAndRunHooks = sinon.spy(instanceValidator, '_validateAndRunHooks');

      instanceValidator.validate();

      expect(_validateAndRunHooks.calledOnce).to.be.true;
      expect(_validate.called, '_validate should not have been called').to.be.false;
    });

    it('runs the validation sequence but skips hooks if the hooks option is false', () => {
      const instanceValidator = new InstanceValidator(User.build(), { hooks: false });
      const _validate = sinon.spy(instanceValidator, '_validate');
      const _validateAndRunHooks = sinon.spy(instanceValidator, '_validateAndRunHooks');

      instanceValidator.validate();

      expect(_validate.calledOnce).to.be.true;
      expect(_validateAndRunHooks.called, '_validateAndRunHooks should not have been called').to.be.false;
    });

    it('fulfills when validation is successful', () => {
      const instanceValidator = new InstanceValidator(User.build());
      const result = instanceValidator.validate();

      return expect(result).to.be.fulfilled;
    });

    it('rejects with a validation error when validation fails', () => {
      const instanceValidator = new InstanceValidator(User.build({ fails: true }));
      const result = instanceValidator.validate();

      return expect(result).to.be.rejectedWith(SequelizeValidationError);
    });

    it('has a useful default error message for not null validation failures', () => {
      const NotNullUser = Support.sequelize.define('user', {
        name: {
          type: Support.Sequelize.STRING,
          allowNull: false
        }
      });

      const instanceValidator = new InstanceValidator(NotNullUser.build());
      const result = instanceValidator.validate();

      return expect(result).to.be.rejectedWith(SequelizeValidationError, /user\.name cannot be null/);
    });
  });

  describe('_validateAndRunHooks', () => {
    let successfulInstanceValidator;

    beforeEach(() => {
      successfulInstanceValidator = new InstanceValidator(User.build());
      sinon.stub(successfulInstanceValidator, '_validate').returns(Promise.resolve());
    });

    it('should run beforeValidate and afterValidate hooks when _validate is successful', async () => {
      const beforeValidate = sinon.spy();
      const afterValidate = sinon.spy();
      User.beforeValidate(beforeValidate);
      User.afterValidate(afterValidate);

      await expect(successfulInstanceValidator._validateAndRunHooks()).to.be.fulfilled;
      expect(beforeValidate.calledOnce).to.be.true;
      expect(afterValidate.calledOnce).to.be.true;
    });

    it('should run beforeValidate hook but not afterValidate hook when _validate is unsuccessful', async () => {
      const failingInstanceValidator = new InstanceValidator(User.build());
      sinon.stub(failingInstanceValidator, '_validate').callsFake(() => {
        return Promise.reject(new Error('validation failed'));
      });
      const beforeValidate = sinon.spy();
      const afterValidate = sinon.spy();
      User.beforeValidate(beforeValidate);
      User.afterValidate(afterValidate);

      await expect(failingInstanceValidator._validateAndRunHooks()).to.be.rejected;
      expect(beforeValidate.calledOnce).to.be.true;
      expect(afterValidate.called, 'afterValidate should not have been called').to.be.false;
    });

    it('should emit an error from after hook when afterValidate fails', () => {
      User.afterValidate(() => {
        throw new Error('after validation error');
      });

      return expect(successfulInstanceValidator._validateAndRunHooks()).to.be.rejectedWith('after validation error');
    });

    describe('validatedFailed hook', () => {
      it('should call validationFailed hook when validation fails', async () => {
        const failingInstanceValidator = new InstanceValidator(User.build());
        sinon.stub(failingInstanceValidator, '_validate').callsFake(() => {
          return Promise.reject(new Error('validation failed'));
        });
        const validationFailedHook = sinon.spy();
        User.validationFailed(validationFailedHook);

        await expect(failingInstanceValidator._validateAndRunHooks()).to.be.rejected;
        expect(validationFailedHook.calledOnce).to.be.true;
      });

      it('should not replace the validation error in validationFailed hook by default', async () => {
        const failingInstanceValidator = new InstanceValidator(User.build());
        sinon.stub(failingInstanceValidator, '_validate').callsFake(() => {
          return Promise.reject(new SequelizeValidationError());
        });
        const validationFailedHook = sinon.stub().returns(Promise.resolve());
        User.validationFailed(validationFailedHook);

        const err = await expect(failingInstanceValidator._validateAndRunHooks()).to.be.rejected;
        expect(err.name).to.equal('SequelizeValidationError');
      });

      it('should replace the validation error if validationFailed hook creates a new error', async () => {
        const failingInstanceValidator = new InstanceValidator(User.build());
        sinon.stub(failingInstanceValidator, '_validate').callsFake(() => {
          return Promise.reject(new SequelizeValidationError());
        });
        const validationFailedHook = sinon.stub().throws(new Error('validation failed hook error'));
        User.validationFailed(validationFailedHook);

        const err = await expect(failingInstanceValidator._validateAndRunHooks()).to.be.rejected;
        expect(err.message).to.equal('validation failed hook error');
      });
    });
  });
});
