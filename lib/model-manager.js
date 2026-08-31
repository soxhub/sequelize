import { toposort } from './utils/toposort.js';

// A table name is either a bare string, or the { tableName, schema } object that
// QueryGenerator#addSchema returns for a model bound to a schema.
const isSchemaBoundName = (tableName) => typeof tableName === 'object' && tableName !== null;

export class ModelManager {
  constructor(sequelize) {
    this.models = [];
    this.sequelize = sequelize;
  }

  addModel(model) {
    this.models.push(model);
    this.sequelize.models[model.name] = model;

    return model;
  }

  removeModel(modelToRemove) {
    this.models = this.models.filter((model) => model.name !== modelToRemove.name);

    delete this.sequelize.models[modelToRemove.name];
  }

  getModel(against, options) {
    const { attribute = 'name' } = options || {};
    const model = this.models.filter((m) => m[attribute] === against);

    return model ? model[0] : null;
  }

  get all() {
    return this.models;
  }

  /**
   * Iterate over Models in an order suitable for e.g. creating tables. Will
   * take foreign key constraints into account so that dependencies are visited
   * before dependents.
   */
  forEachModel(iterator, options) {
    const models = {};
    const graph = new Map();
    const { reverse = true } = options || {};

    for (const model of this.models) {
      let tableName = model.getTableName();

      if (isSchemaBoundName(tableName)) {
        tableName = tableName.schema + '.' + tableName.tableName;
      }

      models[tableName] = model;

      const deps = graph.get(tableName) || [];

      for (const attrName in model.rawAttributes) {
        if (Object.hasOwn(model.rawAttributes, attrName)) {
          const attribute = model.rawAttributes[attrName];

          if (attribute.references) {
            let dep = attribute.references.model;

            if (isSchemaBoundName(dep)) {
              dep = dep.schema + '.' + dep.tableName;
            }

            // A self reference is not an ordering constraint, and would look like a cycle.
            if (dep !== tableName) {
              deps.push(dep);
            }
          }
        }
      }

      graph.set(tableName, deps);
    }

    let sorted = toposort(graph);
    if (reverse) {
      sorted = sorted.reverse();
    }
    for (const name of sorted) {
      iterator(models[name], name);
    }
  }
}

export default ModelManager;
