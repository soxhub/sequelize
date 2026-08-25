import { describe, it, beforeEach } from 'vitest';
import { expect } from 'chai';
import moment from 'moment';
import Support from '../support.js';
import DataTypes from '../../../lib/data-types.js';

const current = Support.sequelize;

describe(Support.getTestDialectTeaser('Model'), () => {
  if (current.dialect.supports.JSON) {
    describe('JSON', () => {
      let Event;

      beforeEach(async () => {
        Event = current.define('Event', {
          data: {
            type: DataTypes.JSON,
            field: 'event_data',
            index: true
          },
          json: DataTypes.JSON
        });

        await Event.sync({ force: true });
      });

      if (current.dialect.supports.lock) {
        it('findOrCreate supports transactions, json and locks', async () => {
          const transaction = await current.transaction();

          await Event.findOrCreate({
            where: {
              json: { some: { input: 'Hello' } }
            },
            defaults: {
              json: { some: { input: 'Hello' }, input: [1, 2, 3] },
              data: { some: { input: 'There' }, input: [4, 5, 6] }
            },
            transaction,
            lock: transaction.LOCK.UPDATE,
            logging: (sql) => {
              if (sql.indexOf('SELECT') !== -1 && sql.indexOf('CREATE') === -1) {
                expect(sql.indexOf('FOR UPDATE')).not.to.be.equal(-1);
              }
            }
          });

          const count = await Event.count();
          expect(count).to.equal(0);

          await transaction.commit();

          const committedCount = await Event.count();
          expect(committedCount).to.equal(1);
        });
      }

      describe('create', () => {
        it('should create an instance with JSON data', async () => {
          await Event.create({
            data: {
              name: {
                first: 'Homer',
                last: 'Simpson'
              },
              employment: 'Nuclear Safety Inspector'
            }
          });

          const events = await Event.findAll();
          const event = events[0];

          expect(event.get('data')).to.eql({
            name: {
              first: 'Homer',
              last: 'Simpson'
            },
            employment: 'Nuclear Safety Inspector'
          });
        });
      });

      describe('update', () => {
        it('should update with JSON column (dot notation)', async () => {
          await Event.bulkCreate([
            {
              id: 1,
              data: {
                name: {
                  first: 'Homer',
                  last: 'Simpson'
                },
                employment: 'Nuclear Safety Inspector'
              }
            },
            {
              id: 2,
              data: {
                name: {
                  first: 'Rick',
                  last: 'Sanchez'
                },
                employment: 'Multiverse Scientist'
              }
            }
          ]);

          await Event.update(
            {
              data: {
                name: {
                  first: 'Rick',
                  last: 'Sanchez'
                },
                employment: 'Galactic Fed Prisioner'
              }
            },
            {
              where: {
                'data.name.first': 'Rick'
              }
            }
          );

          const event = await Event.findByPk(2);
          expect(event.get('data')).to.eql({
            name: {
              first: 'Rick',
              last: 'Sanchez'
            },
            employment: 'Galactic Fed Prisioner'
          });
        });

        it('should update with JSON column (JSON notation)', async () => {
          await Event.bulkCreate([
            {
              id: 1,
              data: {
                name: {
                  first: 'Homer',
                  last: 'Simpson'
                },
                employment: 'Nuclear Safety Inspector'
              }
            },
            {
              id: 2,
              data: {
                name: {
                  first: 'Rick',
                  last: 'Sanchez'
                },
                employment: 'Multiverse Scientist'
              }
            }
          ]);

          await Event.update(
            {
              data: {
                name: {
                  first: 'Rick',
                  last: 'Sanchez'
                },
                employment: 'Galactic Fed Prisioner'
              }
            },
            {
              where: {
                data: {
                  name: {
                    first: 'Rick'
                  }
                }
              }
            }
          );

          const event = await Event.findByPk(2);
          expect(event.get('data')).to.eql({
            name: {
              first: 'Rick',
              last: 'Sanchez'
            },
            employment: 'Galactic Fed Prisioner'
          });
        });

        it('should update an instance with JSON data', async () => {
          const created = await Event.create({
            data: {
              name: {
                first: 'Homer',
                last: 'Simpson'
              },
              employment: 'Nuclear Safety Inspector'
            }
          });

          await created.update({
            data: {
              name: {
                first: 'Homer',
                last: 'Simpson'
              },
              employment: null
            }
          });

          const events = await Event.findAll();
          const event = events[0];

          expect(event.get('data')).to.eql({
            name: {
              first: 'Homer',
              last: 'Simpson'
            },
            employment: null
          });
        });
      });

      describe('find', () => {
        it('should be possible to query a nested value', async () => {
          await Promise.all([
            Event.create({
              data: {
                name: {
                  first: 'Homer',
                  last: 'Simpson'
                },
                employment: 'Nuclear Safety Inspector'
              }
            }),
            Event.create({
              data: {
                name: {
                  first: 'Marge',
                  last: 'Simpson'
                },
                employment: 'Housewife'
              }
            })
          ]);

          const events = await Event.findAll({
            where: {
              data: {
                employment: 'Housewife'
              }
            }
          });

          const event = events[0];

          expect(events.length).to.equal(1);
          expect(event.get('data')).to.eql({
            name: {
              first: 'Marge',
              last: 'Simpson'
            },
            employment: 'Housewife'
          });
        });

        it('should be possible to query dates with array operators', async () => {
          const now = moment().milliseconds(0).toDate();
          const before = moment().milliseconds(0).subtract(1, 'day').toDate();
          const after = moment().milliseconds(0).add(1, 'day').toDate();
          await Event.create({
            json: {
              user: 'Homer',
              lastLogin: now
            }
          });

          const exact = await Event.findAll({
            where: {
              json: {
                lastLogin: now
              }
            }
          });

          expect(exact.length).to.equal(1);
          expect(exact[0].get('json')).to.eql({
            user: 'Homer',
            lastLogin: now.toISOString()
          });

          const between = await Event.findAll({
            where: {
              json: {
                lastLogin: { $between: [before, after] }
              }
            }
          });

          expect(between.length).to.equal(1);
          expect(between[0].get('json')).to.eql({
            user: 'Homer',
            lastLogin: now.toISOString()
          });
        });

        it('should be possible to query a boolean with array operators', async () => {
          await Event.create({
            json: {
              user: 'Homer',
              active: true
            }
          });

          const exact = await Event.findAll({
            where: {
              json: {
                active: true
              }
            }
          });

          expect(exact.length).to.equal(1);
          expect(exact[0].get('json')).to.eql({
            user: 'Homer',
            active: true
          });

          const inList = await Event.findAll({
            where: {
              json: {
                active: { $in: [true, false] }
              }
            }
          });

          expect(inList.length).to.equal(1);
          expect(inList[0].get('json')).to.eql({
            user: 'Homer',
            active: true
          });
        });

        it('should be possible to query a nested integer value', async () => {
          await Promise.all([
            Event.create({
              data: {
                name: {
                  first: 'Homer',
                  last: 'Simpson'
                },
                age: 40
              }
            }),
            Event.create({
              data: {
                name: {
                  first: 'Marge',
                  last: 'Simpson'
                },
                age: 37
              }
            })
          ]);

          const events = await Event.findAll({
            where: {
              data: {
                age: {
                  $gt: 38
                }
              }
            }
          });

          expect(events.length).to.equal(1);
          expect(events[0].get('data')).to.eql({
            name: {
              first: 'Homer',
              last: 'Simpson'
            },
            age: 40
          });
        });

        it('should be possible to query a nested null value', async () => {
          await Promise.all([
            Event.create({
              data: {
                name: {
                  first: 'Homer',
                  last: 'Simpson'
                },
                employment: 'Nuclear Safety Inspector'
              }
            }),
            Event.create({
              data: {
                name: {
                  first: 'Marge',
                  last: 'Simpson'
                },
                employment: null
              }
            })
          ]);

          const events = await Event.findAll({
            where: {
              data: {
                employment: null
              }
            }
          });

          expect(events.length).to.equal(1);
          expect(events[0].get('data')).to.eql({
            name: {
              first: 'Marge',
              last: 'Simpson'
            },
            employment: null
          });
        });

        it('should be possible to query for nested fields with hyphens/dashes, #8718', async () => {
          await Promise.all([
            Event.create({
              data: {
                name: {
                  first: 'Homer',
                  last: 'Simpson'
                },
                status_report: {
                  'red-indicator': {
                    level$$level: true
                  }
                },
                employment: 'Nuclear Safety Inspector'
              }
            }),
            Event.create({
              data: {
                name: {
                  first: 'Marge',
                  last: 'Simpson'
                },
                employment: null
              }
            })
          ]);

          const events = await Event.findAll({
            where: {
              data: {
                status_report: {
                  'red-indicator': {
                    level$$level: true
                  }
                }
              }
            }
          });

          expect(events.length).to.equal(1);
          expect(events[0].get('data')).to.eql({
            name: {
              first: 'Homer',
              last: 'Simpson'
            },
            status_report: {
              'red-indicator': {
                level$$level: true
              }
            },
            employment: 'Nuclear Safety Inspector'
          });
        });

        it('should be possible to query multiple nested values', async () => {
          await Event.create({
            data: {
              name: {
                first: 'Homer',
                last: 'Simpson'
              },
              employment: 'Nuclear Safety Inspector'
            }
          });

          await Promise.all([
            Event.create({
              data: {
                name: {
                  first: 'Marge',
                  last: 'Simpson'
                },
                employment: 'Housewife'
              }
            }),
            Event.create({
              data: {
                name: {
                  first: 'Bart',
                  last: 'Simpson'
                },
                employment: 'None'
              }
            })
          ]);

          const events = await Event.findAll({
            where: {
              data: {
                name: {
                  last: 'Simpson'
                },
                employment: {
                  $ne: 'None'
                }
              }
            },
            order: [['id', 'ASC']]
          });

          expect(events.length).to.equal(2);

          expect(events[0].get('data')).to.eql({
            name: {
              first: 'Homer',
              last: 'Simpson'
            },
            employment: 'Nuclear Safety Inspector'
          });

          expect(events[1].get('data')).to.eql({
            name: {
              first: 'Marge',
              last: 'Simpson'
            },
            employment: 'Housewife'
          });
        });

        it('should be possible to query a nested value and order results', async () => {
          await Event.create({
            data: {
              name: {
                first: 'Homer',
                last: 'Simpson'
              },
              employment: 'Nuclear Safety Inspector'
            }
          });

          await Promise.all([
            Event.create({
              data: {
                name: {
                  first: 'Marge',
                  last: 'Simpson'
                },
                employment: 'Housewife'
              }
            }),
            Event.create({
              data: {
                name: {
                  first: 'Bart',
                  last: 'Simpson'
                },
                employment: 'None'
              }
            })
          ]);

          const events = await Event.findAll({
            where: {
              data: {
                name: {
                  last: 'Simpson'
                }
              }
            },
            order: [['data.name.first']]
          });

          expect(events.length).to.equal(3);

          expect(events[0].get('data')).to.eql({
            name: {
              first: 'Bart',
              last: 'Simpson'
            },
            employment: 'None'
          });

          expect(events[1].get('data')).to.eql({
            name: {
              first: 'Homer',
              last: 'Simpson'
            },
            employment: 'Nuclear Safety Inspector'
          });

          expect(events[2].get('data')).to.eql({
            name: {
              first: 'Marge',
              last: 'Simpson'
            },
            employment: 'Housewife'
          });
        });
      });

      describe('destroy', () => {
        it('should be possible to destroy with where', async () => {
          const conditionSearch = {
            where: {
              data: {
                employment: 'Hacker'
              }
            }
          };

          await Promise.all([
            Event.create({
              data: {
                name: {
                  first: 'Elliot',
                  last: 'Alderson'
                },
                employment: 'Hacker'
              }
            }),
            Event.create({
              data: {
                name: {
                  first: 'Christian',
                  last: 'Slater'
                },
                employment: 'Hacker'
              }
            }),
            Event.create({
              data: {
                name: {
                  first: ' Tyrell',
                  last: 'Wellick'
                },
                employment: 'CTO'
              }
            })
          ]);

          await expect(Event.findAll(conditionSearch)).to.eventually.have.length(2);

          await Event.destroy(conditionSearch);

          await expect(Event.findAll(conditionSearch)).to.eventually.have.length(0);
        });
      });

      describe('sql injection attacks', () => {
        let Model;

        beforeEach(() => {
          Model = current.define('Model', {
            data: DataTypes.JSON
          });
          return current.sync({ force: true });
        });

        it('should properly escape the single quotes', () => {
          return Model.create({
            data: {
              type: 'Point',
              properties: {
                exploit: "'); DELETE YOLO INJECTIONS; -- "
              }
            }
          });
        });

        it('should properly escape path keys with sequelize.json', () => {
          return Model.findAll({
            raw: true,
            attributes: ['id'],
            where: current.json("data.id')) AS DECIMAL) = 1 DELETE YOLO INJECTIONS; -- ", '1')
          });
        });

        it('should properly escape the single quotes in array', () => {
          return Model.create({
            data: {
              type: 'Point',
              coordinates: [39.807222, "'); DELETE YOLO INJECTIONS; --"]
            }
          });
        });

        it('should be possible to find with properly escaped select query', async () => {
          await Model.create({
            data: {
              type: 'Point',
              properties: {
                exploit: "'); DELETE YOLO INJECTIONS; -- "
              }
            }
          });

          const result = await Model.findOne({
            where: {
              data: {
                type: 'Point',
                properties: {
                  exploit: "'); DELETE YOLO INJECTIONS; -- "
                }
              }
            }
          });

          expect(result.get('data')).to.deep.equal({
            type: 'Point',
            properties: {
              exploit: "'); DELETE YOLO INJECTIONS; -- "
            }
          });
        });

        it('should query an instance with JSONB data and order while trying to inject', async () => {
          await Event.create({
            data: {
              name: {
                first: 'Homer',
                last: 'Simpson'
              },
              employment: 'Nuclear Safety Inspector'
            }
          });

          await Promise.all([
            Event.create({
              data: {
                name: {
                  first: 'Marge',
                  last: 'Simpson'
                },
                employment: 'Housewife'
              }
            }),
            Event.create({
              data: {
                name: {
                  first: 'Bart',
                  last: 'Simpson'
                },
                employment: 'None'
              }
            })
          ]);

          await expect(
            Event.findAll({
              where: {
                data: {
                  name: {
                    last: 'Simpson'
                  }
                }
              },
              order: [["data.name.first}'); INSERT INJECTION HERE! SELECT ('"]]
            })
          ).to.eventually.be.rejectedWith(Error);
        });
      });
    });
  }
});
