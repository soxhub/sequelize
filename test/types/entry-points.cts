/**
 * Both published type entry points have to resolve and carry the same meanings.
 *
 * `index.d.cts` is listed in `package.json#exports.require.types` and shipped in `files`, but the
 * root tsconfig only parses it -- nothing checks that a CommonJS consumer can actually use it. It
 * re-exports the ESM default with `export =`, which is meant to preserve the binding's value, type
 * and namespace meanings all at once; this file asserts all three survive the round trip.
 */
import Sequelize = require('sequelize');

// Value meaning: the export is constructible.
const sequelize = new Sequelize('database', 'user', 'password', { dialect: 'postgres' });

// Namespace meaning: types hang off the same binding.
type Options = Sequelize.UpsertOptions;
type Instance = Sequelize.Instance<{ id?: number }>;

const options: Options = { returning: true, conflictFields: ['id'] };

// Static members reachable through the CJS shape.
const literal = Sequelize.literal('1');
const op = Sequelize.Op.eq;

export { sequelize, options, literal, op };
export type { Options, Instance };
