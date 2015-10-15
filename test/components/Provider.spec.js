import expect from 'expect';
import jsdom from 'mocha-jsdom';
import React, { PropTypes, Component } from 'react';
import TestUtils from 'react-addons-test-utils';
import { createStore } from 'redux';
import { Provider } from '../../src/index';

describe('React', () => {
  describe('Provider', () => {
    jsdom();

    class Child extends Component {
      static contextTypes = {
        store: PropTypes.object.isRequired
      }

      render() {
        return <div />;
      }
    }

    it('should enforce a single child', () => {
      const store = createStore(() => ({}));

      // Ignore propTypes warnings
      const propTypes = Provider.propTypes;
      Provider.propTypes = {};

      try {
        expect(() => TestUtils.renderIntoDocument(
          <Provider store={store}>
            <div />
          </Provider>
        )).toNotThrow();

        expect(() => TestUtils.renderIntoDocument(
          <Provider store={store}>
          </Provider>
        )).toThrow(/exactly one child/);

        expect(() => TestUtils.renderIntoDocument(
          <Provider store={store}>
            <div />
            <div />
          </Provider>
        )).toThrow(/exactly one child/);
      } finally {
        Provider.propTypes = propTypes;
      }
    });

    it('should add the store to the child context', () => {
      const store = createStore(() => ({}));

      const spy = expect.spyOn(console, 'error');
      const tree = TestUtils.renderIntoDocument(
        <Provider store={store}>
          <Child />
        </Provider>
      );
      spy.destroy();
      expect(spy.calls.length).toBe(0);

      const child = TestUtils.findRenderedComponentWithType(tree, Child);
      expect(child.context.store).toBe(store);
    });

    it('should warn once when receiving a new store in props', () => {
      const store1 = createStore((state = 10) => state + 1);
      const store2 = createStore((state = 10) => state * 2);
      const store3 = createStore((state = 10) => state * state);

      class ProviderContainer extends Component {
        state = { store: store1 };

        render() {
          return (
            <Provider store={this.state.store}>
              <Child />
            </Provider>
          );
        }
      }

      const container = TestUtils.renderIntoDocument(<ProviderContainer />);
      const child = TestUtils.findRenderedComponentWithType(container, Child);
      expect(child.context.store.getState()).toEqual(11);

      let spy = expect.spyOn(console, 'error');
      container.setState({ store: store2 });
      spy.destroy();

      expect(child.context.store.getState()).toEqual(11);
      expect(spy.calls.length).toBe(1);
      expect(spy.calls[0].arguments[0]).toBe(
        '<Provider> does not support changing `store` on the fly. ' +
        'It is most likely that you see this error because you updated to ' +
        'Redux 2.x and React Redux 2.x which no longer hot reload reducers ' +
        'automatically. See https://github.com/rackt/react-redux/releases/' +
        'tag/v2.0.0 for the migration instructions.'
      );

      spy = expect.spyOn(console, 'error');
      container.setState({ store: store3 });
      spy.destroy();

      expect(child.context.store.getState()).toEqual(11);
      expect(spy.calls.length).toBe(0);
    });
  });
});
