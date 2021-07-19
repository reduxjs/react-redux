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
} from '../../src/index'
import { useReduxContext } from '../../src/hooks/useReduxContext'
import type { FunctionComponent, DispatchWithoutAction, ReactNode } from 'react'
import type { Store, AnyAction } from 'redux'
import type { ProviderProps, TypedUseSelectorHook } from '../../src/'
import type { Subscription } from '../../src/utils/Subscription'
import type { ReactReduxContextValue } from '../../src/components/Context'

describe('React', () => {
  describe('hooks', () => {
    describe('useSelector', () => {
      type NormalStateType = {
        count: number
      }
      let normalStore: Store<NormalStateType, AnyAction>
      let renderedItems: any[] = []
      type RootState = ReturnType<typeof normalStore.getState>
      let useNormalSelector: TypedUseSelectorHook<RootState> = useSelector

      beforeEach(() => {
        normalStore = createStore(
          ({ count }: NormalStateType = { count: -1 }): NormalStateType => ({
            count: count + 1,
          })
        )
        renderedItems = []
      })

      afterEach(() => rtl.cleanup())

      describe('core subscription behavior', () => {
        type PropsTypeDelStore = Omit<ProviderProps, 'store'>

        it('selects the state on initial render', () => {
          const { result } = renderHook(
            () => useNormalSelector((s) => s.count),
            {
              wrapper: (props: PropsTypeDelStore) => (
                <ProviderMock {...props} store={normalStore} />
              ),
            }
          )

          expect(result.current).toEqual(0)
        })

        it('selects the state and renders the component when the store updates', () => {
          type MockParams = [NormalStateType]
          const selector: jest.Mock<number, MockParams> = jest.fn(
            (s) => s.count
          )

          const { result } = renderHook(() => useNormalSelector(selector), {
            wrapper: (props: PropsTypeDelStore) => (
              <ProviderMock {...props} store={normalStore} />
            ),
          })

          expect(result.current).toEqual(0)
          expect(selector).toHaveBeenCalledTimes(2)

          act(() => {
            normalStore.dispatch({ type: '' })
          })

          expect(result.current).toEqual(1)
          expect(selector).toHaveBeenCalledTimes(3)
        })
      })

      describe('lifecycle interactions', () => {
        it('always uses the latest state', () => {
          const store = createStore((c: number = 1): number => c + 1, -1)

          const Comp = () => {
            const selector = useCallback((c: number): number => c + 1, [])
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
          let rootSubscription: Subscription

          const Parent = () => {
            const { subscription } = useReduxContext() as ReactReduxContextValue
            rootSubscription = subscription
            const count = useNormalSelector((s) => s.count)
            return count === 1 ? <Child /> : null
          }

          const Child = () => {
            const count = useNormalSelector((s) => s.count)
            return <div>{count}</div>
          }

          rtl.render(
            <ProviderMock store={normalStore}>
              <Parent />
            </ProviderMock>
          )
          // @ts-ignore   ts(2454)
          expect(rootSubscription.getListeners().get().length).toBe(1)

          normalStore.dispatch({ type: '' })
          // @ts-ignore   ts(2454)
          expect(rootSubscription.getListeners().get().length).toBe(2)
        })

        it('unsubscribes when the component is unmounted', () => {
          let rootSubscription: Subscription

          const Parent = () => {
            const { subscription } = useReduxContext() as ReactReduxContextValue
            rootSubscription = subscription
            const count = useNormalSelector((s) => s.count)
            return count === 0 ? <Child /> : null
          }

          const Child = () => {
            const count = useNormalSelector((s) => s.count)
            return <div>{count}</div>
          }

          rtl.render(
            <ProviderMock store={normalStore}>
              <Parent />
            </ProviderMock>
          )
          // @ts-ignore   ts(2454)
          expect(rootSubscription.getListeners().get().length).toBe(2)

          normalStore.dispatch({ type: '' })
          // @ts-ignore   ts(2454)
          expect(rootSubscription.getListeners().get().length).toBe(1)
        })

        it('notices store updates between render and store subscription effect', () => {
          const Comp = () => {
            const count = useNormalSelector((s) => s.count)
            renderedItems.push(count)

            // I don't know a better way to trigger a store update before the
            // store subscription effect happens
            if (count === 0) {
              normalStore.dispatch({ type: '' })
            }

            return <div>{count}</div>
          }

          rtl.render(
            <ProviderMock store={normalStore}>
              <Comp />
            </ProviderMock>
          )

          expect(renderedItems).toEqual([0, 1])
        })
      })

      it('works properly with memoized selector with dispatch in Child useLayoutEffect', () => {
        const store = createStore((c: number = 1): number => c + 1, -1)

        const Comp = () => {
          const selector = useCallback((c: number): number => c, [])
          const count = useSelector(selector)
          renderedItems.push(count)
          return <Child parentCount={count} />
        }

        interface ChildPropsType {
          parentCount: number
        }

        const Child = ({ parentCount }: ChildPropsType) => {
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
          const store = createStore(() => state)

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
          interface StateType {
            count: number
            stable: {}
          }
          const store = createStore(
            ({ count, stable }: StateType = { count: -1, stable: {} }) => ({
              count: count + 1,
              stable,
            })
          )

          const Comp = () => {
            const value = useSelector<StateType, string[]>((s) => {
              return Object.keys(s)
            }, shallowEqual)
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

      it('uses the latest selector', () => {
        let selectorId = 0
        let forceRender: DispatchWithoutAction

        const Comp = () => {
          const [, f] = useReducer((c) => c + 1, 0)
          forceRender = f
          const renderedSelectorId = selectorId++
          const value = useSelector(() => renderedSelectorId)
          renderedItems.push(value)
          return <div />
        }

        rtl.render(
          <ProviderMock store={normalStore}>
            <Comp />
          </ProviderMock>
        )

        expect(renderedItems).toEqual([0])

        rtl.act(() => {
          forceRender()
        })
        expect(renderedItems).toEqual([0, 1])

        rtl.act(() => {
          normalStore.dispatch({ type: '' })
        })
        expect(renderedItems).toEqual([0, 1])

        rtl.act(() => {
          forceRender()
        })
        expect(renderedItems).toEqual([0, 1, 2])
      })

      describe('edge cases', () => {
        interface ChildPropsType {
          parentCount: number
        }
        it('ignores transient errors in selector (e.g. due to stale props)', () => {
          const spy = jest.spyOn(console, 'error').mockImplementation(() => {})

          const Parent = () => {
            const count = useNormalSelector((s) => s.count)
            return <Child parentCount={count} />
          }
          const Child = ({ parentCount }: ChildPropsType) => {
            const result = useNormalSelector(({ count }) => {
              if (count !== parentCount) {
                throw new Error()
              }

              return count + parentCount
            })

            return <div>{result}</div>
          }

          rtl.render(
            <ProviderMock store={normalStore}>
              <Parent />
            </ProviderMock>
          )

          expect(() => normalStore.dispatch({ type: '' })).not.toThrowError()

          spy.mockRestore()
        })

        it('correlates the subscription callback error with a following error during rendering', () => {
          const spy = jest.spyOn(console, 'error').mockImplementation(() => {})

          const Comp = () => {
            const result = useSelector((count: number) => {
              if (count > 0) {
                throw new Error('foo')
              }

              return count
            })

            return <div>{result}</div>
          }

          const store = createStore((count: number = -1): number => count + 1)

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
            const count = useNormalSelector((s) => s.count)
            return <Child parentCount={count} />
          }

          const Child = ({ parentCount }: ChildPropsType) => {
            const result = useNormalSelector(({ count }) => {
              if (parentCount > 0) {
                throw new Error()
              }

              return count + parentCount
            })

            return <div>{result}</div>
          }

          rtl.render(
            <ProviderMock store={normalStore}>
              <Parent />
            </ProviderMock>
          )

          expect(() => normalStore.dispatch({ type: '' })).toThrowError()

          spy.mockRestore()
        })

        it('allows dealing with stale props by putting a specific connected component above the hooks component', () => {
          const spy = jest.spyOn(console, 'error').mockImplementation(() => {})

          const Parent = () => {
            const count = useNormalSelector((s) => s.count)
            return <ConnectedWrapper parentCount={count} />
          }

          const ConnectedWrapper = connect<
            NormalStateType,
            undefined,
            ChildPropsType,
            NormalStateType
          >(({ count }) => ({
            count,
          }))<FunctionComponent<ChildPropsType>>(({ parentCount }) => {
            return <Child parentCount={parentCount} />
          })

          let sawInconsistentState = false

          const Child = ({ parentCount }: ChildPropsType) => {
            const result = useNormalSelector(({ count }) => {
              if (count !== parentCount) {
                sawInconsistentState = true
              }

              return count + parentCount
            })

            return <div>{result}</div>
          }

          rtl.render(
            <ProviderMock store={normalStore}>
              <Parent />
            </ProviderMock>
          )

          normalStore.dispatch({ type: '' })

          expect(sawInconsistentState).toBe(false)

          spy.mockRestore()
        })

        it('reuse latest selected state on selector re-run', () => {
          const alwaysEqual = () => true

          const Comp = () => {
            // triggers render on store change
            useNormalSelector((s) => s.count)
            const array = useSelector(() => [1, 2, 3], alwaysEqual)
            renderedItems.push(array)
            return <div />
          }

          rtl.render(
            <ProviderMock store={normalStore}>
              <Comp />
            </ProviderMock>
          )

          expect(renderedItems.length).toBe(1)

          normalStore.dispatch({ type: '' })

          expect(renderedItems.length).toBe(2)
          expect(renderedItems[0]).toBe(renderedItems[1])
        })
      })

      describe('error handling for invalid arguments', () => {
        it('throws if no selector is passed', () => {
          //@ts-expect-error
          expect(() => useSelector()).toThrow()
        })

        it('throws if selector is not a function', () => {
          //@ts-expect-error
          expect(() => useSelector(1)).toThrow()
        })

        it('throws if equality function is not a function', () => {
          expect(() =>
            //@ts-expect-error
            useNormalSelector((s) => s.count, 1)
          ).toThrow()
        })
      })
    })

    describe('createSelectorHook', () => {
      let defaultStore: Store
      let customStore: Store
      type StateType = {
        count: number
      }

      beforeEach(() => {
        defaultStore = createStore(({ count }: StateType = { count: -1 }) => ({
          count: count + 1,
        }))
        customStore = createStore(({ count }: StateType = { count: 10 }) => ({
          count: count + 2,
        }))
      })

      it('subscribes to the correct store', () => {
        const nestedContext =
          React.createContext<ReactReduxContextValue | null>(null)
        const useCustomSelector = createSelectorHook(nestedContext)
        let defaultCount = null
        let customCount = null

        const getCount = (s: StateType) => s.count

        const DisplayDefaultCount = ({ children = null }) => {
          const count = useSelector<StateType>(getCount)
          defaultCount = count
          return <>{children}</>
        }
        interface DisplayCustomCountType {
          children: ReactNode
        }
        const DisplayCustomCount = ({ children }: DisplayCustomCountType) => {
          const count = useCustomSelector<StateType>(getCount)
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
