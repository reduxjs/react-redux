/*eslint-disable react/prop-types*/

import React, {
  useCallback,
  useReducer,
  useLayoutEffect,
  useState,
  useContext,
} from 'react'
import { createStore } from 'redux'
import * as rtl from '@testing-library/react'
import {
  Provider,
  useSelector,
  useDispatch,
  shallowEqual,
  connect,
  createSelectorHook,
  ReactReduxContext,
} from '../../src/index'
import type {
  TypedUseSelectorHook,
  ReactReduxContextValue,
  ProviderProps,
  Subscription,
} from '../../src/index'
import type { FunctionComponent, DispatchWithoutAction, ReactNode } from 'react'
import type { Store, AnyAction, Action } from 'redux'
import { createSlice, configureStore, PayloadAction } from '@reduxjs/toolkit'
import type { UseSelectorOptions } from '../../src/hooks/useSelector'

// disable checks by default
function ProviderMock<A extends Action<any> = AnyAction, S = unknown>({
  stabilityCheck = 'never',
  noopCheck = 'never',
  ...props
}: ProviderProps<A, S>) {
  return (
    <Provider
      {...props}
      stabilityCheck={stabilityCheck}
      noopCheck={noopCheck}
    />
  )
}

const IS_REACT_18 = React.version.startsWith('18')

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
        it('selects the state on initial render', () => {
          let result: number | undefined
          const Comp = () => {
            const count = useNormalSelector((state) => state.count)

            useLayoutEffect(() => {
              result = count
            }, [])
            return <div>{count}</div>
          }

          rtl.render(
            <ProviderMock store={normalStore}>
              <Comp />
            </ProviderMock>
          )

          expect(result).toEqual(0)
        })

        it('selects the state and renders the component when the store updates', () => {
          const selector = jest.fn((s: NormalStateType) => {
            //console.log('Running selector: `s.count`')
            return s.count
          })
          let result: number | undefined
          const Comp = () => {
            const count = useNormalSelector(selector)

            useLayoutEffect(() => {
              result = count
            })
            return <div>{count}</div>
          }

          rtl.render(
            <ProviderMock store={normalStore}>
              <Comp />
            </ProviderMock>
          )

          expect(result).toEqual(0)
          expect(selector).toHaveBeenCalledTimes(1)

          rtl.act(() => {
            normalStore.dispatch({ type: '' })
          })

          expect(result).toEqual(1)
          expect(selector).toHaveBeenCalledTimes(2)
        })
      })

      describe('lifecycle interactions', () => {
        it('always uses the latest state', () => {
          // const store = createStore((c: number = 1): number => c + 1, -1)

          const Comp = () => {
            const selector = useCallback(
              (state: NormalStateType) => state.count + 1,
              []
            )
            const value = useSelector(selector)
            renderedItems.push(value)
            return <div />
          }

          rtl.render(
            <ProviderMock store={normalStore}>
              <Comp />
            </ProviderMock>
          )

          expect(renderedItems).toEqual([1])

          rtl.act(() => {
            normalStore.dispatch({ type: '' })
          })

          expect(renderedItems).toEqual([1, 2])
        })

        it('subscribes to the store synchronously', () => {
          let appSubscription: Subscription | null = null

          const Child = () => {
            const count = useNormalSelector((s) => s.count)
            return <div>{count}</div>
          }

          const Parent = () => {
            const { subscription } = useContext(ReactReduxContext)
            appSubscription = subscription
            const count = useNormalSelector((s) => s.count)
            return count === 1 ? <Child /> : null
          }

          rtl.render(
            <ProviderMock store={normalStore}>
              <Parent />
            </ProviderMock>
          )
          // Parent component only
          expect(appSubscription!.getListeners().get().length).toBe(1)

          rtl.act(() => {
            normalStore.dispatch({ type: '' })
          })

          // Parent component + 1 child component
          expect(appSubscription!.getListeners().get().length).toBe(2)
        })

        it('unsubscribes when the component is unmounted', () => {
          let appSubscription: Subscription | null = null

          const Parent = () => {
            const { subscription } = useContext(ReactReduxContext)
            appSubscription = subscription
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
          // Parent + 1 child component
          expect(appSubscription!.getListeners().get().length).toBe(2)

          rtl.act(() => {
            normalStore.dispatch({ type: '' })
          })

          // Parent component only
          expect(appSubscription!.getListeners().get().length).toBe(1)
        })

        it('notices store updates between render and store subscription effect', () => {
          const Child = ({ count }: { count: number }) => {
            // console.log('Child rendering')
            useLayoutEffect(() => {
              // console.log('Child layoutEffect: ', count)
              if (count === 0) {
                // console.log('Dispatching store update')
                normalStore.dispatch({ type: '' })
              }
            }, [count])
            return null
          }
          const Comp = () => {
            // console.log('Parent rendering, selecting state')
            const count = useNormalSelector((s) => s.count)

            useLayoutEffect(() => {
              // console.log('Parent layoutEffect: ', count)
              renderedItems.push(count)
            })

            return (
              <div>
                {count}
                <Child count={count} />
              </div>
            )
          }

          // console.log('Starting initial render')
          rtl.render(
            <ProviderMock store={normalStore}>
              <Comp />
            </ProviderMock>
          )

          // With `useSyncExternalStore`, we get three renders of `<Comp>`:
          // 1) Initial render, count is 0
          // 2) Render due to dispatch, still sync in the initial render's commit phase
          expect(renderedItems).toEqual([0, 1])
        })
      })

      it('works properly with memoized selector with dispatch in Child useLayoutEffect', () => {
        //const store = createStore((c: number = 1): number => c + 1, -1)

        const Comp = () => {
          const selector = useCallback(
            (state: NormalStateType) => state.count,
            []
          )
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
              normalStore.dispatch({ type: '' })
            }
          }, [parentCount])
          return <div>{parentCount}</div>
        }

        rtl.render(
          <ProviderMock store={normalStore}>
            <Comp />
          </ProviderMock>
        )

        // The first render doesn't trigger dispatch
        expect(renderedItems).toEqual([0])

        // This dispatch triggers another dispatch in useLayoutEffect
        rtl.act(() => {
          normalStore.dispatch({ type: '' })
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

          rtl.act(() => {
            store.dispatch({ type: '' })
          })

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
            const value = useSelector(
              (s: StateType) => Object.keys(s),
              shallowEqual
            )
            renderedItems.push(value)
            return <div />
          }

          const Comp2 = () => {
            const value = useSelector((s: StateType) => Object.keys(s), {
              equalityFn: shallowEqual,
            })
            renderedItems.push(value)
            return <div />
          }

          rtl.render(
            <ProviderMock store={store}>
              <Comp />
              <Comp2 />
            </ProviderMock>
          )

          expect(renderedItems.length).toBe(2)

          rtl.act(() => {
            store.dispatch({ type: '' })
          })

          expect(renderedItems.length).toBe(2)
        })

        it('calls selector exactly once on mount and on update', () => {
          interface StateType {
            count: number
          }
          const store = createStore(({ count }: StateType = { count: 0 }) => ({
            count: count + 1,
          }))

          const selector = jest.fn((s: StateType) => {
            return s.count
          })
          const renderedItems: number[] = []

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

          expect(selector).toHaveBeenCalledTimes(1)
          expect(renderedItems.length).toEqual(1)

          rtl.act(() => {
            store.dispatch({ type: '' })
          })

          expect(selector).toHaveBeenCalledTimes(2)
          expect(renderedItems.length).toEqual(2)
        })

        it('calls selector twice once on mount when state changes during render', () => {
          interface StateType {
            count: number
          }
          const store = createStore(({ count }: StateType = { count: 0 }) => ({
            count: count + 1,
          }))

          const selector = jest.fn((s: StateType) => {
            return s.count
          })
          const renderedItems: number[] = []

          const Child = () => {
            useLayoutEffect(() => {
              store.dispatch({ type: '', count: 1 })
            }, [])
            return <div />
          }

          const Comp = () => {
            const value = useSelector(selector)

            useLayoutEffect(() => {
              renderedItems.push(value)
            })

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
          expect(selector).toHaveBeenCalledTimes(2)
          expect(renderedItems.length).toEqual(2)
        })

        it('only re-runs selectors if the referenced fields actually change', () => {
          interface StateType {
            count1: number
            count2: number
            count3: number
          }

          const initialState: StateType = {
            count1: 0,
            count2: 0,
            count3: 0,
          }

          const countersSlice = createSlice({
            name: 'counters',
            initialState,
            reducers: {
              increment1: (state) => {
                state.count1++
              },
              increment2: (state) => {
                state.count2++
              },
              increment3: (state) => {
                state.count3++
              },
            },
          })

          const store = configureStore({
            reducer: countersSlice.reducer,
          })

          const selector1 = jest.fn((s: StateType) => {
            return s.count1
          })
          const selector2 = jest.fn((s: StateType) => {
            return s.count2
          })
          const selector3 = jest.fn((s: StateType) => {
            return s.count3
          })
          const renderedItems: number[] = []

          let subscription: Subscription

          const Comp = () => {
            subscription = useContext(ReactReduxContext).subscription
            const c1 = useSelector(selector1)
            const c2 = useSelector(selector2)
            const c3 = useSelector(selector3)

            return null
          }

          rtl.render(
            <ProviderMock store={store}>
              <Comp />
            </ProviderMock>
          )

          const listeners = subscription!.getListeners().get()

          expect(listeners.length).toBe(3)

          // Selector first called on Comp mount, and then re-invoked after mount due to useLayoutEffect dispatching event
          expect(selector1).toHaveBeenCalledTimes(1)
          expect(selector2).toHaveBeenCalledTimes(1)
          expect(selector3).toHaveBeenCalledTimes(1)

          expect(listeners[0].selectorCache!.cache.needsRecalculation()).toBe(
            false
          )
          expect(listeners[1].selectorCache!.cache.needsRecalculation()).toBe(
            false
          )
          expect(listeners[2].selectorCache!.cache.needsRecalculation()).toBe(
            false
          )

          rtl.act(() => {
            store.dispatch(countersSlice.actions.increment1())
            console.log('Dispatch complete')

            expect(selector1).toHaveBeenCalledTimes(2)
            expect(selector2).toHaveBeenCalledTimes(1)
            expect(selector3).toHaveBeenCalledTimes(1)
          })

          rtl.act(() => {
            store.dispatch(countersSlice.actions.increment2())

            expect(selector1).toHaveBeenCalledTimes(2)
            expect(selector2).toHaveBeenCalledTimes(2)
            expect(selector3).toHaveBeenCalledTimes(1)
          })

          rtl.act(() => {
            store.dispatch(countersSlice.actions.increment3())

            expect(selector1).toHaveBeenCalledTimes(2)
            expect(selector2).toHaveBeenCalledTimes(2)
            expect(selector3).toHaveBeenCalledTimes(2)
          })
        })
      })

      it('uses the latest selector', () => {
        let selectorId = 0
        let forceRender: DispatchWithoutAction

        const Comp = () => {
          const [, f] = useReducer((c) => c + 1, 0)
          forceRender = f
          const renderedSelectorId = selectorId++
          const value = useSelector((state: NormalStateType) => {
            const { count } = state
            return renderedSelectorId
          })
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
              // console.log('Selector: ', { count, parentCount })
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

          // console.log('Running second dispatch')
          const doDispatch = () => normalStore.dispatch({ type: '' })
          expect(doDispatch).not.toThrowError()

          spy.mockRestore()
        })

        it('Passes through errors thrown while rendering', () => {
          const spy = jest.spyOn(console, 'error').mockImplementation(() => {})

          const Comp = () => {
            const result = useSelector((state: NormalStateType) => {
              if (state.count > 0) {
                // console.log('Throwing error')
                throw new Error('Panic!')
              }

              return state.count
            })

            return <div>{result}</div>
          }

          const App = () => (
            <ProviderMock store={normalStore}>
              <Comp />
            </ProviderMock>
          )

          rtl.render(<App />)

          // TODO We can no longer catch errors in selectors after dispatch ourselves, as `uSES` swallows them.
          // The test selector will happen to re-throw while rendering and we do see that.
          expect(() => {
            rtl.act(() => {
              normalStore.dispatch({ type: '' })
            })
          }).toThrow(/Panic!/)

          spy.mockRestore()
        })

        it('re-throws errors from the selector that only occur during rendering', () => {
          const spy = jest.spyOn(console, 'error').mockImplementation(() => {})

          let forceParentRender: () => void
          const Parent = () => {
            const [, forceRender] = useReducer((c) => c + 1, 0)
            forceParentRender = forceRender
            const count = useNormalSelector((s) => {
              return s.count
            })
            return <Child parentCount={count} />
          }

          const Child = ({ parentCount }: ChildPropsType) => {
            const result = useNormalSelector(({ count }) => {
              console.trace('Selector values: ', { count, parentCount })
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

          expect(() => {
            rtl.act(() => {
              normalStore.dispatch({ type: '' })
              //forceParentRender()
            })
          }).toThrowError()

          spy.mockRestore()
        })

        it.skip('allows dealing with stale props by putting a specific connected component above the hooks component', () => {
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
            useLayoutEffect(() => {
              renderedItems.push(array)
            })
            return <div />
          }

          rtl.render(
            <ProviderMock store={normalStore}>
              <Comp />
            </ProviderMock>
          )

          expect(renderedItems.length).toBe(1)

          rtl.act(() => {
            normalStore.dispatch({ type: '' })
          })

          expect(renderedItems.length).toBe(2)
          expect(renderedItems[0]).toBe(renderedItems[1])
        })

        it('should have linear or better unsubscribe time, not quadratic', () => {
          const reducer = (state: number = 0, action: any) =>
            action.type === 'INC' ? state + 1 : state
          const store = createStore(reducer)
          const increment = () => ({ type: 'INC' })

          const numChildren = 100000

          function App() {
            useSelector((s: number) => s)
            const dispatch = useDispatch()

            const [children, setChildren] = useState(numChildren)

            const toggleChildren = () =>
              setChildren((c) => (c ? 0 : numChildren))

            return (
              <div>
                <button onClick={toggleChildren}>Toggle Children</button>
                <button onClick={() => dispatch(increment())}>Increment</button>
                {[...Array(children).keys()].map((i) => (
                  <Child key={i} />
                ))}
              </div>
            )
          }

          function Child() {
            useSelector((s: number) => s)
            // Deliberately do not return any DOM here - we want to isolate the cost of
            // unsubscribing, and tearing down thousands of JSDOM nodes is expensive and irrelevant
            return null
          }

          const { getByText } = rtl.render(
            <ProviderMock store={store}>
              <App />
            </ProviderMock>
          )

          const timeBefore = Date.now()

          const button = getByText('Toggle Children')
          rtl.act(() => {
            rtl.fireEvent.click(button)
          })

          const timeAfter = Date.now()
          const elapsedTime = timeAfter - timeBefore

          // Seeing an unexpected variation in elapsed time between React 18 and React 17 + the compat entry point.
          // With 18, I see around 75ms with correct implementation on my machine, with 100K items.
          // With 17 + compat, the same correct impl takes about 4200-5000ms.
          // With the quadratic behavior, this is at least 13000ms (or worse!) under 18, and 22000ms+ with 17.
          // The 13000ms time for 18 stays the same if I use the shim, so it must be a 17 vs 18 difference somehow,
          // although I can't imagine why, and if I remove the `useSelector` calls both tests drop to ~50ms.
          // So, we'll modify our expectations here depending on whether this is an 18 or 17 compat test,
          // and give some buffer time to allow for variations in test machines.
          const expectedMaxUnmountTime = IS_REACT_18 ? 500 : 7000
          expect(elapsedTime).toBeLessThan(expectedMaxUnmountTime)
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

      describe('Development mode checks', () => {
        const consoleSpy = jest
          .spyOn(console, 'warn')
          .mockImplementation(() => {})
        afterEach(() => {
          consoleSpy.mockClear()
        })
        afterAll(() => {
          consoleSpy.mockRestore()
        })

        const RenderSelector = ({
          selector,
          options,
        }: {
          selector: (state: NormalStateType) => unknown
          options?: UseSelectorOptions<unknown>
        }) => {
          useSelector(selector, options)
          return null
        }
        describe('selector result stability check', () => {
          const selector = jest.fn((state: NormalStateType) => state.count)

          afterEach(() => {
            selector.mockClear()
          })

          it('calls a selector twice, and warns in console if it returns a different result', () => {
            rtl.render(
              <ProviderMock stabilityCheck="once" store={normalStore}>
                <RenderSelector selector={selector} />
              </ProviderMock>
            )

            expect(selector).toHaveBeenCalledTimes(2)

            expect(consoleSpy).not.toHaveBeenCalled()

            rtl.cleanup()

            const unstableSelector = jest.fn(() => Math.random())

            rtl.render(
              <ProviderMock stabilityCheck="once" store={normalStore}>
                <RenderSelector selector={unstableSelector} />
              </ProviderMock>
            )

            expect(selector).toHaveBeenCalledTimes(2)

            expect(consoleSpy).toHaveBeenCalledWith(
              expect.stringContaining(
                'returned a different result when called with the same parameters'
              ),
              expect.objectContaining({
                state: expect.objectContaining({
                  count: 0,
                }),
                selected: expect.any(Number),
                selected2: expect.any(Number),
                stack: expect.any(String),
              })
            )
          })
          it('uses provided equalityFn', () => {
            const unstableSelector = jest.fn((state: NormalStateType) => ({
              count: state.count,
            }))

            rtl.render(
              <ProviderMock stabilityCheck="once" store={normalStore}>
                <RenderSelector
                  selector={unstableSelector}
                  options={{ equalityFn: shallowEqual }}
                />
              </ProviderMock>
            )

            expect(unstableSelector).toHaveBeenCalledTimes(2)
            expect(consoleSpy).not.toHaveBeenCalled()
          })
          it('by default will only check on first selector call', () => {
            rtl.render(
              <ProviderMock stabilityCheck="once" store={normalStore}>
                <RenderSelector selector={selector} />
              </ProviderMock>
            )

            expect(selector).toHaveBeenCalledTimes(2)

            rtl.act(() => {
              normalStore.dispatch({ type: '' })
            })

            expect(selector).toHaveBeenCalledTimes(3)
          })
          it('disables check if context or hook specifies', () => {
            rtl.render(
              <ProviderMock store={normalStore} stabilityCheck="never">
                <RenderSelector selector={selector} />
              </ProviderMock>
            )

            expect(selector).toHaveBeenCalledTimes(1)

            rtl.cleanup()

            selector.mockClear()

            rtl.render(
              <ProviderMock stabilityCheck="once" store={normalStore}>
                <RenderSelector
                  selector={selector}
                  options={{ stabilityCheck: 'never' }}
                />
              </ProviderMock>
            )

            expect(selector).toHaveBeenCalledTimes(1)
          })
          it('always runs check if context or hook specifies', () => {
            rtl.render(
              <ProviderMock store={normalStore} stabilityCheck="always">
                <RenderSelector selector={selector} />
              </ProviderMock>
            )

            expect(selector).toHaveBeenCalledTimes(2)

            rtl.act(() => {
              normalStore.dispatch({ type: '' })
            })

            expect(selector).toHaveBeenCalledTimes(4)

            rtl.cleanup()

            selector.mockClear()

            rtl.render(
              <ProviderMock stabilityCheck="once" store={normalStore}>
                <RenderSelector
                  selector={selector}
                  options={{ stabilityCheck: 'always' }}
                />
              </ProviderMock>
            )

            expect(selector).toHaveBeenCalledTimes(2)

            rtl.act(() => {
              normalStore.dispatch({ type: '' })
            })

            expect(selector).toHaveBeenCalledTimes(4)
          })
        })
        describe('no-op selector check', () => {
          it('warns for selectors that return the entire root state', () => {
            rtl.render(
              <ProviderMock noopCheck="once" store={normalStore}>
                <RenderSelector selector={(state) => state.count} />
              </ProviderMock>
            )

            expect(consoleSpy).not.toHaveBeenCalled()

            rtl.cleanup()

            rtl.render(
              <ProviderMock noopCheck="once" store={normalStore}>
                <RenderSelector selector={(state) => state} />
              </ProviderMock>
            )

            expect(consoleSpy).toHaveBeenCalledWith(
              expect.stringContaining('returned the root state when called.'),
              expect.objectContaining({
                stack: expect.any(String),
              })
            )
          })
        })
      })

      describe('Auto-tracking behavior checks', () => {
        interface Todo {
          id: number
          name: string
          completed: boolean
        }

        type TodosState = Todo[]

        const counterSlice = createSlice({
          name: 'counters',
          initialState: {
            deeply: {
              nested: {
                really: {
                  deeply: {
                    nested: {
                      c1: { value: 0 },
                    },
                  },
                },
              },
            },

            c2: { value: 0 },
          },
          reducers: {
            increment1(state) {
              // state.c1.value++
              state.deeply.nested.really.deeply.nested.c1.value++
            },
            increment2(state) {
              state.c2.value++
            },
          },
        })

        const todosSlice = createSlice({
          name: 'todos',
          initialState: [
            { id: 0, name: 'a', completed: false },
            { id: 1, name: 'b', completed: false },
            { id: 2, name: 'c', completed: false },
          ] as TodosState,
          reducers: {
            toggleCompleted(state, action: PayloadAction<number>) {
              const todo = state.find((todo) => todo.id === action.payload)
              if (todo) {
                todo.completed = !todo.completed
              }
            },
            setName(state) {
              state[1].name = 'd'
            },
          },
        })

        function makeStore() {
          return configureStore({
            reducer: {
              counter: counterSlice.reducer,
              todos: todosSlice.reducer,
            },
            middleware: (gDM) =>
              gDM({
                serializableCheck: false,
                immutableCheck: false,
              }),
          })
        }

        type AppStore = ReturnType<typeof makeStore>
        let store: AppStore
        type RootState = ReturnType<AppStore['getState']>

        const useAppSelector: TypedUseSelectorHook<RootState> = useSelector

        beforeEach(() => {
          store = makeStore()
        })

        test.only('should correctly handle updates to nested data', async () => {
          let itemSelectorCallsCount = 0
          let listSelectorCallsCount = 0
          function TodoListItem({ todoId }: { todoId: number }) {
            console.log('TodoListItem render: ', todoId)
            const todo = useAppSelector((state) => {
              itemSelectorCallsCount++
              return state.todos.find((t) => t.id === todoId)
            })!
            return (
              <div>
                {todo.id}: {todo.name} ({todo.completed})
              </div>
            )
          }

          function TodoList() {
            const todoIds = useAppSelector((state) => {
              listSelectorCallsCount++
              return state.todos.map((t) => t.id)
            })
            console.log('TodoList render: ', todoIds)
            return (
              <>
                {todoIds.map((id) => (
                  <TodoListItem todoId={id} key={id} />
                ))}
              </>
            )
          }

          rtl.render(
            <Provider store={store} stabilityCheck="never">
              <TodoList />
            </Provider>
          )

          expect(listSelectorCallsCount).toBe(1)
          expect(itemSelectorCallsCount).toBe(3)
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
        const nestedContext = React.createContext<ReactReduxContextValue>(
          null as any
        )
        const useCustomSelector = createSelectorHook(nestedContext)
        let defaultCount: number | null = null
        let customCount: number | null = null

        const getCount = (s: StateType) => s.count

        const DisplayDefaultCount = ({ children = null }) => {
          const count = useSelector(getCount)
          defaultCount = count
          return <>{children}</>
        }
        interface DisplayCustomCountType {
          children: ReactNode
        }
        const DisplayCustomCount = ({ children }: DisplayCustomCountType) => {
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
