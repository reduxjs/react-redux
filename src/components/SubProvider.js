import { PropTypes } from 'react'
import Provider from './Provider'
import Subscription from '../utils/Subscription'
import storeShape from '../utils/storeShape'

export default class SubProvider extends Provider {
  getChildContext() {
    return { store: this.subStore, storeSubscription: this.storeSubscription }
  }

  constructor(props, context) {
    super(props, context)
    const store = context.store;
    this.storeSubscription = context.storeSubscription;
    this.subStore = {
      subscribe: store.subscribe.bind(store),
      dispatch: store.dispatch.bind(store),
      getState: () => store.getState()[props.subState]
    };
  }
}

SubProvider.propTypes = {
  subState: PropTypes.string.isRequired,
  children: PropTypes.element.isRequired
}
SubProvider.contextTypes = {
  store: storeShape,
  storeSubscription: PropTypes.instanceOf(Subscription)
}
SubProvider.displayName = 'SubProvider'
