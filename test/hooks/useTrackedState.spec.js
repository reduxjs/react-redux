/*eslint-disable react/prop-types*/

import React from 'react'
import { createStore } from 'redux'
import { renderHook, act } from '@testing-library/react-hooks'
import * as rtl from '@testing-library/react'
import {
  Provider as ProviderMock,
  useTrackedState,
  createTrackedStateHook
} from '../../src/index.js'
import { useReduxContext } from '../../src/hooks/useReduxContext'

describe('React', () => {
  describe('hooks', () => {
    describe('useTrackedState', () => {
      let store
      let renderedItems = []

      beforeEach(() => {
        store = createStore(({ count } = { count: -1 }) => ({
          count: count + 1
        }))
        renderedItems = []
      })

      afterEach(() => rtl.cleanup())

      describe('core subscription behavior', () => {
        it('selects the state on initial render', () => {
          const { result } = renderHook(() => useTrackedState().count, {
            wrapper: props => <ProviderMock {...props} store={store} />
          })

          expect(result.current).toEqual(0)
        })

        it('selects the state and renders the component when the store updates', () => {
          const { result } = renderHook(() => useTrackedState().count, {
            wrapper: props => <ProviderMock {...props} store={store} />
          })

          expect(result.current).toEqual(0)

          act(() => {
            store.dispatch({ type: '' })
          })

          expect(result.current).toEqual(1)
        })
      })

      describe('lifeycle interactions', () => {
        it('always uses the latest state', () => {
          store = createStore(c => c + 1, -1)

          const Comp = () => {
            const value = useTrackedState() + 1
            renderedItems.push(value)
            return <div />
          }

          rtl.render(
            <ProviderMock store={store}>
              <Comp />
            </ProviderMock>
          )

          expect(renderedItems).toEqual([1])

          store.dispatch({ type: '' })

          expect(renderedItems).toEqual([1, 2])
        })

        it('subscribes to the store synchronously', () => {
          let rootSubscription

          const Parent = () => {
            const { subscription } = useReduxContext()
            rootSubscription = subscription
            const count = useTrackedState().count
            return count === 1 ? <Child /> : null
          }

          const Child = () => {
            const count = useTrackedState().count
            return <div>{count}</div>
          }

          rtl.render(
            <ProviderMock store={store}>
              <Parent />
            </ProviderMock>
          )

          expect(rootSubscription.listeners.get().length).toBe(1)

          store.dispatch({ type: '' })

          expect(rootSubscription.listeners.get().length).toBe(2)
        })

        it('unsubscribes when the component is unmounted', () => {
          let rootSubscription

          const Parent = () => {
            const { subscription } = useReduxContext()
            rootSubscription = subscription
            const count = useTrackedState().count
            return count === 0 ? <Child /> : null
          }

          const Child = () => {
            const count = useTrackedState().count
            return <div>{count}</div>
          }

          rtl.render(
            <ProviderMock store={store}>
              <Parent />
            </ProviderMock>
          )

          expect(rootSubscription.listeners.get().length).toBe(2)

          store.dispatch({ type: '' })

          expect(rootSubscription.listeners.get().length).toBe(1)
        })

        it('notices store updates between render and store subscription effect', () => {
          const Comp = () => {
            const count = useTrackedState().count
            renderedItems.push(count)

            // I don't know a better way to trigger a store update before the
            // store subscription effect happens
            if (count === 0) {
              store.dispatch({ type: '' })
            }

            return <div>{count}</div>
          }

          rtl.render(
            <ProviderMock store={store}>
              <Comp />
            </ProviderMock>
          )

          expect(renderedItems).toEqual([0, 1])
        })
      })

      describe('performance optimizations and bail-outs', () => {
        it('defaults to ref-equality to prevent unnecessary updates', () => {
          const state = {}
          store = createStore(() => ({ obj: state }))

          const Comp = () => {
            const value = useTrackedState().obj
            renderedItems.push(value)
            return <div />
          }

          rtl.render(
            <ProviderMock store={store}>
              <Comp />
            </ProviderMock>
          )

          expect(renderedItems.length).toBe(1)

          store.dispatch({ type: '' })

          expect(renderedItems.length).toBe(1)
        })
      })

      describe('tracked cases', () => {
        it('only re-render used prop is changed', () => {
          store = createStore(
            ({ count1, count2 } = { count1: -1, count2: 9 }) => ({
              count1: count1 + 1,
              count2: count2
            })
          )

          const Comp1 = () => {
            const value = useTrackedState().count1
            renderedItems.push(value)
            return <div />
          }

          const Comp2 = () => {
            const value = useTrackedState().count2
            renderedItems.push(value)
            return <div />
          }

          rtl.render(
            <ProviderMock store={store}>
              <Comp1 />
              <Comp2 />
            </ProviderMock>
          )

          expect(renderedItems).toEqual([0, 9])

          store.dispatch({ type: '' })

          expect(renderedItems).toEqual([0, 9, 1])
        })
      })
    })

    describe('createTrackedStateHook', () => {
      let defaultStore
      let customStore

      beforeEach(() => {
        defaultStore = createStore(({ count } = { count: -1 }) => ({
          count: count + 1
        }))
        customStore = createStore(({ count } = { count: 10 }) => ({
          count: count + 2
        }))
      })

      afterEach(() => rtl.cleanup())

      it('subscribes to the correct store', () => {
        const nestedContext = React.createContext(null)
        const useCustomTrackedState = createTrackedStateHook(nestedContext)
        let defaultCount = null
        let customCount = null

        const DisplayDefaultCount = ({ children = null }) => {
          const count = useTrackedState().count
          defaultCount = count
          return <>{children}</>
        }
        const DisplayCustomCount = ({ children = null }) => {
          const count = useCustomTrackedState().count
          customCount = count
          return <>{children}</>
        }

        rtl.render(
          <ProviderMock store={defaultStore}>
            <ProviderMock context={nestedContext} store={customStore}>
              <DisplayCustomCount>
                <DisplayDefaultCount />
              </DisplayCustomCount>
            </ProviderMock>
          </ProviderMock>
        )

        expect(defaultCount).toBe(0)
        expect(customCount).toBe(12)
      })
    })
  })
})
