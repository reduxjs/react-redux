import { unstable_batchedUpdates } from 'react-dom'

let MockPerformance = {
  mark: () => {},
  measure: () => {}
}

let performance = MockPerformance

export function createUpdater() {
  // define both work queues and set their nodes to point to themselves
  let queue = {
    type: 'queue',
    tag: 'queue',
    state: null,
    next: null,
    node: null,
    tail: null
  }
  queue.node = queue
  queue.tail = queue

  // states to process
  let states = []

  let store = null

  function setStore(storeToSet) {
    if (store !== storeToSet) {
      store = storeToSet
      newState(store.getState())
    }
  }

  function dispatch(...args) {
    if (store === null) {
      // console.log('dispatch, store is null')
      throw new Error(
        'dispatch was called when no store was associated with this ReduxContext'
      )
    }
    // console.log('dispatch, dispatching', ...args)
    return store.dispatch(...args)
  }

  function newState(state) {
    if (queue.state !== state) {
      // console.log('newState, starting update with new state')
      states.push(state)
      startUpdateWork()
    } else {
      // console.log('newState, state has already been processed')
    }
  }

  let hasMark = false

  function startUpdateWork() {
    if (isWorking) {
      return /*console.log(
        'startUpdateWork, already working, new work will begin when current update finishes'
      )*/
    } else if (states.length === 0) {
      return //console.log('startUpdateWork, no actions available to process')
    }

    // console.log('startUpdateWork, new update to start')

    // assign latest states clear out intermediate states
    queue.state = states.pop()

    // drop intermediate states
    states.length = 0

    // confirm queue.node is end of list
    if (queue.node !== queue) {
      // console.log(
      //   'startUpdateWork, called when not working but there is an unfinished update'
      // )
      throw new Error(
        'startUpdateWork, called when not working but there is an unfinished update'
      )
    }

    if (queue.next === null) {
      return //console.log('startUpdateWork, queue is empty')
    }

    // console.warn('performance', performance.getEntriesByType('measure'))
    // doWork()
    if (hasMark) performance.measure('time to update', 'startUpdate')
    performance.mark('startUpdate')
    hasMark = true
    unstable_batchedUpdates(doWork)
  }

  let isWorking = false
  let workNode = null

  function doWork() {
    // console.log('doWork')
    if (isWorking) {
      // console.log('doWork, already working, wait for work to finishh')
      return
    }

    let node = queue.node.next

    // return early if no nodes to process
    if (node === null) {
      // console.log('doWork, nothing left to do work on, checkForWork')
      return checkForWork()
    }

    while (node !== null) {
      let nextNode = node.next
      if (node.updater.current === null) {
        // console.log('doWork, remove', node.tag)
        if (queue.tail === node) {
          queue.tail = queue.node
        }
        queue.node.next = node.next
      } else if (node.state === queue.state) {
        // console.log('doWork, node already updated, skip', node.tag)
      } else {
        // console.log('doWork, process', node.tag)
        node.state = queue.state
        node.updater.current()
      }
      queue.node = node
      node = nextNode
      if (isWorking) {
        return
      }
    }

    checkForWork()
  }

  function checkForWork() {
    if (isWorking) {
      // console.log('checkForWork, already working, do nothing')
      return
    } else {
      // console.log('checkForWork, not working, startUpdateWork')
      // set node pointer back to queue
      queue.node = queue

      // schedule a new update async
      setTimeout(startUpdateWork, 0)
    }
  }

  let create = (updater, label) => {
    let node = {
      tag: label,
      updater: updater,
      queue: queue,
      state: queue.state,
      next: null
    }
    // console.log('creating', node)
    queue.tail.next = node
    queue.tail = node
    return node
  }

  let updating = node => {
    // console.log(`updating, workNode ${workNode && workNode.tag}`)
    // console.log(`updating, node ${node.tag}`)
    isWorking = true
    workNode = node
  }

  let workCount = 0

  let continueUpdate = node => {
    if (workNode === node) {
      // console.log(`continueUpdate, node ${node.tag} IS workNode, doWork`)

      if (++workCount < 10) {
        restartWork()
      } else {
        workCount = 0
        micro(restartWork)
      }
    } else {
      // console.log(
      //   `continueUpdate, node ${node.tag} not workNode, do nothing`,
      //   workNode && workNode.tag
      // )
    }
  }

  function restartWork() {
    workNode = null
    isWorking = false
    unstable_batchedUpdates(doWork)
  }

  return {
    create,
    updating,
    continueUpdate,
    newState,
    setStore,
    dispatch
  }
}

function micro(fn) {
  performance.mark('micro')
  Promise.resolve().then(() => {
    performance.measure('micro to now', 'micro')
    fn()
  })
}
