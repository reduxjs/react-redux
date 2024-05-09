import type { Action, ThunkAction } from '@reduxjs/toolkit'
import { configureStore, createAsyncThunk, createSlice } from '@reduxjs/toolkit'
import { useDispatch, useSelector, useStore } from 'react-redux'

export interface CounterState {
  counter: number
}

const initialState: CounterState = {
  counter: 0,
}

export const counterSlice = createSlice({
  name: 'counter',
  initialState,
  reducers: {
    increment(state) {
      state.counter++
    },
  },
})

export function fetchCount(amount = 1) {
  return new Promise<{ data: number }>((resolve) =>
    setTimeout(() => resolve({ data: amount }), 500),
  )
}

export const incrementAsync = createAsyncThunk(
  'counter/fetchCount',
  async (amount: number) => {
    const response = await fetchCount(amount)
    // The value we return becomes the `fulfilled` action payload
    return response.data
  },
)

const { increment } = counterSlice.actions

const counterStore = configureStore({
  reducer: counterSlice.reducer,
})

type AppStore = typeof counterStore
type AppDispatch = typeof counterStore.dispatch
type RootState = ReturnType<typeof counterStore.getState>
type AppThunk<ThunkReturnType = void> = ThunkAction<
  ThunkReturnType,
  RootState,
  unknown,
  Action
>

describe('useSelector.withTypes<RootState>()', () => {
  test('should return useSelector', () => {
    const useAppSelector = useSelector.withTypes<RootState>()

    expect(useAppSelector).toBe(useSelector)
  })
})

describe('useDispatch.withTypes<AppDispatch>()', () => {
  test('should return useDispatch', () => {
    const useAppDispatch = useDispatch.withTypes<AppDispatch>()

    expect(useAppDispatch).toBe(useDispatch)
  })
})

describe('useStore.withTypes<AppStore>()', () => {
  test('should return useStore', () => {
    const useAppStore = useStore.withTypes<AppStore>()

    expect(useAppStore).toBe(useStore)
  })
})
