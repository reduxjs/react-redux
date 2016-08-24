// encapsulates the subscription logic for connecting a component to the redux store, as
// well as nesting subscriptions of descendant components, so that we can ensure the
// ancestor components re-render before descendants

function initListeners() {
  let current = []
  let next = []

  return {
    clear() {
      next = null
      current = null
    },

    notify() {
      current = next
      for (let i = 0; i < current.length; i++) {
        current[i]()
      }
    },

    subscribe(listener) {
      let isSubscribed = true
      if (next === current) next = current.slice()
      next.push(listener)

      return function unsubscribe() {
        if (!isSubscribed || !current) return
        isSubscribed = false

        if (next === current) next = current.slice()
        next.splice(next.indexOf(listener), 1)
      }
    }
  }
}

export default class Subscription {
  constructor(store, parentSub) {
    this.subscribe = parentSub
      ? parentSub.addNestedSub.bind(parentSub)
      : store.subscribe.bind(store)

    this.unsubscribe = null
    this.listeners = initListeners()
  }

  addNestedSub(listener) {
    this.trySubscribe()
    return this.listeners.subscribe(listener)
  }

  notifyNestedSubs() {
    this.listeners.notify()
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
      this.listeners.clear()
    }
    this.unsubscribe = null
    this.subscribe = null
    this.listeners = { notify() {} }
  }
}
