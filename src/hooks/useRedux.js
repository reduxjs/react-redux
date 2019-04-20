import { useSelector } from './useSelector'
import { useActions } from './useActions'

/**
 * A hook to access the redux store's state and to bind action creators to 
 * the store's dispatch function. In essence, this hook is a combination of
 * `useSelector` and `useActions`.
 * 
 * @param {Function} selector the selector function
 * @param {Function|Function[]|Object.<string, Function>} actions the action creators to bind
 * 
 * @returns {[any, any]} a tuple of the selected state and the bound action creators
 *
 * Usage:
 *
```jsx
import React from 'react'
import { useRedux } from 'react-redux'

export const CounterComponent = () => {
  const [counter, { inc1, inc }] = useRedux(state => state.counter, {
    inc1: () => ({ type: 'inc1' }),
    inc: amount => ({ type: 'inc', amount }),
  })

  return (
    <>
      <div>
        {counter}
      </div>
      <button onClick={inc1}>Increment by 1</button>
      <button onClick={() => inc(5)}>Increment by 5</button>
    </>
  )
}
```
 */
export function useRedux(selector, actions) {
  return [useSelector(selector), useActions(actions)]
}
