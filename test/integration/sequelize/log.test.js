import { describe, it, beforeEach, afterEach } from 'mocha';
import { expect } from 'chai';
import sinon from 'sinon';
import Support from '../support.js';

const dialect = Support.getTestDialect();

describe(Support.getTestDialectTeaser('Sequelize'), () => {
  describe('log', () => {
    let spy, sequelize;

    beforeEach(() => {
      spy = sinon.spy(console, 'log');
    });

    afterEach(() => {
      console.log.restore();
    });

    describe('with disabled logging', () => {
      beforeEach(() => {
        sequelize = new Support.Sequelize('db', 'user', 'pw', { dialect, logging: false });
      });

      it('does not call the log method of the logger', () => {
        sequelize.log();
        expect(spy.calledOnce).to.be.false;
      });
    });

    describe('with default logging options', () => {
      beforeEach(() => {
        sequelize = new Support.Sequelize('db', 'user', 'pw', { dialect });
      });

      describe('called with no arguments', () => {
        it('calls the log method', () => {
          sequelize.log();
          expect(spy.calledOnce).to.be.true;
        });

        it('logs an empty string as info event', () => {
          sequelize.log('');
          expect(spy.calledOnce).to.be.true;
        });
      });

      describe('called with one argument', () => {
        it('logs the passed string as info event', () => {
          sequelize.log('my message');
          expect(spy.withArgs('my message').calledOnce).to.be.true;
        });
      });

      describe('called with more than two arguments', () => {
        it('passes the arguments to the logger', () => {
          sequelize.log('error', 'my message', 1, { a: 1 });
          expect(spy.withArgs('error', 'my message', 1, { a: 1 }).calledOnce).to.be.true;
        });
      });
    });

    describe('with a custom function for logging', () => {
      beforeEach(() => {
        spy = sinon.spy();
        sequelize = new Support.Sequelize('db', 'user', 'pw', { dialect, logging: spy });
      });

      it('calls the custom logger method', () => {
        sequelize.log('om nom');
        expect(spy.calledOnce).to.be.true;
      });

      it('calls the custom logger method with options', () => {
        const message = 'om nom';
        const timeTaken = 5;
        const options = { correlationId: 'ABC001' };
        sequelize.log(message, timeTaken, options);
        expect(spy.withArgs(message, timeTaken, options).calledOnce).to.be.true;
      });
    });
  });
});
