/*eslint-disable react/prop-types*/

import React from 'react'
import ReactDOMServer from 'react-dom/server'
import { createStore, combineReducers } from 'redux'
import { connect, Provider, ReactReduxContext } from '../../src/index'
import * as rtl from '@testing-library/react'
import type { Store } from 'redux'
import type { ReactNode } from 'react'
import type { ReactReduxContextValue } from '../../src/index'

describe('React', () => {
  /*
    For SSR to work, there are three options for injecting
    dynamic reducers:

    1. Make sure all dynamic reducers are known before rendering
       (requires keeping knowledge about this outside of the
       React component-tree)
    2. Double rendering (first render injects required reducers)
    3. Inject reducers as a side effect during the render phase
       (in construct or render), and try to control for any
       issues with that. This requires grabbing the store from
       context and possibly patching any storeState that exists
       on there, these are undocumented APIs that might change
       at any time.

    Because the tradeoffs in 1 and 2 are quite hefty and also
    because it's the popular approach, this test targets nr 3.
  */
  describe('dynamic reducers', () => {
    const InjectReducersContext = React.createContext<
      ((r: any) => void) | null
    >(null)

    type Reducer = (s: any) => any

    interface ReducersType {
      [x: string]: Reducer
    }

    interface ExtraReducersProviderPropsType {
      children: ReactNode
      reducers: ReducersType
    }
    interface ReduxContextType extends ReactReduxContextValue {
      storeState?: any
    }
    function ExtraReducersProvider({
      children,
      reducers,
    }: ExtraReducersProviderPropsType) {
      return (
        <InjectReducersContext.Consumer>
          {(injectReducers) => (
            <ReactReduxContext.Consumer>
              {(reduxContext) => {
                const latestState = reduxContext!.store.getState()
                const contextState = (reduxContext as ReduxContextType)
                  .storeState

                let shouldInject = false
                let shouldPatch = false

                for (const key of Object.keys(reducers)) {
                  // If any key does not exist in the latest version
                  // of the state, we need to inject reducers
                  if (!(key in latestState)) {
                    shouldInject = true
                  }
                  // If state exists on the context, and if any reducer
                  // key is not included there, we need to patch it up
                  // Only patching if storeState exists makes this test
                  // work with multiple React-Redux approaches
                  if (contextState && !(key in contextState)) {
                    shouldPatch = true
                  }
                }

                if (shouldInject) {
                  injectReducers!(reducers)
                }

                if (shouldPatch && reduxContext) {
                  // A safer way to do this would be to patch the storeState
                  // manually with the state from the new reducers, since
                  // this would better avoid tearing in a future concurrent world
                  const patchedReduxContext = {
                    ...reduxContext,
                    storeState: reduxContext!.store.getState(),
                  }
                  return (
                    <ReactReduxContext.Provider value={patchedReduxContext}>
                      {children}
                    </ReactReduxContext.Provider>
                  )
                }

                return children
              }}
            </ReactReduxContext.Consumer>
          )}
        </InjectReducersContext.Consumer>
      )
    }

    const initialReducer = {
      initial: (state = { greeting: 'Hello world' }) => state,
    }
    const dynamicReducer = {
      dynamic: (state = { greeting: 'Hello dynamic world' }) => state,
    }
    interface StateType {
      initial: GreeterTStateProps
      dynamic: GreeterTStateProps
    }
    interface GreeterTStateProps {
      greeting: string
    }

    function Greeter({ greeting }: GreeterTStateProps) {
      return <div>{greeting}</div>
    }

    const InitialGreeting = connect<
      GreeterTStateProps,
      unknown,
      unknown,
      StateType
    >((state) => ({
      greeting: state.initial.greeting,
    }))(Greeter)

    const DynamicGreeting = connect<
      GreeterTStateProps,
      unknown,
      unknown,
      StateType
    >((state) => ({
      greeting: state.dynamic.greeting,
    }))(Greeter)

    function createInjectReducers(store: Store, initialReducer: ReducersType) {
      let reducers = initialReducer
      return function injectReducers(newReducers: ReducersType) {
        reducers = { ...reducers, ...newReducers }
        store.replaceReducer(combineReducers(reducers))
      }
    }

    let store: Store
    let injectReducers: (r: any) => void

    beforeEach(() => {
      // These could be singletons on the client, but
      // need to be separate per request on the server
      store = createStore(combineReducers(initialReducer))
      injectReducers = createInjectReducers(store, initialReducer)
    })

    it('should render child with initial state on the client', () => {
      const { getByText } = rtl.render(
        <Provider store={store}>
          <InjectReducersContext.Provider value={injectReducers}>
            <InitialGreeting />
            <ExtraReducersProvider reducers={dynamicReducer}>
              <DynamicGreeting />
            </ExtraReducersProvider>
          </InjectReducersContext.Provider>
        </Provider>
      )

      getByText('Hello world')
      getByText('Hello dynamic world')
    })
    it('should render child with initial state on the server', () => {
      // In order to keep these tests together in the same file,
      // we aren't currently rendering this test in the node test
      // environment
      // This generates errors for using useLayoutEffect in v7
      // We hide that error by disabling console.error here

      jest.spyOn(console, 'error')
      // eslint-disable-next-line no-console
      // @ts-ignore
      console.error.mockImplementation(() => {})

      const markup = ReactDOMServer.renderToString(
        <Provider store={store}>
          <InjectReducersContext.Provider value={injectReducers}>
            <InitialGreeting />
            <ExtraReducersProvider reducers={dynamicReducer}>
              <DynamicGreeting />
            </ExtraReducersProvider>
          </InjectReducersContext.Provider>
        </Provider>
      )

      expect(markup).toContain('Hello world')
      expect(markup).toContain('Hello dynamic world')

      // eslint-disable-next-line no-console
      // @ts-ignore
      console.error.mockRestore()
    })
  })
})
