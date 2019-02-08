import React, { Component } from 'react'
import PropTypes from 'prop-types'
import { ReactReduxContext } from './Context'
import Subscription from "../utils/Subscription";

import {unstable_batchedUpdates} from "react-dom";

class Provider extends Component {
  constructor(props) {
    super(props)

    const { store } = props



    this.notifySubscribers = this.notifySubscribers.bind(this);
    const subscription = new Subscription(store);
    subscription.onStateChange = this.notifySubscribers;

    this.state = {
      //storeState: store.getState(),
      store,
      subscription
      //subscribe : this.childSubscribe.bind(this),
    }

    this.subscriptions = new Set();
    this.previousState = store.getState();
  }

  componentDidMount() {
    this._isMounted = true

    this.state.subscription.trySubscribe();

    if(this.previousState !== this.props.store.getState()) {
      this.state.subscription.notifyNestedSubs()
    }
    //this.subscribe()
  }

  componentWillUnmount() {
    if (this.unsubscribe) this.unsubscribe()

    this.state.subscription.tryUnsubscribe()

    this._isMounted = false

    this.subscriptions.clear();
  }

  componentDidUpdate(prevProps) {
    if (this.props.store !== prevProps.store) {
      this.state.subscription.tryUnsubscribe()
      const subscription = new Subscription(this.props.store);
      subscription.onStateChange = this.notifySubscribers;
      this.setState({store : this.props.store, subscription});
      //if (this.unsubscribe) this.unsubscribe()

      //this.subscribe()
    }
  }

  notifySubscribers() {
    this.state.subscription.notifyNestedSubs()
    /*
    unstable_batchedUpdates(() => {

      this.subscriptions.forEach(cb => {
        cb();
      })
    })
    */
  }

  subscribe() {
    const { store } = this.props
    const { subscriptions } = this

    const flushUpdates = () => {
      const state = store.getState()
      if (state === this.previousState) {
        return
      }
      this.previousState = state
      unstable_batchedUpdates(() => {
        subscriptions.forEach(cb => {
          cb(state)
        })
      })
    }

    this.unsubscribe = store.subscribe(() => {
      if (this._isMounted) {
        flushUpdates()
      }
    })

    // handle the case where there were updates before we subscribed
    flushUpdates()
  }

  childSubscribe(cb) {
    const { subscriptions } = this
    subscriptions.add(cb)
    // cb(this.previousState)
    return () => subscriptions.delete(cb)
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
  store: PropTypes.shape({
    subscribe: PropTypes.func.isRequired,
    dispatch: PropTypes.func.isRequired,
    getState: PropTypes.func.isRequired
  }),
  context: PropTypes.object,
  children: PropTypes.any
}

export default Provider
