/**
 * Consumer-facing type tests for `Model.upsert`.
 *
 * The root tsconfig only compiles `index.d.ts` / `index.d.cts`, which proves the declarations are
 * internally well-formed and nothing more -- it never type-checks a call. Both of the defects this
 * file pins were invisible to that check: a `returning` column list was rejected outright, and
 * hoisting the options into a variable matched no overload at all.
 *
 * `sequelize` here is the package's own name, so these resolve through the published `exports` map
 * rather than a relative path -- the same route a consumer takes.
 *
 * Negative cases use `@ts-expect-error`, which fails the build if the error ever stops happening.
 * That is what catches a conditional return type quietly collapsing to a single branch.
 */
import Sequelize from 'sequelize';

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

declare const transaction: Sequelize.Transaction;
declare const instance: UserInstance;

// -- no `returning`: just the created flag -------------------------------------------------------

export const bare: Promise<boolean> = User.upsert({ username: 'john' });
export const explicitlyOff: Promise<boolean> = User.upsert({ username: 'john' }, { returning: false });

// @ts-expect-error without `returning` the row is not fetched, so there is no instance to hand back
export const bareIsNotATuple: Promise<[UserInstance, boolean]> = User.upsert({ username: 'john' });

// @ts-expect-error `returning: false` likewise yields only the flag
export const offIsNotATuple: Promise<[UserInstance, boolean]> = User.upsert({ username: 'john' }, { returning: false });

// -- `returning: true`: the whole row ------------------------------------------------------------

export const withRow: Promise<[UserInstance, boolean]> = User.upsert({ username: 'john' }, { returning: true });

// @ts-expect-error the tuple is not assignable to a bare boolean
export const rowIsNotABoolean: Promise<boolean> = User.upsert({ username: 'john' }, { returning: true });

// -- `returning: [...]`: a narrowed column list --------------------------------------------------
// Regression guard: this was a hard TS2769 before the overloads were widened, even though
// `ReturningOptions` had always declared `boolean | string[]`.

export const withColumns: Promise<[UserInstance, boolean]> = User.upsert(
  { username: 'john' },
  { returning: ['id', 'username'] }
);

// @ts-expect-error a column list still fetches a row, so this is a tuple too
export const columnsIsNotABoolean: Promise<boolean> = User.upsert(
  { username: 'john' },
  { returning: ['id', 'username'] }
);

// -- conflict target options ---------------------------------------------------------------------

export const withConflictFields: Promise<boolean> = User.upsert({ username: 'john' }, { conflictFields: ['username'] });

export const withConflictWhere: Promise<[UserInstance, boolean]> = User.upsert(
  { username: 'john' },
  { conflictFields: ['username'], conflictWhere: { deletedAt: null }, returning: true }
);

// -- options that ride along on every write path -------------------------------------------------
// The one production `Model.upsert` caller in auditboard-backend passes a transaction this way.

export const withTransaction: Promise<boolean> = User.upsert({ username: 'john' }, { transaction });
export const withEverything: Promise<[UserInstance, boolean]> = User.upsert(
  { username: 'john' },
  { transaction, fields: ['username'], validate: false, logging: false, returning: true }
);

// -- options hoisted into a variable -------------------------------------------------------------
// Regression guard: this matched no overload at all before `upsert` became a single generic
// signature. It resolves to the `boolean` branch because a variable annotated `UpsertOptions` widens
// `returning` to `boolean | string[] | undefined`, which the conditional cannot narrow. That is a
// known limit of conditional-on-generic, not a bug -- but it is a silently weaker type rather than
// an error, so it is pinned here deliberately.

const hoisted: Sequelize.UpsertOptions = { returning: true };
export const fromVariable: Promise<boolean> = User.upsert({ username: 'john' }, hoisted);

// @ts-expect-error the widened variable cannot resolve to the tuple branch
export const hoistedIsNotATuple: Promise<[UserInstance, boolean]> = User.upsert({ username: 'john' }, hoisted);

// `as const` keeps the literal, so the conditional picks the tuple branch again.
const narrowed = { returning: true } as const;
export const fromNarrowedVariable: Promise<[UserInstance, boolean]> = User.upsert({ username: 'john' }, narrowed);

// -- the deprecated alias keeps the same shape ---------------------------------------------------

export const aliasBare: Promise<boolean> = User.insertOrUpdate({ username: 'john' });
export const aliasWithRow: Promise<[UserInstance, boolean]> = User.insertOrUpdate(
  { username: 'john' },
  { returning: true }
);

// -- unknown options are still rejected ----------------------------------------------------------

// @ts-expect-error not an upsert option
export const bogus: Promise<boolean> = User.upsert({ username: 'john' }, { totallyNotAnOption: 123 });

// -- the returned instance is the model's own instance type --------------------------------------

export async function returnedRowIsTheInstanceType(): Promise<string | undefined> {
  const [row, created] = await User.upsert({ username: 'john' }, { returning: true });
  const flag: boolean = created;
  void flag;
  void instance;

  return row.username;
}
