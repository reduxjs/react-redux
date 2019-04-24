import React from 'react'
import PropTypes from 'prop-types'
import { ReactReduxContext } from './Context'
import { createUpdater } from '../updater/updater'

export function Provider({ context, store, children }) {
  let [updater] = React.useState(createUpdater)
  updater.setStore(store)
  React.useEffect(() => {
    updater.setStore(store)
    updater.newState(store.getState())
    return store.subscribe(() => updater.newState(store.getState()))
  }, [updater, store])
  const Context = context || ReactReduxContext
  return <Context.Provider value={updater}>{children}</Context.Provider>
}

Provider.propTypes = {
  store: PropTypes.shape({
    subscribe: PropTypes.func.isRequired,
    dispatch: PropTypes.func.isRequired,
    getState: PropTypes.func.isRequired
  }),
  context: PropTypes.object,
  children: PropTypes.any
}

export default Provider
