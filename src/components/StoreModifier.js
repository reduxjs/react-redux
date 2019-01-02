import React from 'react'
import PropTypes from 'prop-types'
import { ReactReduxContext } from './Context'

export function createStoreModifier(Context = ReactReduxContext) {
  class StoreModifier extends React.Component {
    constructor(props, context) {
      super(props, context)

      this.firstContext = context

      const { store, storeState } = this.context
      const modifyStore = this.props.modifyStore || this.context.modifyStore

      // Create storeProxy
      let newRootReducer
      const replaceReducerSpy = (reducer, ...args) => {
        newRootReducer = reducer
        return store.replaceReducer(reducer, ...args)
      }
      const storeProxy = { ...store, replaceReducer: replaceReducerSpy }

      // Call modifyStore
      this.cleanup = modifyStore(props.modification, storeProxy, storeState)

      // Check if replaceReducer was called, patch new state
      if (newRootReducer) {
        const patchedState = newRootReducer(storeState, {})
        this.patchedContextValue = {
          ...context,
          storeState: patchedState
        }
      }
    }
    componentWillUnmount() {
      if (this.cleanup) {
        const { modification } = this.props
        const { store, storeState } = this.context
        this.cleanup(modification, store, storeState)
      }
    }
    render() {
      // We only want to Provide a new context-value if it has actually been patched
      // AND this render has the same context as when component was constructed
      // This is a heuristic for the first render-pass. Even when heuristic is wrong, it
      // is still safe to patch context as long as the original context has not changed.
      if (this.patchedContextValue && this.firstContext === this.context) {
        return (
          <Context.Provider value={this.patchedContextValue}>
            {this.props.children}
          </Context.Provider>
        )
      }
      return this.props.children
    }
  }

  StoreModifier.contextType = Context
  StoreModifier.propTypes = {
    modification: PropTypes.object.isRequired,
    modifyStore: PropTypes.func,
    children: PropTypes.any
  }

  return StoreModifier
}

export default createStoreModifier()
