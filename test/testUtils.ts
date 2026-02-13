import { addReactStore } from '../src/utils/reactStoreEnhancer'
import { createStore as reduxCreateStore } from 'redux'
import { configureStore } from '@reduxjs/toolkit'
import type { Reducer } from 'redux'

export function createTestStore(reducer: Reducer, preloadedState?: any) {
  return reduxCreateStore(reducer, preloadedState, addReactStore)
}

// For RTK tests
export function configureTestStore(options: any) {
  return configureStore({
    ...options,
    enhancers: (getDefault) => getDefault().concat(addReactStore),
  })
}
