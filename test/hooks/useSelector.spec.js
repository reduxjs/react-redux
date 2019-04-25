/*eslint-disable react/prop-types*/

import React, { useReducer } from 'react'
import { createStore } from 'redux'
import { renderHook, act } from 'react-hooks-testing-library'
import * as rtl from 'react-testing-library'
import { Provider as ProviderMock, useSelector } from '../../src/index.js'
import { useReduxContext } from '../../src/hooks/useReduxContext'

describe('React', () => {
  describe('hooks', () => {
    describe('useSelector', () => {
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
          const { result } = renderHook(() => useSelector(s => s.count), {
            wrapper: props => <ProviderMock {...props} store={store} />
          })

          expect(result.current).toEqual(0)
        })

        it('selects the state and renders the component when the store updates', () => {
          const { result } = renderHook(() => useSelector(s => s.count), {
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
        it('subscribes to the store synchronously', () => {
          let rootSubscription

          const Parent = () => {
            const { subscription } = useReduxContext()
            rootSubscription = subscription
            const count = useSelector(s => s.count)
            return count === 1 ? <Child /> : null
          }

          const Child = () => {
            const count = useSelector(s => s.count)
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
            const count = useSelector(s => s.count)
            return count === 0 ? <Child /> : null
          }

          const Child = () => {
            const count = useSelector(s => s.count)
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
            const count = useSelector(s => s.count)
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
        it('should shallowly compare the selected state to prevent unnecessary updates', () => {
          store = createStore(
            ({ count, stable } = { count: -1, stable: {} }) => ({
              count: count + 1,
              stable
            })
          )

          const Comp = () => {
            const value = useSelector(s => Object.keys(s))
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

        it('re-uses the selector if deps do not change', () => {
          let selectorId = 0
          let forceRender

          const Comp = () => {
            const [, f] = useReducer(c => c + 1, 0)
            forceRender = f
            const renderedSelectorId = selectorId++
            const value = useSelector(() => renderedSelectorId, [])
            renderedItems.push(value)
            return <div />
          }

          rtl.render(
            <ProviderMock store={store}>
              <Comp />
            </ProviderMock>
          )

          rtl.act(forceRender)

          // this line verifies the susbcription callback uses the same memoized selector and therefore
          // does not cause a re-render
          store.dispatch({ type: '' })

          expect(renderedItems).toEqual([0, 0])
        })
      })

      describe('edge cases', () => {
        it('ignores transient errors in selector (e.g. due to stale props)', () => {
          const spy = jest.spyOn(console, 'error').mockImplementation(() => {})

          const Parent = () => {
            const count = useSelector(s => s.count)
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
            const result = useSelector(count => {
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
      })

      describe('error handling for invalid arguments', () => {
        it('throws if no selector is passed', () => {
          expect(() => useSelector()).toThrow()
        })
      })
    })
  })
})
