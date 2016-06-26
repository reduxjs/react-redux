
// encapsulates the subscription logic for connecting a component to the redux store, as well as
// nesting subscriptions of decendant components, so that we can ensure the ancestor components
// re-render before descendants
export default class Subscription {
  constructor(store, parentSub, onStateChange) {
    this.subscribe = parentSub
      ? parentSub.addNestedSub.bind(parentSub)
      : store.subscribe

    this.onStateChange = onStateChange
    this.lastNestedSubId = 0
    this.unsubscribe = null
    this.nestedSubs = {}

    this.notifyNestedSubs = this.notifyNestedSubs.bind(this)
  }

  addNestedSub(listener) {
    this.trySubscribe()

    const id = this.lastNestedSubId++
    this.nestedSubs[id] = listener
    return () => {
      if (this.nestedSubs[id]) {
        delete this.nestedSubs[id]
      }
    }
  }

  isSubscribed() {
    return Boolean(this.unsubscribe)
  }

  notifyNestedSubs() {
    const keys = Object.keys(this.nestedSubs)
    for (let i = 0; i < keys.length; i++) {
      this.nestedSubs[keys[i]]()
    }
  }

  trySubscribe() {
    if (this.unsubscribe) return

    this.unsubscribe = this.subscribe(() => {
      this.onStateChange(this.notifyNestedSubs)
    })
  }

  tryUnsubscribe() {
    if (this.unsubscribe) {
      this.unsubscribe()
    }
    this.unsubscribe = null
  }
}
