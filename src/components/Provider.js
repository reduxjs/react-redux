import React, { Component } from 'react'
import PropTypes from 'prop-types'
import { Provider as ContextProvider } from './Context'
import { storeShape } from '../utils/PropTypes'

class Provider extends Component {
  constructor(props) {
    super(props)
    this.state = {
      value: {
        state: props.store.getState(),
        store: props.store
      }
    }
    this.unsubscribe = null
  }

  componentDidMount() {
    this.isUnmounted = false
    const state = this.state.value.store.getState()
    this.unsubscribe = this.state.value.store.subscribe(this.triggerUpdateOnStoreStateChange.bind(this))

    if (state !== this.state.value.state) {
      this.setState({
        value: {
          state,
          store: this.state.value.store
        }
      })
    }
  }

  componentWillUnmount() {
    this.isUnmounted = true
    if (this.unsubscribe) this.unsubscribe()
  }

  componentDidUpdate(nextProps) {
    if (nextProps.store !== this.props.store) {
      this.setState(() => {
        if (this.unsubscribe) this.unsubscribe()
        this.unsubscribe = nextProps.store.subscribe(this.triggerUpdateOnStoreStateChange.bind(this))
        return {
          value: {
            state: nextProps.store.getState(),
            store: nextProps.store
          }
        }
      })
    }
  }

  triggerUpdateOnStoreStateChange() {
    if (this.isUnmounted) {
      return
    }

    this.setState(prevState => {
      const newState = prevState.value.store.getState()
      if (prevState.value.state === newState) {
        return null
      }
      return {
        value: {
          ...prevState.value,
          state: newState
        }
      }
    })
  }

  render() {
    const Context = this.props.context || ContextProvider
    return (
      <Context value={this.state.value}>
        {this.props.children}
      </Context>
    )
  }
}

Provider.propTypes = {
  store: storeShape.isRequired,
  context: PropTypes.object,
  children: PropTypes.any
}

export default Provider
