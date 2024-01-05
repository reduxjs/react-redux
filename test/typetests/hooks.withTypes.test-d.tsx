import * as React from 'react'
import { useDispatch, useSelector, useStore } from '../../src/index'
import { exactType, expectExactType } from '../typeTestHelpers'
import type { AppDispatch, AppStore, RootState } from './counterApp'
import { incrementAsync } from './counterApp'

function preTypedHooksSetupWithTypes() {
  const useAppSelector = useSelector.withTypes<RootState>()

  const useAppDispatch = useDispatch.withTypes<AppDispatch>()

  const useAppStore = useStore.withTypes<AppStore>()

  function CounterComponent() {
    useAppSelector((state) => state.counter)

    const dispatch = useAppDispatch()

    expectExactType<AppDispatch>(dispatch)

    const store = useAppStore()

    expectExactType<AppStore>(store)

    expectExactType<AppDispatch>(store.dispatch)

    const state = store.getState()

    expectExactType<RootState>(state)

    expectExactType<number>(state.counter)

    store.dispatch(incrementAsync(1))

    exactType(store.dispatch, dispatch)

    return (
      <button
        onClick={() => {
          dispatch(incrementAsync(1))
        }}
      />
    )
  }
}
