import React, { Component } from 'react'
import PropTypes from 'prop-types'
import Context from './Context'

const ContextProvider = Context.Provider

class Provider extends Component {
  constructor(props) {
    super(props)
    this.state = {
      state: props.store.getState(),
      store: props.store
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
    if (lastProps.store !== this.props.store) {
      if (this.unsubscribe) this.unsubscribe()
      this.unsubscribe = this.props.store.subscribe(this.triggerUpdateOnStoreStateChange.bind(this))
      this.setState({
        state: this.props.store.getState(),
        store: this.props.store
      })
    }
  }

  triggerUpdateOnStoreStateChange() {
    if (this.isUnmounted) {
      return
    }

    this.setState(prevState => {
      const newState = prevState.store.getState()
      if (prevState.state === newState) {
        return null
      }
      return {
        state: newState
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
