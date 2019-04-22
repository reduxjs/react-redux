import { bindActionCreators } from 'redux'
import invariant from 'invariant'
import { useDispatch } from './useDispatch'
import { useMemo } from 'react'

/**
 * A hook to bind action creators to the redux store's `dispatch` function
 * similar to how redux's `bindActionCreators` works.
 * 
 * Supports passing a single action creator, an array/tuple of action
 * creators, or an object of action creators.
 * 
 * Any arguments passed to the created callbacks are passed through to
 * the your functions.
 * 
 * This hook takes a dependencies array as an optional second argument,
 * which when passed ensures referential stability of the created callbacks.
 * 
 * @param {Function|Function[]|Object.<string, Function>} actions the action creators to bind
 * @param {any[]} deps (optional) dependencies array to control referential stability
 * 
 * @returns {Function|Function[]|Object.<string, Function>} callback(s) bound to store's `dispatch` function
 *
 * Usage:
 *
```jsx
import React from 'react'
import { useActions } from 'react-redux'

const increaseCounter = ({ amount }) => ({
  type: 'increase-counter',
  amount,
})

export const CounterComponent = ({ value }) => {
  // supports passing an object of action creators
  const { increaseCounterByOne, increaseCounterByTwo } = useActions({
    increaseCounterByOne: () => increaseCounter(1),
    increaseCounterByTwo: () => increaseCounter(2),
  }, [])

  // supports passing an array/tuple of action creators
  const [increaseCounterByThree, increaseCounterByFour] = useActions([
    () => increaseCounter(3),
    () => increaseCounter(4),
  ], [])

  // supports passing a single action creator
  const increaseCounterBy5 = useActions(() => increaseCounter(5), [])

  // passes through any arguments to the callback
  const increaseCounterByX = useActions(x => increaseCounter(x), [])

  return (
    <div>
      <span>{value}</span>
      <button onClick={increaseCounterByOne}>Increase counter by 1</button>
    </div>
  )
}
```
 */
export function useActions(actions, deps) {
  invariant(actions, `You must pass actions to useActions`)

  const dispatch = useDispatch()
  return useMemo(() => {
    if (Array.isArray(actions)) {
      return actions.map(a => bindActionCreators(a, dispatch))
    }

    return bindActionCreators(actions, dispatch)
  }, deps)
}
