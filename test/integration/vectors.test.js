import { describe, it } from 'mocha';
import { expect, should } from 'chai';
import Sequelize from '../../index.js';
import Support from './support.js';

should();

const current = Support.sequelize;

describe(Support.getTestDialectTeaser('Vectors'), () => {
  it('should not allow insert backslash', async () => {
    const Student = current.define(
      'student',
      {
        name: Sequelize.STRING
      },
      {
        tableName: 'student'
      }
    );

    await Student.sync({ force: true });

    const created = await Student.create({
      name: 'Robert\\\'); DROP TABLE "students"; --'
    });
    expect(created.get('name')).to.equal('Robert\\\'); DROP TABLE "students"; --');

    const found = await Student.findAll();
    expect(found[0].name).to.equal('Robert\\\'); DROP TABLE "students"; --');
  });
});
