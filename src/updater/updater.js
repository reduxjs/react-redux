import { unstable_batchedUpdates } from 'react-dom'

let MockPerformance = {
  mark: () => {},
  measure: () => {}
}

let performance = MockPerformance

/*
 @TODO remove hack to detect if we are running in jsdom. the current
 version of react test utils act does not allow for a enough time for the
 microtask to start before returning control to the caller so tests that assert
 after an act call can fail because they are checking a partially applied update

 to avoid this we simply run the update steps synchronously in jsdom environments
 this doesn't work in actual production code because react enforces a maximum
 cascading updating count of 50 at the moment.

 there is a work around one can do in tests where act calls are followed by a
 resolved promise
 `
     act(() => {
       store.dispatch(...)
     })
     await Promise.resolve()
     expect(...)
 `

 this requires the test to be an async function but when you do this you allow
 for internally scheduled microtasks to complete before control is returned to
 your test and assertions are run

 In React 16.9 there will be support for an async form of act that I suspect will
 eliminate the need for the dummy promise. in the meantime the sync update workaround
 seems sufficient to allow investigation of this libraries updater technique
 */
let _IS_TEST_ = !global.navigator || navigator.userAgent.includes('jsdom')

let _DEV_ = false
let _TRACE_WORK_ = _DEV_ && true

export function createUpdater() {
  // define circular node queue to hold updating nodes
  let queue = {
    state: null,
    lastNode: null,
    cursorNode: null
  }

  function appendNodeToQueue(node) {
    let lastNode = queue.lastNode
    let cursorNode = queue.cursorNode
    if (lastNode === null) {
      if (_TRACE_WORK_) {
        console.log(
          `appendNodeToQueue, appending first node, ${node.index} to queue`
        )
      }
      queue.lastNode = node
      node.nextNode = node
      queue.cursorNode = node
    } else {
      if (_TRACE_WORK_) {
        console.log(`appendNodeToQueue, appending node ${node.index} to queue`)
      }
      node.nextNode = lastNode.nextNode
      queue.lastNode.nextNode = node
      if (cursorNode === lastNode) {
        queue.cursorNode = node
      }
      queue.lastNode = node
    }
  }

  function removeCurrentNode() {
    let lastNode = queue.lastNode
    let cursorNode = queue.cursorNode
    if (lastNode === null) {
      if (_TRACE_WORK_) {
        console.error(`removeCurrentNode, no more nodes to remove`)
      }
      return
    } else if (lastNode === lastNode.nextNode) {
      if (_TRACE_WORK_) {
        console.log(
          `removeCurrentNode, only 1 node to remove, removing ${lastNode.index}`
        )
      }
      lastNode.nextNode = null
      queue.lastNode = null
      queue.cursorNode = null
    } else {
      // handle of removale node
      let removeNode = cursorNode.nextNode
      if (_TRACE_WORK_) {
        console.log(
          `removeCurrentNode, cursorNode ${cursorNode.index}, removing ${
            removeNode.index
          }`
        )
      }
      // if the removed node is the last node we need to point the last node at
      // the cursorNode instead
      if (removeNode === lastNode) {
        queue.lastNode = cursorNode
      }
      cursorNode.nextNode = removeNode.nextNode
    }
  }

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
      if (_TRACE_WORK_) {
        console.log(`newState, starting update with new state`, state)
      }
      states.push(state)
      startUpdateWork()
    } else {
      if (_TRACE_WORK_) {
        console.log(`newState, state has already been processed`, state)
      }
    }
  }

  let hasMark = false

  function startUpdateWork() {
    if (isWorking) {
      if (_TRACE_WORK_) {
        console.log(
          `startUpdateWork, already working, new work will begin when current update finishes`
        )
      }
      return
    } else if (states.length === 0) {
      if (_TRACE_WORK_) {
        console.log(`startUpdateWork, no actions available to process`)
      }
      return
    }

    if (_TRACE_WORK_) {
      console.log(`startUpdateWork, new update to start`)
    }

    // assign latest states clear out intermediate states
    queue.state = states.pop()

    // drop intermediate states
    states.length = 0

    if (queue.lastNode === null) {
      if (_TRACE_WORK_) {
        console.log(`startUpdateWork, queue is empty`)
      }
      return
    }

    // confirm queue.node is end of list
    if (queue.cursorNode !== queue.lastNode) {
      if (_TRACE_WORK_) {
        console.error(
          `startUpdateWork, called when not working but there is an unfinished update`
        )
      }
      throw new Error(
        'startUpdateWork, called when not working but there is an unfinished update'
      )
    }

    if (_TRACE_WORK_) {
      if (hasMark) performance.measure('time to update', 'startUpdate')
      performance.mark('startUpdate')
      hasMark = true
    }
    unstable_batchedUpdates(doWork)
  }

  let isWorking = false
  let workNode = null

  function doWork() {
    if (isWorking) {
      if (_TRACE_WORK_) {
        console.log(`doWork, already working, wait for work to finish`)
      }
      return
    }

    // return early if no nodes to process
    if (queue.lastNode === null) {
      if (_TRACE_WORK_) {
        console.log(`doWork, nothing left to do work on, checkForWork`)
      }
      return checkForWork()
    }

    workLoop: do {
      let node = queue.cursorNode.nextNode

      while (node.updater.current === null) {
        if (_TRACE_WORK_) {
          console.log(`doWork, remove current node`)
        }
        removeCurrentNode()
        if (queue.lastNode === null) break workLoop
        node = queue.cursorNode.nextNode
      }

      if (node.state === queue.state) {
        if (_TRACE_WORK_) {
          console.log(`doWork, node ${node.index} already updated, skip`)
        }
      } else {
        if (_TRACE_WORK_) {
          console.log(`doWork, process node ${node.index}`)
        }
        node.updater.current()
      }
      queue.cursorNode = node

      if (isWorking) {
        if (_TRACE_WORK_) {
          console.log(
            `doWork, node ${node.index} is now updating, defer to React`
          )
        }
        return
      }
    } while (queue.cursorNode !== queue.lastNode)

    checkForWork()
  }

  function checkForWork() {
    if (isWorking) {
      if (_TRACE_WORK_) {
        console.log(
          `checkForWork, already working on ${workNode.index}, do nothing`
        )
      }
      return
    } else {
      if (_TRACE_WORK_) {
        console.log(`checkForWork, not working, startUpdateWork`)
      }
      // schedule a new update async
      // @TODO
      setTimeout(startUpdateWork, 0)
    }
  }

  let nodeCount = 0

  let create = updater => {
    let node = {
      index: nodeCount++,
      updater: updater,
      queue: queue,
      state: queue.state,
      nextNode: null
    }

    appendNodeToQueue(node)

    return node
  }

  let updating = node => {
    isWorking = true
    workNode = node
    if (_TRACE_WORK_) {
      console.log(`updating, workNode ${node.index}`)
    }
  }

  let continueUpdate = node => {
    if (workNode === node) {
      if (_TRACE_WORK_) {
        console.log(
          `continueUpdate, node ${node.index} is workNode, restartWork`
        )
      }
      micro(restartWork)
    } else {
      if (_TRACE_WORK_) {
        console.log(
          `continueUpdate, node ${node.index} not workNode, do nothing`
        )
      }
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
  if (_IS_TEST_) {
    fn()
    return
  }
  performance.mark('micro')
  Promise.resolve().then(() => {
    performance.measure('micro to now', 'micro')
    fn()
  })
}

function printQueue(queue) {
  if (queue.lastNode === null) {
    console.log(`printQueue, queue is empty`)
  } else {
    let nodeStrs = []
    let node = queue.lastNode
    do {
      node = node.nextNode
      if (queue.cursorNode === node) {
        nodeStrs.push(`cur(${node.index})->${node.nextNode.index}`)
      } else {
        nodeStrs.push(`${node.index}->${node.nextNode.index}`)
      }
    } while (node !== queue.lastNode)
    console.log(`printQueue, queue ${nodeStrs.join(', ')}`)
  }
}
