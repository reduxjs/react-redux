import { useMemo } from 'react'
import { bindActionCreators } from 'redux'
import { useDispatch } from './useDispatch'

/**
 * Hook factory, which creates a `useActions` hook bound to dispatch.
 * 
 * @param {Object} actions object to bind to dispatch.
 * @returns {Function} A `useActions` hook bound to dispatch.
 *  
 * @example
 * // actions.js
 * import { bindActionCreators } from 'react-redux'
 * 
 * export const doSomething = e => ({  
 *   type: 'sometype',
 *   e.target.value,
 * })
 * 
 * export const useActions = createActionsHook({ doSomething })
 * 
 * // component.js
 * import React from 'react'
 * import { useSelector } from 'react-redux'
 * import { useActions } from './actions'
 * 
 * export const AdminButton = ({ key, text }) => {
 *   const user = useSelector(({ user }) => user)
 *   const action = useActions([ key, user ])
 *   if (!user.isAdmin) return null
 *   return (
 *     <button value={id} onClick={action.doSomething}>
 *       {text}
 *     </button>
 *   )
 * }
 */
export function createActionsHook(actions) {
  return function useActions(deps) {
    const dispatch = useDispatch();
    return useMemo(() => {
      if (Array.isArray(actions)) {
        return actions.map(a => bindActionCreators(a, dispatch))
      }
      return bindActionCreators(actions, dispatch)
    }, deps ? [dispatch, ...deps] : [dispatch])
  }
};
