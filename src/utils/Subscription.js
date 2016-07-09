
// a linked list of nest subscription listeners. Implementing as a LL instead of an array
// makes for cheaper subscriptions & unsubscriptions vs cloning/mutating an array. Also, it
// was nice to implement a linked list for the first time in like 15 years.
function createNestedSubList() {
  const head = {}

  return {
    subscribe(listener) {
      const first = head.next
      let current = head.next = { listener, prev: head, next: first }
      if (first) first.prev = current

      return function unsubscribe() {
        if (!current) return

        // unsubscribe takes itself out of the list, by updating its neighbors to point to
        // each other
        const { next, prev } = current
        if (next) next.prev = prev
        prev.next = next
        current = null
      }
    },
    notifyAll() {
      let current = head.next

      while (current) {
        current.listener()
        current = current.next
      }
    }
  }
}


// encapsulates the subscription logic for connecting a component to the redux store, as
// well as nesting subscriptions of descendant components, so that we can ensure the
// ancestor components re-render before descendants
export default class Subscription {
  constructor(store, parentSub, onStateChange) {
    this.subscribe = parentSub
      ? parentSub.addNestedSub.bind(parentSub)
      : store.subscribe

    this.onStateChange = onStateChange
    this.unsubscribe = null
    this.nestedSubs = createNestedSubList()
  }

  addNestedSub(listener) {
    this.trySubscribe()
    return this.nestedSubs.subscribe(listener)
  }

  isSubscribed() {
    return Boolean(this.unsubscribe)
  }

  trySubscribe() {
    if (this.unsubscribe) return

    this.unsubscribe = this.subscribe(() => {
      this.onStateChange(this.nestedSubs.notifyAll)
    })
  }

  tryUnsubscribe() {
    if (this.unsubscribe) {
      this.unsubscribe()
    }
    this.unsubscribe = null
  }
}
