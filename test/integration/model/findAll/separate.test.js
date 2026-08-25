import { describe, it } from 'vitest';
import { expect } from 'chai';
import Support from '../../support.js';
import DataTypes from '../../../../lib/data-types.js';

const current = Support.sequelize;

describe(Support.getTestDialectTeaser('Model'), () => {
  describe('findAll', () => {
    describe('separate with limit', () => {
      it('should not throw syntax error (union)', async () => {
        // #9813 testcase
        const Project = current.define('Project', { name: DataTypes.STRING });
        const LevelTwo = current.define('LevelTwo', { name: DataTypes.STRING });
        const LevelThree = current.define('LevelThree', { type: DataTypes.INTEGER });

        Project.hasMany(LevelTwo);
        LevelTwo.belongsTo(Project);

        LevelTwo.hasMany(LevelThree, { as: 'type_ones' });
        LevelTwo.hasMany(LevelThree, { as: 'type_twos' });
        LevelThree.belongsTo(LevelTwo);

        await current.sync({ force: true });

        const [project, level21, level22] = await Promise.all([
          Project.create({ name: 'testProject' }),
          LevelTwo.create({ name: 'testL21' }),
          LevelTwo.create({ name: 'testL22' })
        ]);

        await Promise.all([project.addLevelTwo(level21), project.addLevelTwo(level22)]);

        // one include case
        const oneInclude = await Project.findAll({
          where: { name: 'testProject' },
          include: [
            {
              model: LevelTwo,
              include: [
                {
                  model: LevelThree,
                  as: 'type_ones',
                  where: { type: 0 },
                  separate: true,
                  limit: 1,
                  order: [['createdAt', 'DESC']]
                }
              ]
            }
          ]
        });

        expect(oneInclude).to.have.length(1);
        expect(oneInclude[0].LevelTwos).to.have.length(2);
        expect(oneInclude[0].LevelTwos[0].type_ones).to.have.length(0);
        expect(oneInclude[0].LevelTwos[1].type_ones).to.have.length(0);

        // two includes case
        const twoIncludes = await Project.findAll({
          where: { name: 'testProject' },
          include: [
            {
              model: LevelTwo,
              include: [
                {
                  model: LevelThree,
                  as: 'type_ones',
                  where: { type: 0 },
                  separate: true,
                  limit: 1,
                  order: [['createdAt', 'DESC']]
                },
                {
                  model: LevelThree,
                  as: 'type_twos',
                  where: { type: 1 },
                  separate: true,
                  limit: 1,
                  order: [['createdAt', 'DESC']]
                }
              ]
            }
          ]
        });

        expect(twoIncludes).to.have.length(1);
        expect(twoIncludes[0].LevelTwos).to.have.length(2);
        expect(twoIncludes[0].LevelTwos[0].type_ones).to.have.length(0);
        expect(twoIncludes[0].LevelTwos[1].type_ones).to.have.length(0);
      });
    });
  });
});
