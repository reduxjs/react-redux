// encapsulates the subscription logic for connecting a component to the redux store, as
// well as nesting subscriptions of descendant components, so that we can ensure the
// ancestor components re-render before descendants
export default class Subscription {
  constructor(store, parentSub) {
    this.subscribe = parentSub
      ? parentSub.addNestedSub.bind(parentSub)
      : store.subscribe

    this.unsubscribe = null
    this.nextListeners = this.currentListeners = []
  }

  ensureCanMutateNextListeners() {
    if (this.nextListeners === this.currentListeners) {
      this.nextListeners = this.currentListeners.slice()
    }
  }

  addNestedSub(listener) {
    this.trySubscribe()

    let isSubscribed = true
    this.ensureCanMutateNextListeners()
    this.nextListeners.push(listener)

    return function unsubscribe() {
      if (!isSubscribed) return
      isSubscribed = false

      this.ensureCanMutateNextListeners()
      const index = this.nextListeners.indexOf(listener)
      this.nextListeners.splice(index, 1)
    }
  }

  notifyNestedSubs() {
    const listeners = this.currentListeners = this.nextListeners
    const length = listeners.length
    for (let i = 0; i < length; i++) {
      listeners[i]()
    }
  }

  isSubscribed() {
    return Boolean(this.unsubscribe)
  }

  trySubscribe() {
    if (!this.unsubscribe) {
      this.unsubscribe = this.subscribe(this.onStateChange)
    }
  }

  tryUnsubscribe() {
    if (this.unsubscribe) {
      this.unsubscribe()
    }
    this.unsubscribe = null
  }
}
