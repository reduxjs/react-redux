// encapsulates the subscription logic for connecting a component to the redux store, as well as
// nesting subscriptions of decendant components, so that we can ensure the ancestor components
// re-render before descendants

export default class Subscription {
  constructor(store, parentSub, onStateChange) {
    this.subscribe = parentSub
      ? parentSub.addNestedSub.bind(parentSub)
      : store.subscribe

    this.onStateChange = onStateChange
    this.unsubscribe = null
    this.nestedSubs = []
    this.notifyNestedSubs = this.notifyNestedSubs.bind(this)
  }

  addNestedSub(listener) {
    this.trySubscribe()
    this.nestedSubs = this.nestedSubs.concat(listener)

    let subscribed = true
    return () => {
      if (!subscribed) return
      subscribed = false

      const subs = this.nestedSubs.slice()
      const index = subs.indexOf(listener)
      subs.splice(index, 1)
      this.nestedSubs = subs
    }
  }

  isSubscribed() {
    return Boolean(this.unsubscribe)
  }

  notifyNestedSubs() {
    const subs = this.nestedSubs
    for (let i = subs.length - 1; i >= 0; i--) {
      subs[i]()
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
