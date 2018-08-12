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
          this.setState(state => {
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
