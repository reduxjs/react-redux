import React, { Component } from 'react'
import PropTypes from 'prop-types'
import { Provider as ContextProvider } from './Context'
import { storeShape } from '../utils/PropTypes'

export function createProvider(storeKey = 'store') {
    const subscriptionKey = `${storeKey}Subscription`

    class Provider extends Component {
      constructor(props) {
        super(props)
        this.state = {
          value: {
            state: props.store.getState(),
            store: props.store
          }
        }
      }

      shouldComponentUpdate(nextProps, nextState) {
        if (nextProps.children !== this.props.children) return true
        return this.state.value !== nextState.value
      }

      componentDidMount() {
        this.isUnmounted = false
        const state = this.state.value.store.getState()
        const unsubscribe = this.state.value.store.subscribe(this.triggerUpdateOnStoreStateChange.bind(this))

        if (state !== this.state.value.state) {
          this.setState({
            unsubscribe,
            value: {
              state,
              store: this.state.value.store
            }
          })
        } else {
          this.setState({ unsubscribe })
        }
      }

      componentWillUnmount() {
        this.isUnmounted = true
        if (this.state.unsubscribe) this.state.unsubscribe()
        this.setState({ unsubscribe: null })
      }

      componentDidUpdate(nextProps) {
        if (nextProps.store !== this.props.store) {
          this.setState(state => {
            if (state.unsubscribe) state.unsubscribe()
            return {
              unsubscribe: nextProps.store.subscribe(this.triggerUpdateOnStoreStateChange.bind(this)),
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
            return prevState
          }
          return {
            value: {
              ...prevState.value,
              state: newState
            },
            updateCount: prevState.updateCount++
          }
        })
      }

      render() {
        console.log('Provider render')
        return (
          <ContextProvider value={this.state.value}>
            {this.props.children}
          </ContextProvider>
        )
      }
    }

    Provider.propTypes = {
      store: storeShape.isRequired,
      children: PropTypes.any
    }

    return Provider
}

export default createProvider()
