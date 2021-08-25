/*eslint-disable react/prop-types*/

import React, { useCallback, useReducer, useLayoutEffect } from 'react'
import { createStore } from 'redux'
import { renderHook, act } from '@testing-library/react-hooks'
import * as rtl from '@testing-library/react'
import {
  Provider as ProviderMock,
  useSelector,
  shallowEqual,
  connect,
  createSelectorHook,
} from '../../src/index.js'
import { useReduxContext } from '../../src/hooks/useReduxContext'

describe('React', () => {
  describe('hooks', () => {
    describe('useSelector', () => {
      let store
      let renderedItems = []

      beforeEach(() => {
        store = createStore(({ count } = { count: -1 }) => ({
          count: count + 1,
        }))
        renderedItems = []
      })

      afterEach(() => rtl.cleanup())

      describe('core subscription behavior', () => {
        it('selects the state on initial render', () => {
          const { result } = renderHook(() => useSelector((s) => s.count), {
            wrapper: (props) => <ProviderMock {...props} store={store} />,
          })

          expect(result.current).toEqual(0)
        })

        it('selects the state and renders the component when the store updates', () => {
          const selector = jest.fn((s) => s.count)

          const { result } = renderHook(() => useSelector(selector), {
            wrapper: (props) => <ProviderMock {...props} store={store} />,
          })

          expect(result.current).toEqual(0)
          expect(selector).toHaveBeenCalledTimes(1)

          act(() => {
            store.dispatch({ type: '' })
          })

          expect(result.current).toEqual(1)
          expect(selector).toHaveBeenCalledTimes(2)
        })
      })

      describe('lifecycle interactions', () => {
        it('always uses the latest state', () => {
          store = createStore((c) => c + 1, -1)

          const Comp = () => {
            const selector = useCallback((c) => c + 1, [])
            const value = useSelector(selector)
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
            const count = useSelector((s) => s.count)
            return count === 1 ? <Child /> : null
          }

          const Child = () => {
            const count = useSelector((s) => s.count)
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
            const count = useSelector((s) => s.count)
            return count === 0 ? <Child /> : null
          }

          const Child = () => {
            const count = useSelector((s) => s.count)
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
            const count = useSelector((s) => s.count)
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

      it('works properly with memoized selector with dispatch in Child useLayoutEffect', () => {
        store = createStore((c) => c + 1, -1)

        const Comp = () => {
          const selector = useCallback((c) => c, [])
          const count = useSelector(selector)
          renderedItems.push(count)
          return <Child parentCount={count} />
        }

        const Child = ({ parentCount }) => {
          useLayoutEffect(() => {
            if (parentCount === 1) {
              store.dispatch({ type: '' })
            }
          }, [parentCount])
          return <div>{parentCount}</div>
        }

        rtl.render(
          <ProviderMock store={store}>
            <Comp />
          </ProviderMock>
        )

        // The first render doesn't trigger dispatch
        expect(renderedItems).toEqual([0])

        // This dispatch triggers another dispatch in useLayoutEffect
        rtl.act(() => {
          store.dispatch({ type: '' })
        })

        expect(renderedItems).toEqual([0, 1, 2])
      })

      describe('performance optimizations and bail-outs', () => {
        it('defaults to ref-equality to prevent unnecessary updates', () => {
          const state = {}
          store = createStore(() => state)

          const Comp = () => {
            const value = useSelector((s) => s)
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

        it('allows other equality functions to prevent unnecessary updates', () => {
          store = createStore(
            ({ count, stable } = { count: -1, stable: {} }) => ({
              count: count + 1,
              stable,
            })
          )

          const Comp = () => {
            const value = useSelector((s) => Object.keys(s), shallowEqual)
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

        it('calls selector exactly once on mount and on update', () => {
          store = createStore(({ count } = { count: 0 }) => ({
            count: count + 1,
          }))

          let numCalls = 0
          const selector = (s) => {
            numCalls += 1
            return s.count
          }
          const renderedItems = []

          const Comp = () => {
            const value = useSelector(selector)
            renderedItems.push(value)
            return <div />
          }

          rtl.render(
            <ProviderMock store={store}>
              <Comp />
            </ProviderMock>
          )

          expect(numCalls).toBe(1)
          expect(renderedItems.length).toEqual(1)

          store.dispatch({ type: '' })

          expect(numCalls).toBe(2)
          expect(renderedItems.length).toEqual(2)
        })

        it('calls selector twice once on mount when state changes during render', () => {
          store = createStore(({ count } = { count: 0 }) => ({
            count: count + 1,
          }))

          let numCalls = 0
          const selector = (s) => {
            numCalls += 1
            return s.count
          }
          const renderedItems = []

          const Child = () => {
            useLayoutEffect(() => {
              store.dispatch({ type: '', count: 1 })
            }, [])
            return <div />
          }

          const Comp = () => {
            const value = useSelector(selector)
            renderedItems.push(value)
            return (
              <div>
                <Child />
              </div>
            )
          }

          rtl.render(
            <ProviderMock store={store}>
              <Comp />
            </ProviderMock>
          )

          // Selector first called on Comp mount, and then re-invoked after mount due to useLayoutEffect dispatching event
          expect(numCalls).toBe(2)
          expect(renderedItems.length).toEqual(2)
        })
      })

      it('uses the latest selector', () => {
        let selectorId = 0
        let forceRender

        const Comp = () => {
          const [, f] = useReducer((c) => c + 1, 0)
          forceRender = f
          const renderedSelectorId = selectorId++
          const value = useSelector(() => renderedSelectorId)
          renderedItems.push(value)
          return <div />
        }

        rtl.render(
          <ProviderMock store={store}>
            <Comp />
          </ProviderMock>
        )

        expect(renderedItems).toEqual([0])

        rtl.act(forceRender)
        expect(renderedItems).toEqual([0, 1])

        rtl.act(() => {
          store.dispatch({ type: '' })
        })
        expect(renderedItems).toEqual([0, 1])

        rtl.act(forceRender)
        expect(renderedItems).toEqual([0, 1, 2])
      })

      describe('edge cases', () => {
        it('ignores transient errors in selector (e.g. due to stale props)', () => {
          const spy = jest.spyOn(console, 'error').mockImplementation(() => {})

          const Parent = () => {
            const count = useSelector((s) => s.count)
            return <Child parentCount={count} />
          }

          const Child = ({ parentCount }) => {
            const result = useSelector(({ count }) => {
              if (count !== parentCount) {
                throw new Error()
              }

              return count + parentCount
            })

            return <div>{result}</div>
          }

          rtl.render(
            <ProviderMock store={store}>
              <Parent />
            </ProviderMock>
          )

          expect(() => store.dispatch({ type: '' })).not.toThrowError()

          spy.mockRestore()
        })

        it('correlates the subscription callback error with a following error during rendering', () => {
          const spy = jest.spyOn(console, 'error').mockImplementation(() => {})

          const Comp = () => {
            const result = useSelector((count) => {
              if (count > 0) {
                throw new Error('foo')
              }

              return count
            })

            return <div>{result}</div>
          }

          const store = createStore((count = -1) => count + 1)

          const App = () => (
            <ProviderMock store={store}>
              <Comp />
            </ProviderMock>
          )

          rtl.render(<App />)

          expect(() => store.dispatch({ type: '' })).toThrow(
            /The error may be correlated/
          )

          spy.mockRestore()
        })

        it('re-throws errors from the selector that only occur during rendering', () => {
          const spy = jest.spyOn(console, 'error').mockImplementation(() => {})

          const Parent = () => {
            const count = useSelector((s) => s.count)
            return <Child parentCount={count} />
          }

          const Child = ({ parentCount }) => {
            const result = useSelector(({ count }) => {
              if (parentCount > 0) {
                throw new Error()
              }

              return count + parentCount
            })

            return <div>{result}</div>
          }

          rtl.render(
            <ProviderMock store={store}>
              <Parent />
            </ProviderMock>
          )

          expect(() => store.dispatch({ type: '' })).toThrowError()

          spy.mockRestore()
        })

        it('allows dealing with stale props by putting a specific connected component above the hooks component', () => {
          const spy = jest.spyOn(console, 'error').mockImplementation(() => {})

          const Parent = () => {
            const count = useSelector((s) => s.count)
            return <ConnectedWrapper parentCount={count} />
          }

          const ConnectedWrapper = connect(({ count }) => ({ count }))(
            ({ parentCount }) => {
              return <Child parentCount={parentCount} />
            }
          )

          let sawInconsistentState = false

          const Child = ({ parentCount }) => {
            const result = useSelector(({ count }) => {
              if (count !== parentCount) {
                sawInconsistentState = true
              }

              return count + parentCount
            })

            return <div>{result}</div>
          }

          rtl.render(
            <ProviderMock store={store}>
              <Parent />
            </ProviderMock>
          )

          store.dispatch({ type: '' })

          expect(sawInconsistentState).toBe(false)

          spy.mockRestore()
        })

        it('reuse latest selected state on selector re-run', () => {
          store = createStore(({ count } = { count: -1 }) => ({
            count: count + 1,
          }))

          const alwaysEqual = () => true

          const Comp = () => {
            // triggers render on store change
            useSelector((s) => s.count)
            const array = useSelector(() => [1, 2, 3], alwaysEqual)
            renderedItems.push(array)
            return <div />
          }

          rtl.render(
            <ProviderMock store={store}>
              <Comp />
            </ProviderMock>
          )

          expect(renderedItems.length).toBe(1)

          store.dispatch({ type: '' })

          expect(renderedItems.length).toBe(2)
          expect(renderedItems[0]).toBe(renderedItems[1])
        })
      })

      describe('error handling for invalid arguments', () => {
        it('throws if no selector is passed', () => {
          expect(() => useSelector()).toThrow()
        })

        it('throws if selector is not a function', () => {
          expect(() => useSelector(1)).toThrow()
        })

        it('throws if equality function is not a function', () => {
          expect(() => useSelector((s) => s.count, 1)).toThrow()
        })
      })
    })

    describe('createSelectorHook', () => {
      let defaultStore
      let customStore

      beforeEach(() => {
        defaultStore = createStore(({ count } = { count: -1 }) => ({
          count: count + 1,
        }))
        customStore = createStore(({ count } = { count: 10 }) => ({
          count: count + 2,
        }))
      })

      it('subscribes to the correct store', () => {
        const nestedContext = React.createContext(null)
        const useCustomSelector = createSelectorHook(nestedContext)
        let defaultCount = null
        let customCount = null

        const getCount = (s) => s.count

        const DisplayDefaultCount = ({ children = null }) => {
          const count = useSelector(getCount)
          defaultCount = count
          return <>{children}</>
        }
        const DisplayCustomCount = ({ children = null }) => {
          const count = useCustomSelector(getCount)
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
