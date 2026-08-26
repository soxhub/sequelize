import { describe, it, beforeEach, expect } from 'vitest';
import Support from '../support.js';
import DataTypes from '../../../lib/data-types.js';

const current = Support.sequelize;

describe(Support.getTestDialectTeaser('Model'), () => {
  if (current.dialect.supports.GEOMETRY) {
    describe('GEOMETRY', () => {
      let User;

      beforeEach(async () => {
        User = current.define('User', {
          username: DataTypes.STRING,
          geometry: DataTypes.GEOMETRY
        });

        await User.sync({ force: true });
      });

      it('works with aliases fields', async () => {
        const Pub = current.define('Pub', {
            location: { field: 'coordinates', type: DataTypes.GEOMETRY }
          }),
          point = { type: 'Point', coordinates: [39.807222, -76.984722] };

        await Pub.sync({ force: true });

        const pub = await Pub.create({ location: point });
        expect(pub).not.to.be.null;
        expect(pub.location).to.be.deep.eql(point);
      });

      it('should create a geometry object', async () => {
        const point = { type: 'Point', coordinates: [39.807222, -76.984722] };

        const newUser = await User.create({ username: 'username', geometry: point });
        expect(newUser).not.to.be.null;
        expect(newUser.geometry).to.be.deep.eql(point);
      });

      it('should update a geometry object', async () => {
        const point1 = { type: 'Point', coordinates: [39.807222, -76.984722] },
          point2 = { type: 'Point', coordinates: [49.807222, -86.984722] };
        const props = { username: 'username', geometry: point1 };

        await User.create(props);
        await User.update({ geometry: point2 }, { where: { username: props.username } });

        const user = await User.findOne({ where: { username: props.username } });
        expect(user.geometry).to.be.deep.eql(point2);
      });
    });

    describe('GEOMETRY(POINT)', () => {
      let User;

      beforeEach(async () => {
        User = current.define('User', {
          username: DataTypes.STRING,
          geometry: DataTypes.GEOMETRY('POINT')
        });

        await User.sync({ force: true });
      });

      it('should create a geometry object', async () => {
        const point = { type: 'Point', coordinates: [39.807222, -76.984722] };

        const newUser = await User.create({ username: 'username', geometry: point });
        expect(newUser).not.to.be.null;
        expect(newUser.geometry).to.be.deep.eql(point);
      });

      it('should update a geometry object', async () => {
        const point1 = { type: 'Point', coordinates: [39.807222, -76.984722] },
          point2 = { type: 'Point', coordinates: [49.807222, -86.984722] };
        const props = { username: 'username', geometry: point1 };

        await User.create(props);
        await User.update({ geometry: point2 }, { where: { username: props.username } });

        const user = await User.findOne({ where: { username: props.username } });
        expect(user.geometry).to.be.deep.eql(point2);
      });
    });

    describe('GEOMETRY(LINESTRING)', () => {
      let User;

      beforeEach(async () => {
        User = current.define('User', {
          username: DataTypes.STRING,
          geometry: DataTypes.GEOMETRY('LINESTRING')
        });

        await User.sync({ force: true });
      });

      it('should create a geometry object', async () => {
        const point = {
          type: 'LineString',
          coordinates: [
            [100.0, 0.0],
            [101.0, 1.0]
          ]
        };

        const newUser = await User.create({ username: 'username', geometry: point });
        expect(newUser).not.to.be.null;
        expect(newUser.geometry).to.be.deep.eql(point);
      });

      it('should update a geometry object', async () => {
        const point1 = {
            type: 'LineString',
            coordinates: [
              [100.0, 0.0],
              [101.0, 1.0]
            ]
          },
          point2 = {
            type: 'LineString',
            coordinates: [
              [101.0, 0.0],
              [102.0, 1.0]
            ]
          };
        const props = { username: 'username', geometry: point1 };

        await User.create(props);
        await User.update({ geometry: point2 }, { where: { username: props.username } });

        const user = await User.findOne({ where: { username: props.username } });
        expect(user.geometry).to.be.deep.eql(point2);
      });
    });

    describe('GEOMETRY(POLYGON)', () => {
      let User;

      beforeEach(async () => {
        User = current.define('User', {
          username: DataTypes.STRING,
          geometry: DataTypes.GEOMETRY('POLYGON')
        });

        await User.sync({ force: true });
      });

      it('should create a geometry object', async () => {
        const point = {
          type: 'Polygon',
          coordinates: [
            [
              [100.0, 0.0],
              [101.0, 0.0],
              [101.0, 1.0],
              [100.0, 1.0],
              [100.0, 0.0]
            ]
          ]
        };

        const newUser = await User.create({ username: 'username', geometry: point });
        expect(newUser).not.to.be.null;
        expect(newUser.geometry).to.be.deep.eql(point);
      });

      it('should update a geometry object', async () => {
        const polygon1 = {
            type: 'Polygon',
            coordinates: [
              [
                [100.0, 0.0],
                [101.0, 0.0],
                [101.0, 1.0],
                [100.0, 1.0],
                [100.0, 0.0]
              ]
            ]
          },
          polygon2 = {
            type: 'Polygon',
            coordinates: [
              [
                [100.0, 0.0],
                [102.0, 0.0],
                [102.0, 1.0],
                [100.0, 1.0],
                [100.0, 0.0]
              ]
            ]
          };
        const props = { username: 'username', geometry: polygon1 };

        await User.create(props);
        await User.update({ geometry: polygon2 }, { where: { username: props.username } });

        const user = await User.findOne({ where: { username: props.username } });
        expect(user.geometry).to.be.deep.eql(polygon2);
      });
    });

    describe('sql injection attacks', () => {
      let Model;

      beforeEach(() => {
        Model = current.define('Model', {
          location: DataTypes.GEOMETRY
        });
        return current.sync({ force: true });
      });

      it('should properly escape the single quotes', () => {
        return Model.create({
          location: {
            type: 'Point',
            properties: {
              exploit: "'); DELETE YOLO INJECTIONS; -- "
            },
            coordinates: [39.807222, -76.984722]
          }
        });
      });

      it('should properly escape the single quotes in coordinates', () => {
        // MySQL 5.7, those guys finally fixed this

        return Model.create({
          location: {
            type: 'Point',
            properties: {
              exploit: "'); DELETE YOLO INJECTIONS; -- "
            },
            coordinates: [39.807222, "'); DELETE YOLO INJECTIONS; --"]
          }
        });
      });
    });
  }
});
