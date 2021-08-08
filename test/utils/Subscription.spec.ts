import { createSubscription } from '../../src/utils/Subscription'
import type { Subscription } from '../../src/utils/Subscription'
import type { Store } from 'redux'

describe('Subscription', () => {
  let notifications: string[]
  let store: Store
  let parent: Subscription

  beforeEach(() => {
    notifications = []
    store = { subscribe: () => jest.fn() } as unknown as Store

    parent = createSubscription(store)
    parent.onStateChange = () => {}
    parent.trySubscribe()
  })

  function subscribeChild(name: string) {
    const child = createSubscription(store, parent)
    child.onStateChange = () => notifications.push(name)
    child.trySubscribe()
    return child
  }

  it('listeners are notified in order', () => {
    subscribeChild('child1')
    subscribeChild('child2')
    subscribeChild('child3')
    subscribeChild('child4')

    parent.notifyNestedSubs()

    expect(notifications).toEqual(['child1', 'child2', 'child3', 'child4'])
  })

  it('listeners can be unsubscribed', () => {
    const child1 = subscribeChild('child1')
    const child2 = subscribeChild('child2')
    const child3 = subscribeChild('child3')

    child2.tryUnsubscribe()
    parent.notifyNestedSubs()

    expect(notifications).toEqual(['child1', 'child3'])
    notifications.length = 0

    child1.tryUnsubscribe()
    parent.notifyNestedSubs()

    expect(notifications).toEqual(['child3'])
    notifications.length = 0

    child3.tryUnsubscribe()
    parent.notifyNestedSubs()

    expect(notifications).toEqual([])
  })
})
