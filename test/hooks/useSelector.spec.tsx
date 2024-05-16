/*eslint-disable react/prop-types*/

import type { UseSelectorOptions } from '@internal/hooks/useSelector'
import { IS_REACT_19 } from '@internal/utils/react-is'
import * as rtl from '@testing-library/react'
import type { DispatchWithoutAction, FunctionComponent, ReactNode } from 'react'
import React, {
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useReducer,
  useState,
} from 'react'
import type {
  ProviderProps,
  ReactReduxContextValue,
  Subscription,
  TypedUseSelectorHook,
} from 'react-redux'
import {
  Provider,
  ReactReduxContext,
  connect,
  createSelectorHook,
  shallowEqual,
  useDispatch,
  useSelector,
} from 'react-redux'
import type { Action, AnyAction, Store } from 'redux'
import { createStore } from 'redux'

// disable checks by default
function ProviderMock<A extends Action<any> = AnyAction, S = unknown>({
  stabilityCheck = 'never',
  identityFunctionCheck = 'never',
  ...props
}: ProviderProps<A, S>) {
  return (
    <Provider
      {...props}
      stabilityCheck={stabilityCheck}
      identityFunctionCheck={identityFunctionCheck}
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
      const useNormalSelector: TypedUseSelectorHook<RootState> = useSelector

      beforeEach(() => {
        normalStore = createStore(
          ({ count }: NormalStateType = { count: -1 }): NormalStateType => ({
            count: count + 1,
          }),
        )
        renderedItems = []
      })

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
            </ProviderMock>,
          )

          expect(result).toEqual(0)
        })

        it('selects the state and renders the component when the store updates', () => {
          const selector = vi.fn((s: NormalStateType) => s.count)
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
            </ProviderMock>,
          )

          expect(result).toEqual(0)
          expect(selector).toHaveBeenCalledOnce()

          rtl.act(() => {
            normalStore.dispatch({ type: '' })
          })

          expect(result).toEqual(1)
          expect(selector).toHaveBeenCalledTimes(2)
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
            </ProviderMock>,
          )

          expect(renderedItems).toEqual([1])

          rtl.act(() => {
            store.dispatch({ type: '' })
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
            const contextVal = useContext(ReactReduxContext)
            appSubscription = contextVal && contextVal.subscription
            const count = useNormalSelector((s) => s.count)
            return count === 1 ? <Child /> : null
          }

          rtl.render(
            <ProviderMock store={normalStore}>
              <Parent />
            </ProviderMock>,
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
            const contextVal = useContext(ReactReduxContext)
            appSubscription = contextVal && contextVal.subscription
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
            </ProviderMock>,
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
            </ProviderMock>,
          )

          // With `useSyncExternalStore`, we get three renders of `<Comp>`:
          // 1) Initial render, count is 0
          // 2) Render due to dispatch, still sync in the initial render's commit phase
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
          </ProviderMock>,
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
            </ProviderMock>,
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
            }),
          )

          const Comp = () => {
            const value = useSelector(
              (s: StateType) => Object.keys(s),
              shallowEqual,
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
            </ProviderMock>,
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

          const selector = vi.fn((s: StateType) => {
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
            </ProviderMock>,
          )

          expect(selector).toHaveBeenCalledOnce()
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

          const selector = vi.fn((s: StateType) => {
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
            </ProviderMock>,
          )

          // Selector first called on Comp mount, and then re-invoked after mount due to useLayoutEffect dispatching event
          expect(selector).toHaveBeenCalledTimes(2)
          expect(renderedItems.length).toEqual(2)
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
          </ProviderMock>,
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
          const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

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
            </ProviderMock>,
          )

          const doDispatch = () => normalStore.dispatch({ type: '' })
          expect(doDispatch).not.toThrowError()

          spy.mockRestore()
        })

        it('Passes through errors thrown while rendering', () => {
          const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

          const Comp = () => {
            const result = useSelector((count: number) => {
              if (count > 0) {
                // console.log('Throwing error')
                throw new Error('Panic!')
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

          // TODO We can no longer catch errors in selectors after dispatch ourselves, as `uSES` swallows them.
          // The test selector will happen to re-throw while rendering and we do see that.
          expect(() => {
            rtl.act(() => {
              store.dispatch({ type: '' })
            })
          }).toThrow(/Panic!/)

          spy.mockRestore()
        })

        it('re-throws errors from the selector that only occur during rendering', () => {
          const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

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
            </ProviderMock>,
          )

          expect(() => {
            rtl.act(() => {
              normalStore.dispatch({ type: '' })
            })
          }).toThrowError()

          spy.mockRestore()
        })

        it.skip('allows dealing with stale props by putting a specific connected component above the hooks component', () => {
          const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

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
            </ProviderMock>,
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
            </ProviderMock>,
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
            </ProviderMock>,
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
          const expectedMaxUnmountTime = IS_REACT_18 || IS_REACT_19 ? 500 : 7000
          expect(elapsedTime).toBeLessThan(expectedMaxUnmountTime)
        })

        it('keeps working when used inside a Suspense', async () => {
          let result: number | undefined
          let expectedResult: number | undefined
          let lazyComponentAdded = false
          let lazyComponentLoaded = false

          // A lazy loaded component in the Suspense
          // This component does nothing really. It is lazy loaded to trigger the issue
          // Lazy loading this component will break other useSelectors in the same Suspense
          // See issue https://github.com/reduxjs/react-redux/issues/1977
          const OtherComp = () => {
            useLayoutEffect(() => {
              lazyComponentLoaded = true
            }, [])

            return <div></div>
          }
          let otherCompFinishLoading: () => void = () => {}
          const OtherComponentLazy = React.lazy(
            () =>
              new Promise<{ default: React.ComponentType<any> }>((resolve) => {
                otherCompFinishLoading = () =>
                  resolve({
                    default: OtherComp,
                  })
              }),
          )
          let addOtherComponent: () => void = () => {}
          const Dispatcher = React.memo(() => {
            const [load, setLoad] = useState(false)

            useEffect(() => {
              addOtherComponent = () => setLoad(true)
            }, [])
            useEffect(() => {
              lazyComponentAdded = true
            })
            return load ? <OtherComponentLazy /> : null
          })
          // End of lazy loading component

          // The test component inside the suspense (uses the useSelector which breaks)
          const CompInsideSuspense = () => {
            const count = useNormalSelector((state) => state.count)

            result = count
            return (
              <div>
                {count}
                <Dispatcher />
              </div>
            )
          }
          // The test component outside the suspense (uses the useSelector which keeps working - for comparison)
          const CompOutsideSuspense = () => {
            const count = useNormalSelector((state) => state.count)

            expectedResult = count
            return <div>{count}</div>
          }

          // Now, steps to reproduce
          // step 1. make sure the component with the useSelector inside the Suspsense is rendered
          //         -> it will register the subscription
          // step 2. make sure the suspense is switched back to "Loading..." state by adding a component
          //         -> this will remove our useSelector component from the page temporary!
          // step 3. Finish loading the other component, so the suspense is no longer loading
          //         -> this will re-add our <Provider> and useSelector component
          // step 4. Check that the useSelectors in our re-added components still work

          // step 1: render will render our component with the useSelector
          rtl.render(
            <>
              <Suspense fallback={<div>Loading... </div>}>
                <ProviderMock store={normalStore}>
                  <CompInsideSuspense />
                </ProviderMock>
              </Suspense>
              <ProviderMock store={normalStore}>
                <CompOutsideSuspense />
              </ProviderMock>
            </>,
          )

          // step 2: make sure the suspense is switched back to "Loading..." state by adding a component
          rtl.act(() => {
            addOtherComponent()
          })
          await rtl.waitFor(() => {
            if (!lazyComponentAdded) {
              throw new Error('Suspense is not back in loading yet')
            }
          })
          expect(lazyComponentAdded).toEqual(true)

          // step 3. Finish loading the other component, so the suspense is no longer loading
          // This will re-add our components under the suspense, but will NOT rerender them!
          rtl.act(() => {
            otherCompFinishLoading()
          })
          await rtl.waitFor(() => {
            if (!lazyComponentLoaded) {
              throw new Error('Suspense is not back to loaded yet')
            }
          })
          expect(lazyComponentLoaded).toEqual(true)

          // step 4. Check that the useSelectors in our re-added components still work
          // Do an update to the redux store
          rtl.act(() => {
            normalStore.dispatch({ type: '' })
          })

          // Check the component *outside* the Suspense to check whether React rerendered
          await rtl.waitFor(() => {
            if (expectedResult !== 1) {
              throw new Error('useSelector did not return 1 yet')
            }
          })

          // Expect the useSelector *inside* the Suspense to also update (this was broken)
          expect(result).toEqual(expectedResult)
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
            useNormalSelector((s) => s.count, 1),
          ).toThrow()
        })
      })

      describe('Development mode checks', () => {
        const consoleSpy = vi
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
          const selector = vi.fn((state: NormalStateType) => state.count)

          afterEach(() => {
            selector.mockClear()
          })

          it('calls a selector twice, and warns in console if it returns a different result', () => {
            rtl.render(
              <ProviderMock stabilityCheck="once" store={normalStore}>
                <RenderSelector selector={selector} />
              </ProviderMock>,
            )

            expect(selector).toHaveBeenCalledTimes(2)

            expect(consoleSpy).not.toHaveBeenCalled()

            rtl.cleanup()

            const unstableSelector = vi.fn(() => Math.random())

            rtl.render(
              <ProviderMock stabilityCheck="once" store={normalStore}>
                <RenderSelector selector={unstableSelector} />
              </ProviderMock>,
            )

            expect(selector).toHaveBeenCalledTimes(2)

            expect(consoleSpy).toHaveBeenCalledWith(
              expect.stringContaining(
                'returned a different result when called with the same parameters',
              ),
              expect.objectContaining({
                state: expect.objectContaining({
                  count: 0,
                }),
                selected: expect.any(Number),
                selected2: expect.any(Number),
                stack: expect.any(String),
              }),
            )
          })
          it('uses provided equalityFn', () => {
            const unstableSelector = vi.fn((state: NormalStateType) => ({
              count: state.count,
            }))

            rtl.render(
              <ProviderMock stabilityCheck="once" store={normalStore}>
                <RenderSelector
                  selector={unstableSelector}
                  options={{ equalityFn: shallowEqual }}
                />
              </ProviderMock>,
            )

            expect(unstableSelector).toHaveBeenCalledTimes(2)
            expect(consoleSpy).not.toHaveBeenCalled()
          })
          it('by default will only check on first selector call', () => {
            rtl.render(
              <ProviderMock stabilityCheck="once" store={normalStore}>
                <RenderSelector selector={selector} />
              </ProviderMock>,
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
              </ProviderMock>,
            )

            expect(selector).toHaveBeenCalledOnce()

            rtl.cleanup()

            selector.mockClear()

            rtl.render(
              <ProviderMock stabilityCheck="once" store={normalStore}>
                <RenderSelector
                  selector={selector}
                  options={{ devModeChecks: { stabilityCheck: 'never' } }}
                />
              </ProviderMock>,
            )

            expect(selector).toHaveBeenCalledOnce()
          })
          it('always runs check if context or hook specifies', () => {
            rtl.render(
              <ProviderMock store={normalStore} stabilityCheck="always">
                <RenderSelector selector={selector} />
              </ProviderMock>,
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
                  options={{ devModeChecks: { stabilityCheck: 'always' } }}
                />
              </ProviderMock>,
            )

            expect(selector).toHaveBeenCalledTimes(2)

            rtl.act(() => {
              normalStore.dispatch({ type: '' })
            })

            expect(selector).toHaveBeenCalledTimes(4)
          })
        })
        describe('identity function check', () => {
          it('warns for selectors that return the entire root state', () => {
            rtl.render(
              <ProviderMock identityFunctionCheck="once" store={normalStore}>
                <RenderSelector selector={(state) => state.count} />
              </ProviderMock>,
            )

            expect(consoleSpy).not.toHaveBeenCalled()

            rtl.cleanup()

            rtl.render(
              <ProviderMock identityFunctionCheck="once" store={normalStore}>
                <RenderSelector selector={(state) => state} />
              </ProviderMock>,
            )

            expect(consoleSpy).toHaveBeenCalledWith(
              expect.stringContaining('returned the root state when called.'),
              expect.objectContaining({
                stack: expect.any(String),
              }),
            )
          })
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
          </ProviderMock>,
        )

        expect(defaultCount).toBe(0)
        expect(customCount).toBe(12)
      })
    })
  })
})
