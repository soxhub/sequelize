import * as chai from 'chai';
import Sequelize from '../../../index.js';
import Support from '../support.js';

const expect = chai.expect;

describe(Support.getTestDialectTeaser('Model'), () => {
  describe('attributes', () => {
    describe('set', () => {
      it('should only be called once when used on a join model called with an association getter', async function () {
        const self = this;
        self.callCount = 0;

        this.Student = this.sequelize.define(
          'student',
          {
            no: { type: Sequelize.INTEGER, primaryKey: true },
            name: Sequelize.STRING
          },
          {
            tableName: 'student',
            timestamps: false
          }
        );

        this.Course = this.sequelize.define(
          'course',
          {
            no: { type: Sequelize.INTEGER, primaryKey: true },
            name: Sequelize.STRING
          },
          {
            tableName: 'course',
            timestamps: false
          }
        );

        this.Score = this.sequelize.define(
          'score',
          {
            score: Sequelize.INTEGER,
            test_value: {
              type: Sequelize.INTEGER,
              set(v) {
                self.callCount++;
                this.setDataValue('test_value', v + 1);
              }
            }
          },
          {
            tableName: 'score',
            timestamps: false
          }
        );

        this.Student.belongsToMany(this.Course, { through: this.Score, foreignKey: 'StudentId' });
        this.Course.belongsToMany(this.Student, { through: this.Score, foreignKey: 'CourseId' });

        await this.sequelize.sync({ force: true });

        const [student, course] = await Promise.all([
          self.Student.create({ no: 1, name: 'ryan' }),
          self.Course.create({ no: 100, name: 'history' })
        ]);

        await student.addCourse(course, { through: { score: 98, test_value: 1000 } });

        expect(self.callCount).to.equal(1);
        const stored = await self.Score.find({ where: { StudentId: 1, CourseId: 100 } });
        expect(stored.test_value).to.equal(1001);

        const [courses, score] = await Promise.all([
          self.Student.build({ no: 1 }).getCourses({ where: { no: 100 } }),
          self.Score.find({ where: { StudentId: 1, CourseId: 100 } })
        ]);

        expect(score.test_value).to.equal(1001);
        expect(courses[0].score.toJSON().test_value).to.equal(1001);
        expect(self.callCount).to.equal(1);
      });

      it('allows for an attribute to be called "toString"', async function () {
        const Person = this.sequelize.define(
          'person',
          {
            name: Sequelize.STRING,
            nick: Sequelize.STRING
          },
          {
            timestamps: false
          }
        );

        await this.sequelize.sync({ force: true });
        await Person.create({ name: 'Jozef', nick: 'Joe' });

        const person = await Person.findOne({
          attributes: ['nick', ['name', 'toString']],
          where: {
            name: 'Jozef'
          }
        });

        expect(person.dataValues['toString']).to.equal('Jozef');
        expect(person.get('toString')).to.equal('Jozef');
      });

      it('allows for an attribute to be called "toString" with associations', async function () {
        const Person = this.sequelize.define('person', {
          name: Sequelize.STRING,
          nick: Sequelize.STRING
        });

        const Computer = this.sequelize.define('computer', {
          hostname: Sequelize.STRING
        });

        Person.hasMany(Computer);

        await this.sequelize.sync({ force: true });

        const person = await Person.create({ name: 'Jozef', nick: 'Joe' });
        await person.createComputer({ hostname: 'laptop' });

        const result = await Person.findAll({
          attributes: ['nick', ['name', 'toString']],
          include: {
            model: Computer
          },
          where: {
            name: 'Jozef'
          }
        });

        expect(result.length).to.equal(1);
        expect(result[0].dataValues['toString']).to.equal('Jozef');
        expect(result[0].get('toString')).to.equal('Jozef');
        expect(result[0].get('computers')[0].hostname).to.equal('laptop');
      });
    });
  });
});
