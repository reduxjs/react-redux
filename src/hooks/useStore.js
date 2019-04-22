import { useReduxContext } from './useReduxContext'

/**
 * A hook to access the redux store.
 * 
 * @returns {any} the redux store
 *
 * Usage:
 *
```jsx
import React from 'react'
import { useStore } from 'react-redux'

export const CounterComponent = ({ value }) => {
  const store = useStore()
  return <div>{store.getState()}</div>
}
```
 */
export function useStore() {
  const { store } = useReduxContext()
  return store
}
