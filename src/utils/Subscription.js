import { getBatch } from './batch'

// encapsulates the subscription logic for connecting a component to the redux store, as
// well as nesting subscriptions of descendant components, so that we can ensure the
// ancestor components re-render before descendants

const nullListeners = { notify() {} }

// 对listener的收集，listener是一个双向链表
function createListenerCollection() {
  const batch = getBatch()
  let first = null
  let last = null

  return {
    clear() {
      first = null
      last = null
    },

    // 触发链表所有节点的回调
    notify() {
      // batch会被set成unstable_batchedUpdates，react批量更新，避免了多次checkForUpdate多次render的问题。也避免了useSelector这种平级注册的情况下，子节点比父节点先checkForUpdate可能带来的问题
      batch(() => {
        let listener = first
        while (listener) {
          listener.callback()
          listener = listener.next
        }
      })
    },

    // 以数组的形式返回所有节点
    get() {
      let listeners = []
      let listener = first
      while (listener) {
        listeners.push(listener)
        listener = listener.next
      }
      return listeners
    },

    // 向链表末尾添加节点，并返回一个删除该节点的undo
    subscribe(callback) {
      let isSubscribed = true

      let listener = (last = {
        callback,
        next: null,
        prev: last,
      })

      if (listener.prev) {
        listener.prev.next = listener
      } else {
        first = listener
      }

      // unsubscribe就是个双向链表的删除指定节点操作
      return function unsubscribe() {
        // 阻止无意义执行
        if (!isSubscribed || first === null) return
        isSubscribed = false

        // 如果添加的这个节点已经有了后续节点
        if (listener.next) {
          // next的prev应该为该节点的prev
          listener.next.prev = listener.prev
        } else {
          // 没有则说明该节点是最后一个，将prev节点作为last节点
          // Why: 为什么prev节点的next不需要置为null？
          last = listener.prev
        }
        // 如果有前节点prev
        if (listener.prev) {
          // prev的next应该为该节点的next
          listener.prev.next = listener.next
        } else {
          // 否则说明该节点是第一个，把它的next给first
          first = listener.next
        }
      }
    },
  }
}

export default class Subscription {
  constructor(store, parentSub) {
    this.store = store
    this.parentSub = parentSub
    this.unsubscribe = null
    this.listeners = nullListeners

    this.handleChangeWrapper = this.handleChangeWrapper.bind(this)
  }

  // 增加一个嵌套的子订阅
  addNestedSub(listener) {
    // 只会执行一次
    // 如果有parentSub，即父级的监听实例，那么会把本实例中的 触发订阅方法 订阅给父实例。父实例如果没有向它的父示例注册过，也会同样如此递归下去
    // 如果没有parentSub，说明是根实例，则把 触发订阅方法 注册给redux subscribe，将来redux state更新后会被调用
    this.trySubscribe()
    // 将子订阅注册到自己的listeners中
    return this.listeners.subscribe(listener)
  }

  // 遍历调用 listeners 中的回调，即触发所有嵌套的子订阅
  notifyNestedSubs() {
    this.listeners.notify()
  }

  // 最外层的触发订阅方法，实际上是调用notifyNestedSubs或checkForUpdates
  handleChangeWrapper() {
    if (this.onStateChange) {
      this.onStateChange()
    }
  }

  isSubscribed() {
    return Boolean(this.unsubscribe)
  }

  trySubscribe() {
    if (!this.unsubscribe) {
      // 如果有父级的监听实例，那么会把本实例的 触发订阅方法 交给父实例
      // 如果没有，则把 触发订阅方法 注册给redux subscribe，将来redux state更新后会被调用
      // 返回一个undo，放在this.unsubscribe里
      this.unsubscribe = this.parentSub
        ? this.parentSub.addNestedSub(this.handleChangeWrapper)
        : this.store.subscribe(this.handleChangeWrapper)

      // 初始化一个listener收集器
      this.listeners = createListenerCollection()
    }
  }

  // 注销监听
  tryUnsubscribe() {
    if (this.unsubscribe) {
      this.unsubscribe()
      this.unsubscribe = null
      this.listeners.clear()
      this.listeners = nullListeners
    }
  }
}
