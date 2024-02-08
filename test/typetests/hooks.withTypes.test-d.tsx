import { useDispatch, useSelector, useStore } from '../../src/index'
import type { AppDispatch, AppStore, RootState } from './counterApp'
import { incrementAsync } from './counterApp'

describe('type tests', () => {
  test('pre-typed hooks setup using `.withTypes()`', () => {
    const useAppSelector = useSelector.withTypes<RootState>()

    const useAppDispatch = useDispatch.withTypes<AppDispatch>()

    const useAppStore = useStore.withTypes<AppStore>()

    const CounterComponent = () => {
      expectTypeOf(useAppSelector).toBeCallableWith((state) => state.counter)

      const dispatch = useAppDispatch()

      expectTypeOf(dispatch).toEqualTypeOf<AppDispatch>()

      const store = useAppStore()

      expectTypeOf(store).toEqualTypeOf<AppStore>()

      expectTypeOf(store.dispatch).toEqualTypeOf<AppDispatch>()

      const state = store.getState()

      expectTypeOf(state).toEqualTypeOf<RootState>()

      expectTypeOf(state.counter).toBeNumber()

      // NOTE: We can't do `expectTypeOf(store.dispatch).toBeCallableWith(incrementAsync(1))`
      // because `.toBeCallableWith()` does not work well with function overloads.
      store.dispatch(incrementAsync(1))

      expectTypeOf(store.dispatch).toEqualTypeOf(dispatch)

      return (
        <button
          onClick={() => {
            dispatch(incrementAsync(1))
          }}
        />
      )
    }
  })
})
