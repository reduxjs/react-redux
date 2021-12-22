import {
  createSlice,
  createAsyncThunk,
  configureStore,
  ThunkAction,
  Action,
} from '@reduxjs/toolkit'

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
    setTimeout(() => resolve({ data: amount }), 500)
  )
}

export const incrementAsync = createAsyncThunk(
  'counter/fetchCount',
  async (amount: number) => {
    const response = await fetchCount(amount)
    // The value we return becomes the `fulfilled` action payload
    return response.data
  }
)

export const { increment } = counterSlice.actions

const counterStore = configureStore({
  reducer: counterSlice.reducer,
  middleware: (gdm) => gdm(),
})

export type AppDispatch = typeof counterStore.dispatch
export type RootState = ReturnType<typeof counterStore.getState>
export type AppThunk<ReturnType = void> = ThunkAction<
  ReturnType,
  RootState,
  unknown,
  Action<string>
>
