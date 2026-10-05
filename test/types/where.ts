/**
 * Consumer-facing type tests for symbol-operator `where` clauses.
 *
 * `Op.*` members are `unique symbol`s, so `{ [Op.in]: [...] }` is a known key that gets checked
 * rather than an opaque `symbol` index that accepts anything. All three ways of reaching `Op`
 * must resolve to the same symbols.
 */
import Sequelize, { Op, type AnyWhereOptions, type WhereOperators } from 'sequelize';

const sequelize = new Sequelize('database', 'user', 'password', { dialect: 'postgres' });

interface UserAttributes {
  id?: number;
  username?: string;
  deletedAt?: Date | null;
}

interface UserInstance extends Sequelize.Instance<UserAttributes>, UserAttributes {}

const User = sequelize.define<UserInstance, UserAttributes>('user', {
  username: Sequelize.STRING
});

void User.findAll({
  where: {
    id: { [Op.in]: [1, 2] },
    username: { [Sequelize.Op.iLike]: '%a%' },
    deletedAt: { [sequelize.Op.eq]: null }
  }
});

void User.findAll({
  where: {
    [Op.or]: [{ id: 1 }, { username: { [Op.ne]: 'x' } }],
    [Op.and]: [Sequelize.literal('1 = 1')]
  }
});

void User.findAll({ where: { id: { [Op.between]: [1, 10] } } });

void User.findAll({ where: { id: { [Op.or]: [{ [Op.lt]: 1 }, { [Op.gt]: 10 }] } } });

// @ts-expect-error `Op.in` takes a list, not a scalar
const scalarIn: WhereOperators = { [Op.in]: 1 };

// @ts-expect-error `Op.between` takes exactly two bounds
const oneBound: WhereOperators = { [Op.between]: [1] };

declare const where: AnyWhereOptions;
const conditions = where[Op.and];
if (Array.isArray(conditions)) {
  const literals: Array<Sequelize.literal> = conditions.filter(
    (condition): condition is Sequelize.literal => condition instanceof Sequelize.Utils.Literal
  );
  void literals;
}

void scalarIn;
void oneBound;
