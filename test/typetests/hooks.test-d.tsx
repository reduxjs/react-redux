import type { AnyAction, Dispatch, Store } from '@reduxjs/toolkit'
import { configureStore } from '@reduxjs/toolkit'
import { createContext } from 'react'
import type {
  ReactReduxContextValue,
  Selector,
  TypedUseSelectorHook,
  UseSelector,
} from '../../src/index'
import {
  createDispatchHook,
  createSelectorHook,
  createStoreHook,
  shallowEqual,
  useDispatch,
  useSelector,
  useStore,
} from '../../src/index'
import type { AppDispatch, RootState } from './counterApp'
import { incrementAsync } from './counterApp'

describe('type tests', () => {
  test('pre-typed hooks setup', () => {
    // Standard hooks setup
    const useAppDispatch = () => useDispatch<AppDispatch>()

    const useAppSelector: TypedUseSelectorHook<RootState> = useSelector

    function CounterComponent() {
      const dispatch = useAppDispatch()

      return (
        <button
          onClick={() => {
            dispatch(incrementAsync(1))
          }}
        />
      )
    }
  })

  test('selector', () => {
    interface OwnProps {
      key?: string | undefined
    }
    interface State {
      key: string
    }

    const simpleSelect: Selector<State, string> = (state: State) => state.key

    const notSimpleSelect: Selector<State, string, OwnProps> = (
      state: State,
      ownProps: OwnProps,
    ) => ownProps.key || state.key

    const ownProps = {}

    const state = { key: 'value' }

    expectTypeOf(simpleSelect).toBeCallableWith(state)

    expectTypeOf(notSimpleSelect).toBeCallableWith(state, ownProps)

    expectTypeOf(simpleSelect).parameter(1).not.toMatchTypeOf(ownProps)

    expectTypeOf(notSimpleSelect).parameters.not.toMatchTypeOf([state])
  })

  test('shallowEqual', () => {
    expectTypeOf(shallowEqual).parameter(0).not.toBeNever()

    expectTypeOf(shallowEqual).parameters.not.toMatchTypeOf<['a']>()

    expectTypeOf(shallowEqual).toBeCallableWith('a', 'a')

    expectTypeOf(shallowEqual).toBeCallableWith(
      { test: 'test' },
      { test: 'test' },
    )

    expectTypeOf(shallowEqual).toBeCallableWith({ test: 'test' }, 'a')

    expectTypeOf(shallowEqual).returns.toBeBoolean()

    interface TestState {
      stateProp: string
    }

    // Additionally, it should infer its type from arguments and not become `any`
    const selected1 = useSelector(
      (state: TestState) => state.stateProp,
      shallowEqual,
    )

    expectTypeOf(selected1).toBeString()

    const useAppSelector = useSelector.withTypes<TestState>()

    const selected2 = useAppSelector((state) => state.stateProp, shallowEqual)

    expectTypeOf(selected2).toBeString()
  })

  test('useDispatch', () => {
    const actionCreator = (selected: boolean) => ({
      type: 'ACTION_CREATOR',
      payload: selected,
    })

    const thunkActionCreator = (selected: boolean) => {
      return (dispatch: Dispatch) => {
        return dispatch(actionCreator(selected))
      }
    }

    const dispatch = useDispatch()

    expectTypeOf(dispatch).toBeCallableWith(actionCreator(true))

    expectTypeOf(dispatch)
      .parameter(0)
      .not.toMatchTypeOf(thunkActionCreator(true))

    expectTypeOf(dispatch).parameter(0).not.toMatchTypeOf(true)

    const store = configureStore({
      reducer: (state = 0) => state,
    })

    type AppDispatch = typeof store.dispatch

    const useThunkDispatch = () => useDispatch<AppDispatch>()

    const thunkDispatch = useThunkDispatch()

    expectTypeOf(actionCreator).returns.toEqualTypeOf(
      thunkDispatch(thunkActionCreator(true)),
    )
  })

  test('useSelector', () => {
    interface State {
      counter: number
      active: string
    }

    const selector = (state: State) => {
      return {
        counter: state.counter,
        active: state.active,
      }
    }
    const { counter, active } = useSelector(selector)

    expectTypeOf(counter).toBeNumber()

    expectTypeOf(counter).not.toBeString()

    expectTypeOf(active).toBeString()

    expectTypeOf(active).not.toBeObject()

    expectTypeOf(useSelector(selector)).not.toHaveProperty('extraneous')

    expectTypeOf(useSelector).parameters.not.toMatchTypeOf<
      [typeof selector, 'a']
    >()

    useSelector(selector, (l, r) => l === r)

    useSelector(selector, (l, r) => {
      expectTypeOf(l).toEqualTypeOf<{ counter: number; active: string }>()

      expectTypeOf(r).toEqualTypeOf<{ counter: number; active: string }>()
      return l === r
    })

    expectTypeOf(useSelector(selector, shallowEqual)).toEqualTypeOf<State>()

    expectTypeOf(
      useSelector(selector, {
        equalityFn: shallowEqual,
        devModeChecks: { stabilityCheck: 'never' },
      }),
    ).toEqualTypeOf<State>()

    expectTypeOf(useSelector(selector, shallowEqual)).not.toBeString()

    const compare = (_l: number, _r: number) => true

    useSelector(() => 1, compare)

    const compare2 = (_l: number, _r: string) => true

    // @ts-expect-error
    useSelector(() => 1, compare2)

    interface RootState {
      property: string
    }

    const useTypedSelector: TypedUseSelectorHook<RootState> = useSelector

    const r = useTypedSelector((state) => {
      expectTypeOf(state).toEqualTypeOf<RootState>()

      return state.property
    })

    expectTypeOf(r).toBeString()
  })

  test('useStore', () => {
    interface TypedState {
      counter: number
      active: boolean
    }
    interface TypedAction {
      type: 'SET_STATE'
    }

    const untypedStore = useStore()

    const state = untypedStore.getState()

    expectTypeOf(state).toBeObject()

    const typedStore = useStore<TypedState, TypedAction>()

    const typedState = typedStore.getState()

    expectTypeOf(typedState).toHaveProperty('counter')

    expectTypeOf(typedState).not.toHaveProperty('things')
  })

  test('createHook functions', () => {
    // These should match the types of the hooks.

    interface RootState {
      property: string
    }
    interface RootAction {
      type: 'TEST_ACTION'
    }

    const Context = createContext<ReactReduxContextValue<
      RootState,
      RootAction
    > | null>(null)

    test('no context', () => {
      expectTypeOf(createDispatchHook()).toMatchTypeOf<
        () => Dispatch<AnyAction>
      >()

      expectTypeOf(createSelectorHook()).toEqualTypeOf<UseSelector>()

      expectTypeOf(createStoreHook()).toMatchTypeOf<
        () => Store<any, AnyAction>
      >()
    })

    test('with context', () => {
      expectTypeOf(createDispatchHook(Context)).toMatchTypeOf<
        () => Dispatch<RootAction>
      >()

      expectTypeOf(createSelectorHook(Context)).toEqualTypeOf<UseSelector>()

      expectTypeOf(createStoreHook(Context)).toMatchTypeOf<
        () => Store<RootState, RootAction>
      >()
    })
  })
})
