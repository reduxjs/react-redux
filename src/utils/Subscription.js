// encapsulates the subscription logic for connecting a component to the redux store, as
// well as nesting subscriptions of descendant components, so that we can ensure the
// ancestor components re-render before descendants

const CLEARED = null
const nullListeners = { notify() {} }

function createListenerCollection() {
  // the current/next pattern is copied from redux's createStore code.
  // TODO: refactor+expose that code to be reusable here?
  let current = []
  let next = []

  return {
    clear() {
      next = CLEARED
      current = CLEARED
    },

    notify() {
      const listeners = current = next
      for (let i = 0; i < listeners.length; i++) {
        listeners[i]()
      }
    },

    get() {
      return next
    },

    subscribe(listener) {
      let isSubscribed = true
      if (next === current) next = current.slice()
      next.push(listener)

      return function unsubscribe() {
        if (!isSubscribed || current === CLEARED) return
        isSubscribed = false

        if (next === current) next = current.slice()
        next.splice(next.indexOf(listener), 1)
      }
    }
  }
}

// subscriptions are set up in componentDidMount, so we need to delay the actual subscribing until then.
// To do this, the subscription object is created but does not subscribe until the parent is ready
// in cDM, a parent calls "hydrate()" which triggers the resolution of the promise. If
// a child component tries to subscribe before this point, it will wait for the parent subscription
// to be ready and then try to subscribe.
export default class Subscription {
  constructor(store, parentSub, onStateChange) {
    this.store = store
    this.parentSub = parentSub
    this.onStateChange = onStateChange
    this.unsubscribe = null
    this.listeners = nullListeners
    this.loaded = false
  }

  markReady() {
    this.loaded = true
  }

  hydrate() {
    if (!this.loaded) {
      this.markReady()
    }
    this.trySubscribe()
  }

  isReady() {
    return this.loaded
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

  subscribeToParent() {
    this.unsubscribe = this.parentSub.addNestedSub(this.onStateChange)
    this.listeners = createListenerCollection()
  }

  trySubscribe() {
    if (!this.unsubscribe) {
      if (this.parentSub) {
        if (this.parentSub.isReady()) {
          return this.subscribeToParent()
        }
      } else {
        this.unsubscribe = this.store.subscribe(this.onStateChange)
        this.listeners = createListenerCollection()
      }
    }
  }

  tryUnsubscribe() {
    if (this.unsubscribe) {
      this.unsubscribe()
      this.unsubscribe = null
      this.listeners.clear()
      this.listeners = nullListeners
    }
  }
}
