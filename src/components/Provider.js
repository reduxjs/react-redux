import React, { Component } from 'react'
import PropTypes from 'prop-types'
import Context, { createHashFunction } from './Context'
import shallowEqual from '../utils/shallowEqual'

const ContextProvider = Context.Provider

class Provider extends Component {
  constructor(props) {
    super(props)
    const state = props.store.getState()
    this.state = {
      state,
      store: props.store,
      hashFunction: createHashFunction(state)
    }
    this.unsubscribe = null
  }

  componentDidMount() {
    this.isUnmounted = false
    const state = this.state.store.getState()
    this.unsubscribe = this.state.store.subscribe(this.triggerUpdateOnStoreStateChange.bind(this))

    if (state !== this.state.state) {
      this.setState({ state })
    }
  }

  componentWillUnmount() {
    this.isUnmounted = true
    if (this.unsubscribe) this.unsubscribe()
  }

  componentDidUpdate(lastProps) {
    const state = this.props.store.getState()
    const storesEqual = lastProps.store === this.props.store
    if (!storesEqual) {
      if (this.unsubscribe) this.unsubscribe()
      this.unsubscribe = this.props.store.subscribe(this.triggerUpdateOnStoreStateChange.bind(this))
      this.setState({
        state,
        store: this.props.store
      })
    }
    if(
      !storesEqual ||
      !shallowEqual(Object.keys(state), Object.keys(lastProps.store.getState()))
    ) {
      this.setState({
        hashFunction: createHashFunction(state)
      })
    }
  }

  triggerUpdateOnStoreStateChange() {
    if (this.isUnmounted) {
      return
    }

    this.setState(prevState => {
      const state = prevState.store.getState()
      if (prevState.state === state) {
        return null
      }
      return {
        state
      }
    })
  }

  render() {
    const Context = this.props.context || ContextProvider
    return (
      <Context value={this.state}>
        {this.props.children}
      </Context>
    )
  }
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
