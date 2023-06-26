import type { Store } from 'redux'
import { getBatch } from './batch'
import type { Node } from './autotracking/tracking'

import {
  createCache,
  TrackingCache,
  $REVISION,
} from './autotracking/autotracking'
import { updateNode } from './autotracking/proxy'

// encapsulates the subscription logic for connecting a component to the redux store, as
// well as nesting subscriptions of descendant components, so that we can ensure the
// ancestor components re-render before descendants

type VoidFunc = () => void

export interface CacheWrapper {
  cache: TrackingCache
}

type Listener = {
  callback: VoidFunc
  next: Listener | null
  prev: Listener | null
  trigger: 'always' | 'tracked'
  selectorCache?: CacheWrapper
}

function createListenerCollection() {
  const batch = getBatch()
  let first: Listener | null = null
  let last: Listener | null = null

  return {
    clear() {
      first = null
      last = null
    },

    notify() {
      //console.log('Notifying subscribers')
      batch(() => {
        let listener = first
        while (listener) {
          //console.log('Listener: ', listener)
          if (listener.trigger == 'tracked') {
            if (listener.selectorCache!.cache.needsRecalculation()) {
              //console.log('Calling subscriber due to recalc need')
              // console.log(
              //   'Calling subscriber due to recalc. Revision before: ',
              //   $REVISION
              // )
              listener.callback()
              //console.log('Revision after: ', $REVISION)
            } else {
              // console.log(
              //   'Skipping subscriber, no recalc: ',
              //   listener.selectorCache
              // )
            }
          } else {
            listener.callback()
          }
          listener = listener.next
        }
      })
    },

    get() {
      let listeners: Listener[] = []
      let listener = first
      while (listener) {
        listeners.push(listener)
        listener = listener.next
      }
      return listeners
    },

    subscribe(
      callback: () => void,
      options: AddNestedSubOptions = { trigger: 'always' }
    ) {
      let isSubscribed = true

      //console.log('Adding listener: ', options.trigger)

      let listener: Listener = (last = {
        callback,
        next: null,
        prev: last,
        trigger: options.trigger,
        selectorCache:
          options.trigger === 'tracked' ? options.cache! : undefined,
        // subscriberCache:
        //   options.trigger === 'tracked'
        //     ? createCache(() => {
        //         console.log('Calling subscriberCache')
        //         listener.selectorCache!.get()
        //         callback()
        //       })
        //     : undefined,
      })

      if (listener.prev) {
        listener.prev.next = listener
      } else {
        first = listener
      }

      return function unsubscribe() {
        if (!isSubscribed || first === null) return
        isSubscribed = false

        if (listener.next) {
          listener.next.prev = listener.prev
        } else {
          last = listener.prev
        }
        if (listener.prev) {
          listener.prev.next = listener.next
        } else {
          first = listener.next
        }
      }
    },
  }
}

type ListenerCollection = ReturnType<typeof createListenerCollection>

interface AddNestedSubOptions {
  trigger: 'always' | 'tracked'
  cache?: CacheWrapper
}

export interface Subscription {
  addNestedSub: (listener: VoidFunc, options?: AddNestedSubOptions) => VoidFunc
  notifyNestedSubs: VoidFunc
  handleChangeWrapper: VoidFunc
  isSubscribed: () => boolean
  onStateChange?: VoidFunc | null
  trySubscribe: (options?: AddNestedSubOptions) => void
  tryUnsubscribe: VoidFunc
  getListeners: () => ListenerCollection
}

const nullListeners = {
  notify() {},
  get: () => [],
} as unknown as ListenerCollection

export function createSubscription(
  store: Store,
  parentSub?: Subscription,
  trackingNode?: Node<any>
) {
  let unsubscribe: VoidFunc | undefined
  let listeners: ListenerCollection = nullListeners

  function addNestedSub(
    listener: () => void,
    options: AddNestedSubOptions = { trigger: 'always' }
  ) {
    //console.log('addNestedSub: ', options)
    trySubscribe(options)
    return listeners.subscribe(listener, options)
  }

  function notifyNestedSubs() {
    if (store && trackingNode) {
      //console.log('Updating node in notifyNestedSubs')
      updateNode(trackingNode, store.getState())
    }
    listeners.notify()
  }

  function handleChangeWrapper() {
    if (subscription.onStateChange) {
      subscription.onStateChange()
    }
  }

  function isSubscribed() {
    return Boolean(unsubscribe)
  }

  function trySubscribe(options: AddNestedSubOptions = { trigger: 'always' }) {
    if (!unsubscribe) {
      //console.log('trySubscribe, parentSub: ', parentSub)
      unsubscribe = parentSub
        ? parentSub.addNestedSub(handleChangeWrapper, options)
        : store.subscribe(handleChangeWrapper)

      listeners = createListenerCollection()
    }
  }

  function tryUnsubscribe() {
    if (unsubscribe) {
      unsubscribe()
      unsubscribe = undefined
      listeners.clear()
      listeners = nullListeners
    }
  }

  const subscription: Subscription = {
    addNestedSub,
    notifyNestedSubs,
    handleChangeWrapper,
    isSubscribed,
    trySubscribe,
    tryUnsubscribe,
    getListeners: () => listeners,
  }

  return subscription
}
