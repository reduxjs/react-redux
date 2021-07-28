/**
 * @jest-environment node
 *
 * Set this so that `window` is undefined to correctly mimic a Node SSR scenario.
 * That allows connect to fall back to `useEffect` instead of `useLayoutEffect`
 * to avoid ugly console warnings when used with SSR.
 */

/*eslint-disable react/prop-types*/

import React, { FunctionComponent } from 'react'
import { renderToString } from 'react-dom/server'
import { createStore } from 'redux'
import { Provider, connect } from '../../src/index'
import type { Dispatch, Store } from 'redux'

describe('React', () => {
  describe('server rendering', () => {
    interface ActionType {
      type: string
      payload: {
        greeting: string
      }
    }
    function greetingReducer(
      state = { greeting: 'Hello' },
      action: ActionType
    ) {
      return action && action.payload ? action.payload : state
    }
    interface GreetingProps {
      greeting: string
      greeted: string
    }
    const Greeting: FunctionComponent<GreetingProps> = ({
      greeting,
      greeted,
    }) => {
      return <span>{greeting + ' ' + greeted}</span>
    }

    interface RootType {
      greeting: string
    }
    interface Props {
      greeted: string
    }

    const ConnectedGreeting = connect<RootType, unknown, Props, RootType>(
      (state) => state
    )(Greeting)

    const Greeter = (props: any) => (
      <div>
        <ConnectedGreeting {...props} />
      </div>
    )

    interface DispatcherProps {
      constructAction?: ActionType
      willMountAction?: ActionType
      renderAction?: ActionType
      dispatch: Dispatch
      greeted: string
    }

    class Dispatcher extends React.Component<DispatcherProps> {
      constructor(props: DispatcherProps) {
        super(props)
        if (props.constructAction) {
          props.dispatch(props.constructAction)
        }
      }
      UNSAFE_componentWillMount() {
        if (this.props.willMountAction) {
          this.props.dispatch(this.props.willMountAction)
        }
      }
      render() {
        if (this.props.renderAction) {
          this.props.dispatch(this.props.renderAction)
        }

        return <Greeter greeted={this.props.greeted} />
      }
    }
    const ConnectedDispatcher = connect()(Dispatcher)

    it('should be able to render connected component with props and state from store', () => {
      const store: Store = createStore(greetingReducer)

      const markup = renderToString(
        <Provider store={store}>
          <Greeter greeted="world" />
        </Provider>
      )
      expect(markup).toContain('Hello world')
    })

    it('should run in an SSR environment without logging warnings about useLayoutEffect', () => {
      const store: Store = createStore(greetingReducer)

      const spy = jest.spyOn(console, 'error').mockImplementation(() => {})

      renderToString(
        <Provider store={store}>
          <Greeter greeted="world" />
        </Provider>
      )

      expect(spy).toHaveBeenCalledTimes(0)

      spy.mockRestore()
    })

    it('should render with updated state if actions are dispatched before render', () => {
      const store: Store = createStore(greetingReducer)

      store.dispatch({ type: 'Update', payload: { greeting: 'Hi' } })

      const markup = renderToString(
        <Provider store={store}>
          <Greeter greeted="world" />
        </Provider>
      )

      expect(markup).toContain('Hi world')
      expect(store.getState().greeting).toContain('Hi')
    })

    it('should render children with updated state if actions are dispatched in ancestor', () => {
      /*
          Dispatching during construct, render or willMount is
          almost always a bug with SSR (or otherwise)

          This behaviour is undocumented and is likely to change between
          implementations, this test only verifies current behaviour

          Note: this test fails in v6, because we use context to propagate the store state, and the entire
          tree will see the same state during the render pass.
          In all other versions, including v7, the store state may change as actions are dispatched
          during lifecycle methods, and components will see that new state immediately as they read it.
      */
      const store: Store = createStore(greetingReducer)

      const constructAction = { type: 'Update', payload: { greeting: 'Hi' } }
      const willMountAction = { type: 'Update', payload: { greeting: 'Hiya' } }
      const renderAction = { type: 'Update', payload: { greeting: 'Hey' } }

      const markup = renderToString(
        <Provider store={store}>
          <ConnectedDispatcher
            constructAction={constructAction}
            greeted="world"
          />
          <ConnectedDispatcher
            willMountAction={willMountAction}
            greeted="world"
          />
          <ConnectedDispatcher renderAction={renderAction} greeted="world" />
        </Provider>
      )

      expect(markup).toContain('Hi world')
      expect(markup).toContain('Hiya world')
      expect(markup).toContain('Hey world')
      expect(store.getState().greeting).toContain('Hey')
    })

    it('should render children with changed state if actions are dispatched in ancestor and new Provider wraps children', () => {
      /*
          Dispatching during construct, render or willMount is
          almost always a bug with SSR (or otherwise)

          This behaviour is undocumented and is likely to change between
          implementations, this test only verifies current behaviour

          This test works both when state is fetched directly in connected
          components and when it is fetched in a Provider and placed on context
      */
      const store: Store = createStore(greetingReducer)

      const constructAction = { type: 'Update', payload: { greeting: 'Hi' } }
      const willMountAction = { type: 'Update', payload: { greeting: 'Hiya' } }
      const renderAction = { type: 'Update', payload: { greeting: 'Hey' } }

      const markup = renderToString(
        <Provider store={store}>
          <ConnectedDispatcher
            constructAction={constructAction}
            greeted="world"
          />
          <ConnectedDispatcher
            willMountAction={willMountAction}
            greeted="world"
          />
          <ConnectedDispatcher renderAction={renderAction} greeted="world" />
        </Provider>
      )

      expect(markup).toContain('Hi world')
      expect(markup).toContain('Hiya world')
      expect(markup).toContain('Hey world')
      expect(store.getState().greeting).toContain('Hey')
    })
  })
})
