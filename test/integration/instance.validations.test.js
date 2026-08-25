import { describe, it, beforeEach } from 'vitest';
import { expect } from 'chai';
import Sequelize from '../../index.js';
import Support from './support.js';
import config from '../config/config.js';

const current = Support.sequelize;

describe(Support.getTestDialectTeaser('InstanceValidator'), () => {
  describe('#update', () => {
    it('should allow us to update specific columns without tripping the validations', async () => {
      const User = current.define('model', {
        username: Sequelize.STRING,
        email: {
          type: Sequelize.STRING,
          allowNull: false,
          validate: {
            isEmail: {
              msg: 'You must enter a valid email address'
            }
          }
        }
      });

      await User.sync({ force: true });

      const user = await User.create({ username: 'bob', email: 'hello@world.com' });
      await User.update({ username: 'toni' }, { where: { id: user.id } });

      const updatedUser = await User.findByPk(1);
      expect(updatedUser.username).to.equal('toni');
    });

    it('should be able to emit an error upon updating when a validation has failed from an instance', async () => {
      const Model = current.define('model', {
        name: {
          type: Sequelize.STRING,
          allowNull: false,
          validate: {
            notEmpty: true // don't allow empty strings
          }
        }
      });

      await Model.sync({ force: true });

      const model = await Model.create({ name: 'World' });

      const err = await expect(model.update({ name: '' })).to.be.rejected;
      expect(err).to.be.an.instanceOf(Error);
      expect(err.get('name')[0].message).to.equal('Validation notEmpty on name failed');
    });

    it('should be able to emit an error upon updating when a validation has failed from the factory', async () => {
      const Model = current.define('model', {
        name: {
          type: Sequelize.STRING,
          allowNull: false,
          validate: {
            notEmpty: true // don't allow empty strings
          }
        }
      });

      await Model.sync({ force: true });
      await Model.create({ name: 'World' });

      const err = await expect(Model.update({ name: '' }, { where: { id: 1 } })).to.be.rejected;
      expect(err).to.be.an.instanceOf(Error);
      expect(err.get('name')[0].message).to.equal('Validation notEmpty on name failed');
    });

    it('should enforce a unique constraint', async () => {
      const Model = current.define('model', {
        uniqueName: { type: Sequelize.STRING, unique: 'uniqueName' }
      });
      const records = [{ uniqueName: 'unique name one' }, { uniqueName: 'unique name two' }];
      await Model.sync({ force: true });

      const first = await Model.create(records[0]);
      expect(first).to.be.ok;

      const second = await Model.create(records[1]);
      expect(second).to.be.ok;

      const err = await expect(Model.update(records[0], { where: { id: second.id } })).to.be.rejected;
      expect(err).to.be.an.instanceOf(Error);
      expect(err.errors).to.have.length(1);
      expect(err.errors[0].path).to.include('uniqueName');
      expect(err.errors[0].message).to.include('must be unique');
    });

    it('should allow a custom unique constraint error message', async () => {
      const Model = current.define('model', {
        uniqueName: {
          type: Sequelize.STRING,
          unique: { msg: 'custom unique error message' }
        }
      });
      const records = [{ uniqueName: 'unique name one' }, { uniqueName: 'unique name two' }];
      await Model.sync({ force: true });

      const first = await Model.create(records[0]);
      expect(first).to.be.ok;

      const second = await Model.create(records[1]);
      expect(second).to.be.ok;

      const err = await expect(Model.update(records[0], { where: { id: second.id } })).to.be.rejected;
      expect(err).to.be.an.instanceOf(Error);
      expect(err.errors).to.have.length(1);
      expect(err.errors[0].path).to.include('uniqueName');
      expect(err.errors[0].message).to.equal('custom unique error message');
    });

    it('should handle multiple unique messages correctly', async () => {
      const Model = current.define('model', {
        uniqueName1: {
          type: Sequelize.STRING,
          unique: { msg: 'custom unique error message 1' }
        },
        uniqueName2: {
          type: Sequelize.STRING,
          unique: { msg: 'custom unique error message 2' }
        }
      });
      const records = [
        { uniqueName1: 'unique name one', uniqueName2: 'unique name one' },
        { uniqueName1: 'unique name one', uniqueName2: 'this is ok' },
        { uniqueName1: 'this is ok', uniqueName2: 'unique name one' }
      ];
      await Model.sync({ force: true });

      const first = await Model.create(records[0]);
      expect(first).to.be.ok;

      const err1 = await expect(Model.create(records[1])).to.be.rejected;
      expect(err1).to.be.an.instanceOf(Error);
      expect(err1.errors).to.have.length(1);
      expect(err1.errors[0].path).to.include('uniqueName1');
      expect(err1.errors[0].message).to.equal('custom unique error message 1');

      const err2 = await expect(Model.create(records[2])).to.be.rejected;
      expect(err2).to.be.an.instanceOf(Error);
      expect(err2.errors).to.have.length(1);
      expect(err2.errors[0].path).to.include('uniqueName2');
      expect(err2.errors[0].message).to.equal('custom unique error message 2');
    });
  });

  describe('#create', () => {
    describe('generic', () => {
      let Project, Task;

      beforeEach(async () => {
        Project = current.define('Project', {
          name: {
            type: Sequelize.STRING,
            allowNull: false,
            defaultValue: 'unknown',
            validate: {
              isIn: [['unknown', 'hello', 'test']]
            }
          }
        });

        Task = current.define('Task', {
          something: Sequelize.INTEGER
        });

        Project.hasOne(Task);
        Task.belongsTo(Project);

        await current.sync({ force: true });
      });

      it('correctly throws an error using create method ', async () => {
        const err = await expect(Project.create({ name: 'nope' })).to.be.rejected;
        expect(err).to.have.ownProperty('name');
      });

      it('correctly validates using create method ', async () => {
        const project = await Project.create({});
        const task = await Task.create({ something: 1 });

        const associatedTask = await project.setTask(task);
        expect(associatedTask.ProjectId).to.not.be.null;

        const associatedProject = await associatedTask.setProject(project);
        expect(associatedProject.ProjectId).to.not.be.null;
      });
    });

    describe('explicitly validating primary/auto incremented columns', () => {
      it('should emit an error when we try to enter in a string for the id key without validation arguments', async () => {
        const User = current.define('UserId', {
          id: {
            type: Sequelize.INTEGER,
            autoIncrement: true,
            primaryKey: true,
            validate: {
              isInt: true
            }
          }
        });

        await User.sync({ force: true });

        const err = await expect(User.create({ id: 'helloworld' })).to.be.rejected;
        expect(err).to.be.an.instanceOf(Error);
        expect(err.get('id')[0].message).to.equal('Validation isInt on id failed');
      });

      it('should emit an error when we try to enter in a string for an auto increment key (not named id)', async () => {
        const User = current.define('UserId', {
          username: {
            type: Sequelize.INTEGER,
            autoIncrement: true,
            primaryKey: true,
            validate: {
              isInt: { args: true, msg: 'Username must be an integer!' }
            }
          }
        });

        await User.sync({ force: true });

        const err = await expect(User.create({ username: 'helloworldhelloworld' })).to.be.rejected;
        expect(err).to.be.an.instanceOf(Error);
        expect(err.get('username')[0].message).to.equal('Username must be an integer!');
      });

      describe("primaryKey with the name as id with arguments for it's validatio", () => {
        let User;

        beforeEach(async () => {
          User = current.define('UserId', {
            id: {
              type: Sequelize.INTEGER,
              autoIncrement: true,
              primaryKey: true,
              validate: {
                isInt: { args: true, msg: 'ID must be an integer!' }
              }
            }
          });

          await User.sync({ force: true });
        });

        it('should emit an error when we try to enter in a string for the id key with validation arguments', async () => {
          const err = await expect(User.create({ id: 'helloworld' })).to.be.rejected;
          expect(err).to.be.an.instanceOf(Error);
          expect(err.get('id')[0].message).to.equal('ID must be an integer!');
        });

        it('should emit an error when we try to enter in a string for an auto increment key through .build().validate()', async () => {
          const user = User.build({ id: 'helloworld' });

          const err = await expect(user.validate()).to.be.rejected;
          expect(err.get('id')[0].message).to.equal('ID must be an integer!');
        });

        it('should emit an error when we try to .save()', async () => {
          const user = User.build({ id: 'helloworld' });

          const err = await expect(user.save()).to.be.rejected;
          expect(err).to.be.an.instanceOf(Error);
          expect(err.get('id')[0].message).to.equal('ID must be an integer!');
        });
      });
    });

    describe('pass all paths when validating', () => {
      let Project, Task;

      beforeEach(async () => {
        Project = current.define('Project', {
          name: {
            type: Sequelize.STRING,
            allowNull: false,
            validate: {
              isIn: [['unknown', 'hello', 'test']]
            }
          },
          creatorName: {
            type: Sequelize.STRING,
            allowNull: false
          },
          cost: {
            type: Sequelize.INTEGER,
            allowNull: false
          }
        });

        Task = current.define('Task', {
          something: Sequelize.INTEGER
        });

        Project.hasOne(Task);
        Task.belongsTo(Project);

        await Project.sync({ force: true });
        await Task.sync({ force: true });
      });

      it('produce 3 errors', async () => {
        const err = await expect(Project.create({})).to.be.rejected;
        expect(err).to.be.an.instanceOf(Error);
        delete err.stack; // longStackTraces
        expect(err.errors).to.have.length(3);
      });
    });

    describe('not null schema validation', () => {
      let Project;

      beforeEach(async () => {
        Project = current.define('Project', {
          name: {
            type: Sequelize.STRING,
            allowNull: false,
            validate: {
              isIn: [['unknown', 'hello', 'test']] // important to be
            }
          }
        });

        await current.sync({ force: true });
      });

      it('correctly throws an error using create method ', async () => {
        await expect(Project.create({})).to.be.rejected;
      });

      it('correctly throws an error using create method with default generated messages', async () => {
        const err = await expect(Project.create({})).to.be.rejected;
        expect(err).to.have.property('name', 'SequelizeValidationError');
        expect(err.message).equal('notNull Violation: Project.name cannot be null');
        expect(err.errors).to.be.an('array').and.have.length(1);
        expect(err.errors[0]).to.have.property('message', 'Project.name cannot be null');
      });
    });
  });

  it('correctly validates using custom validation methods', async () => {
    const User = current.define('User' + config.rand(), {
      name: {
        type: Sequelize.STRING,
        validate: {
          customFn(val, next) {
            if (val !== '2') {
              next("name should equal '2'");
            } else {
              next();
            }
          }
        }
      }
    });

    const failingUser = User.build({ name: '3' });

    const error = await expect(failingUser.validate()).to.be.rejected;
    expect(error).to.be.an.instanceOf(Error);
    expect(error.get('name')[0].message).to.equal("name should equal '2'");

    const successfulUser = User.build({ name: '2' });
    await expect(successfulUser.validate()).not.to.be.rejected;
  });

  it('supports promises with custom validation methods', async () => {
    const User = current.define('User' + config.rand(), {
      name: {
        type: Sequelize.STRING,
        validate: {
          async customFn(val) {
            await User.findAll();

            if (val === 'error') {
              throw new Error('Invalid username');
            }
          }
        }
      }
    });

    await User.sync();

    const error = await expect(User.build({ name: 'error' }).validate()).to.be.rejected;
    expect(error).to.be.instanceof(current.ValidationError);
    expect(error.get('name')[0].message).to.equal('Invalid username');

    await expect(User.build({ name: 'no error' }).validate()).not.to.be.rejected;
  });

  it('skips other validations if allowNull is true and the value is null', async () => {
    const User = current.define('User' + config.rand(), {
      age: {
        type: Sequelize.INTEGER,
        allowNull: true,
        validate: {
          min: { args: 0, msg: 'must be positive' }
        }
      }
    });

    const error = await expect(User.build({ age: -1 }).validate()).to.be.rejected;
    expect(error.get('age')[0].message).to.equal('must be positive');
  });

  it('validates a model with custom model-wide validation methods', async () => {
    const Foo = current.define(
      'Foo' + config.rand(),
      {
        field1: {
          type: Sequelize.INTEGER,
          allowNull: true
        },
        field2: {
          type: Sequelize.INTEGER,
          allowNull: true
        }
      },
      {
        validate: {
          xnor() {
            if ((this.field1 === null) === (this.field2 === null)) {
              throw new Error('xnor failed');
            }
          }
        }
      }
    );

    const error = await expect(Foo.build({ field1: null, field2: null }).validate()).to.be.rejected;
    expect(error.get('xnor')[0].message).to.equal('xnor failed');

    await expect(Foo.build({ field1: 33, field2: null }).validate()).not.to.be.rejected;
  });

  it('validates model with a validator whose arg is an Array successfully twice in a row', async () => {
    const Foo = current.define('Foo' + config.rand(), {
        bar: {
          type: Sequelize.STRING,
          validate: {
            isIn: [['a', 'b']]
          }
        }
      }),
      foo = Foo.build({ bar: 'a' });

    await expect(foo.validate()).not.to.be.rejected;
    await expect(foo.validate()).not.to.be.rejected;
  });

  it('validates enums', async () => {
    const values = ['value1', 'value2'];

    const Bar = current.define('Bar' + config.rand(), {
      field: {
        type: Sequelize.ENUM,
        values,
        validate: {
          isIn: [values]
        }
      }
    });

    const failingBar = Bar.build({ field: 'value3' });

    const errors = await expect(failingBar.validate()).to.be.rejected;
    expect(errors.get('field')).to.have.length(1);
    expect(errors.get('field')[0].message).to.equal('Validation isIn on field failed');
  });

  it('skips validations for the given fields', () => {
    const values = ['value1', 'value2'];

    const Bar = current.define('Bar' + config.rand(), {
      field: {
        type: Sequelize.ENUM,
        values,
        validate: {
          isIn: [values]
        }
      }
    });

    const failingBar = Bar.build({ field: 'value3' });

    return expect(failingBar.validate({ skip: ['field'] })).not.to.be.rejected;
  });

  it('raises an error if saving a different value into an immutable field', async () => {
    const User = current.define('User', {
      name: {
        type: Sequelize.STRING,
        validate: {
          isImmutable: true
        }
      }
    });

    await User.sync({ force: true });

    const user = await User.create({ name: 'RedCat' });
    expect(user.getDataValue('name')).to.equal('RedCat');
    user.setDataValue('name', 'YellowCat');

    const errors = await expect(user.save()).to.be.rejected;
    expect(errors.get('name')[0].message).to.eql('Validation isImmutable on name failed');
  });

  it('allows setting an immutable field if the record is unsaved', () => {
    const User = current.define('User', {
      name: {
        type: Sequelize.STRING,
        validate: {
          isImmutable: true
        }
      }
    });

    const user = User.build({ name: 'RedCat' });
    expect(user.getDataValue('name')).to.equal('RedCat');

    user.setDataValue('name', 'YellowCat');
    return expect(user.validate()).not.to.be.rejected;
  });

  it('raises an error for array on a STRING', () => {
    const User = current.define('User', {
      email: {
        type: Sequelize.STRING
      }
    });

    return expect(
      User.build({
        email: ['iama', 'dummy.com']
      }).validate()
    ).to.be.rejectedWith(Sequelize.ValidationError);
  });

  it('raises an error for array on a STRING(20)', () => {
    const User = current.define('User', {
      email: {
        type: Sequelize.STRING(20)
      }
    });

    return expect(
      User.build({
        email: ['iama', 'dummy.com']
      }).validate()
    ).to.be.rejectedWith(Sequelize.ValidationError);
  });

  it('raises an error for array on a TEXT', () => {
    const User = current.define('User', {
      email: {
        type: Sequelize.TEXT
      }
    });

    return expect(
      User.build({
        email: ['iama', 'dummy.com']
      }).validate()
    ).to.be.rejectedWith(Sequelize.ValidationError);
  });

  it('raises an error for {} on a STRING', () => {
    const User = current.define('User', {
      email: {
        type: Sequelize.STRING
      }
    });

    return expect(
      User.build({
        email: { lol: true }
      }).validate()
    ).to.be.rejectedWith(Sequelize.ValidationError);
  });

  it('raises an error for {} on a STRING(20)', () => {
    const User = current.define('User', {
      email: {
        type: Sequelize.STRING(20)
      }
    });

    return expect(
      User.build({
        email: { lol: true }
      }).validate()
    ).to.be.rejectedWith(Sequelize.ValidationError);
  });

  it('raises an error for {} on a TEXT', () => {
    const User = current.define('User', {
      email: {
        type: Sequelize.TEXT
      }
    });

    return expect(
      User.build({
        email: { lol: true }
      }).validate()
    ).to.be.rejectedWith(Sequelize.ValidationError);
  });

  it('does not raise an error for null on a STRING (where null is allowed)', () => {
    const User = current.define('User', {
      email: {
        type: Sequelize.STRING
      }
    });

    return expect(
      User.build({
        email: null
      }).validate()
    ).not.to.be.rejected;
  });

  it('validates VIRTUAL fields', async () => {
    const User = current.define('user', {
      password_hash: Sequelize.STRING,
      salt: Sequelize.STRING,
      password: {
        type: Sequelize.VIRTUAL,
        set(val) {
          this.setDataValue('password', val);
          this.setDataValue('password_hash', this.salt + val);
        },
        validate: {
          isLongEnough(val) {
            if (val.length < 7) {
              throw new Error('Please choose a longer password');
            }
          }
        }
      }
    });

    const errors = await expect(
      User.build({
        password: 'short',
        salt: '42'
      }).validate()
    ).to.be.rejected;
    expect(errors.get('password')[0].message).to.equal('Please choose a longer password');

    await expect(
      User.build({
        password: 'loooooooong',
        salt: '42'
      }).validate()
    ).not.to.be.rejected;
  });

  it('allows me to add custom validation functions to validator.js', async () => {
    current.Validator.extend('isExactly7Characters', (val) => {
      return val.length === 7;
    });

    const User = current.define('User', {
      name: {
        type: Sequelize.STRING,
        validate: {
          isExactly7Characters: true
        }
      }
    });

    await expect(
      User.build({
        name: 'abcdefg'
      }).validate()
    ).not.to.be.rejected;

    const errors = await expect(
      User.build({
        name: 'a'
      }).validate()
    ).to.be.rejected;

    expect(errors.get('name')[0].message).to.equal('Validation isExactly7Characters on name failed');
  });
});
