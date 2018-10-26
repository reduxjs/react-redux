import React, { Component } from 'react'
import PropTypes from 'prop-types'
import { storeShape } from '../utils/PropTypes'

import {ReactReduxContext} from "./context"

export function createProvider() {

    class Provider extends Component {

        constructor(props) {
          super(props)

            const {store} = props

            this.state = {
                storeState : store.getState(),
                store,
            }
        }

        componentDidMount() {
          this._isMounted = true
          this.subscribe()
        }

        componentWillUnmount() {
          if(this.unsubscribe) this.unsubscribe()

          this._isMounted = false
        }

        componentDidUpdate(prevProps) {
          if(this.props.store !== prevProps.store) {
            if(this.unsubscribe) this.unsubscribe()

            this.subscribe()
          }
        }

        subscribe() {
          const {store} = this.props

          this.unsubscribe = store.subscribe( () => {
            const newStoreState = store.getState()

            if(!this._isMounted) {
              return
            }

            this.setState(providerState => {
              // If the value is the same, skip the unnecessary state update.
              if(providerState.storeState === newStoreState) {
                return null
              }

              return {storeState : newStoreState}
            })
          })

          // Actions might have been dispatched between render and mount - handle those
          const postMountStoreState = store.getState()
          if(postMountStoreState !== this.state.storeState) {
            this.setState({storeState : postMountStoreState})
          }
        }

        render() {
          const Context = this.props.context || ReactReduxContext

            return (
                <Context.Provider value={this.state}>
                    {this.props.children}
                </Context.Provider>
            )
        }
    }


    Provider.propTypes = {
      store: storeShape.isRequired,
      children: PropTypes.element.isRequired,
      context : PropTypes.object,
    }

    return Provider
}

export default createProvider()
