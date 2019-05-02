import { unstable_batchedUpdates } from 'react-dom'

let MockPerformance = {
  mark: () => {},
  measure: () => {}
}

let performance = MockPerformance

let _DEV_ = false
let _TRACE_WORK_ = _DEV_ && true
let _TRACE_UPDATE_ = true

/*
  an updater holds state about which nodes are mounted and in which order. a node
  is an instance of the useSelector hook. for `connect` wrapped components there
  is only one node per component instance. For users of useSelector there may be
  many nodes per component instance

  The updater is responsible for calling update functions for each node and
  scheduling re-renders when a state selection is changed. It guarantees components
  will re-render from top down and that for any given state update a component will
  render at most once

  @TODO a note about testing: this updater technique relies of a frequent handing
  off between a work loop and react. act returns before all update work can complete
  in many cases leaind to failed test assertions. To allow for updates to flush fully
  the react-dom library was updated to 16.9.0-alpha.0 to allow the user of

  await act(async () => {...})

  this helps but is not perfect in cases where multiple store dispatches are executed
  synchronously. with enough deferral things will work out but it is not immediatley
  obvious how to guarantee updates fully flush before returning control to the test
*/
export function createUpdater() {
  /*
    our node queue is a circular singly-linked-list in the style of those used
    in react itself. You can append to it and you can remove the node immediately
    following the cursorNode (the node most recently processed). these
    restrictions guarantee node order never violates render order and that you
    cannot accidentally cause re-traversals of the queue.

    During an update each node is visited in the work loop exactly once

    the queue holds the state we are updating to. we may have received a more
    recent update already but we won't update the queue's state until any in progress
    update work has been completed and a new update is started
  */
  let queue = {
    state: null,
    lastNode: null,
    cursorNode: null
  }

  function appendNodeToQueue(node) {
    let lastNode = queue.lastNode
    let cursorNode = queue.cursorNode

    // queue is empty so we add our node as the only node. it is the last node
    // and the first node. we initialize the cursor at this point to equal the
    // last node signifying it is in a fully updated state
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
      // insert this node between the current last node and the first node
      if (_TRACE_WORK_) {
        console.log(`appendNodeToQueue, appending node ${node.index} to queue`)
      }
      node.nextNode = lastNode.nextNode
      queue.lastNode.nextNode = node
      // if the cursor node is already the current last node then advance the
      // cursor. this heuristic may not be the best but it captures a difference
      // between the queue being in an already updated state vs the queue being
      // in the middle of an update
      if (cursorNode === lastNode) {
        queue.cursorNode = node
      }
      queue.lastNode = node
    }
  }

  function removeNextNode() {
    let lastNode = queue.lastNode
    let cursorNode = queue.cursorNode

    if (lastNode === null) {
      // the queue is empty so there is nothing to remove. this should never
      // happen and probably should throw instead of return
      if (_TRACE_WORK_) {
        console.error(`removeNextNode, no more nodes to remove`)
      }
      return
    } else if (lastNode === lastNode.nextNode) {
      // the queue has one item so we need to empty the queue
      if (_TRACE_WORK_) {
        console.log(
          `removeNextNode, only 1 node to remove, removing ${lastNode.index}`
        )
      }
      lastNode.nextNode = null
      queue.lastNode = null
      queue.cursorNode = null
    } else {
      // the queue has more than one node. remove the one following the cursor
      let removeNode = cursorNode.nextNode
      if (_TRACE_WORK_) {
        console.log(
          `removeNextNode, cursorNode ${cursorNode.index}, removing ${
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

  /*
    states received from our store subscription will be held in an array
    temporarily to await processing in an update cycle. this library does
    not guarantee every state will be given an update but it does guarantee
    that updates will continue until the states array is empty
  */
  let states = []

  /*
    we hold a reference to the store provided to the updater
  */
  let store = null

  /*
    when a new store should be used setStore will capture it and force the
    new store state to propogate (if different from previous state)

    regardless of whether the store is new, capture the latest state
  */
  function setStore(storeToSet) {
    if (store !== storeToSet) {
      store = storeToSet
    }
    newState(store.getState())
  }

  /*
    dispatch wraps the store dispatch method, throwing if no store has been
    provided
  */
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

  let stateCt = 0
  /*
    newState will push the received state onto our state stack and attempt to
    start a new update. The update may not start right away if we are in the
    middle of another update
  */
  function newState(state) {
    if (queue.state !== state) {
      if (_TRACE_UPDATE_) {
        stateCt++
      }
      if (_TRACE_WORK_) {
        console.log(`newState, starting update with new state`, state)
      }
      states.push(state)
      startUpdate()
    } else {
      if (_TRACE_WORK_) {
        console.log(`newState, state has already been processed`, state)
      }
    }
  }

  let updates = 0
  let stateOnUpdate = 0
  /*
    startUpdate will attempt to start a new update if possible
  */
  function startUpdate() {
    // if an update is currently already in progress we need to bail out. when
    // the update finishes startUpdate will be called again
    if (isWorking) {
      if (_TRACE_WORK_) {
        console.log(
          `startUpdate, already working, new work will begin when current update finishes`
        )
      }
      return
    }

    // if there are no new states to process we have no update to start
    if (states.length === 0) {
      if (_TRACE_WORK_) {
        console.log(`startUpdate, no actions available to process`)
      }
      return
    }

    if (_TRACE_WORK_) {
      console.log(`startUpdate, new update to start`)
    }

    // assign latest states clear out intermediate states
    queue.state = states.pop()

    // drop intermediate states
    states.length = 0

    // if the queue is empty our update is already finished. newly created nodes
    // will read the latest state from queue.state
    if (queue.lastNode === null) {
      if (_TRACE_WORK_) {
        console.log(`startUpdate, queue is empty`)
      }
      return
    }

    // if the cursor node is not the last node then something went wrong. the
    // only time this should be true is when we are working on an in progress update
    // in which case we would have already bailed out of this execution
    if (queue.cursorNode !== queue.lastNode) {
      if (_TRACE_WORK_) {
        console.error(
          `startUpdate, called when not working but there is an unfinished update`
        )
      }
      throw new Error(
        'startUpdate, called when not working but there is an unfinished update'
      )
    }

    if (_TRACE_UPDATE_) {
      stateOnUpdate = stateCt
      updates++
      performance.mark('startUpdate')
    }
    // call doUpdateWork inside a batch to ensure we do not process effects
    // synchronously. we won't actually ever have more than one update per batch
    // so if there is another way to make sure we allow react update effects to
    // flush after asynchronously we should investigate using that
    unstable_batchedUpdates(doUpdateWork)
  }

  // track whether we are in the middle of update work or not
  let isWorking = false

  // track the origin of the work
  let workNode = null

  // push caught errors here to raise after update finishes.
  let caughtErrors = []

  /*
    doUpdateWork loops over the queue in parts, delegating to react when the
    first node requiring a re-render is found for that execution

    the queue append only structure paired with render time node creation
    guarantees that no "dependent" node (a child component or sibling
    useSelect ocurring after this one) can ocurr in the queue to the left of
    that node

    for example given a node queue of A -> B -> C -> D

    we guarantee that B cannot depend on C or D. said another way, nodes to the
    left of a node CAN affect it's select function or parentProps (if using connect)
    and nodes to the right of a node CANNOT.

    With this in mind, one way to guarantee top down updates is to simply update
    each node in sequence. this doUpdateWork is executed as a loop, delegating
    to react each time it schedules a single react state update and continueing
    when that update has been rendered and committed.

    this structure has some performance penalties because the commit phase is
    relatively expensive for the first react fiber update effect and each additional
    one adds very little extra cost in most cases because the fiber tree is
    traversed. there are performance gains elsewhere in this design that cause
    this performance hit to be balanced out somewhat. more investigative work on
    this should be done
  */
  function doUpdateWork() {
    try {
      if (_TRACE_UPDATE_) {
        performance.mark('workStep')
      }
      // if there is an in progress update bail out. it will be called again later
      if (isWorking) {
        if (_TRACE_WORK_) {
          console.log(`doUpdateWork, already working, wait for work to finish`)
        }
        return
      }

      // if there are no nodes to process we can complete the update and return
      if (queue.lastNode === null) {
        if (_TRACE_WORK_) {
          console.log(`doUpdateWork, nothing left to do work on, checkForWork`)
        }
        completeUpdate()
        return
      }

      // loop is labeled to allow breaking from within inner loop
      workLoop: do {
        // start with the first unprocessed node. if this is the first loop iteration
        // for a brand new update then this is the first node in the queue
        let nextNode = queue.cursorNode.nextNode

        // if our node updater is null the node's owner has unmounted and we can
        // clean this node up. loop over each empty node and remove them. there
        // often will be many given entire sub-trees and components with more than
        // one useSelect hook will unmount together
        while (nextNode.update.current === null) {
          if (_TRACE_WORK_) {
            console.log(`doUpdateWork, remove nextNode`)
          }
          removeNextNode()

          // if the queue is now empty we are done with the work loop
          // and can complete the update
          if (queue.lastNode === null) break workLoop

          // point to the new next node and recheck
          nextNode = queue.cursorNode.nextNode
        }

        // if the next node already received the current queue state it was
        // updated by a previous node's update work in a render cycle. skip
        // over it
        if (nextNode.state === queue.state) {
          if (_TRACE_WORK_) {
            console.log(
              `doUpdateWork, node ${nextNode.index} already updated, skip`
            )
          }
        } else {
          // the node's updater should be called. if the updater enqueus
          // an update for the node's component the isWorking boolean will
          // be set to true
          if (_TRACE_WORK_) {
            console.log(`doUpdateWork, process node ${nextNode.index}`)
          }
          try {
            // try the update function
            nextNode.update.current()
          } catch (e) {
            // catch errors to be rethrown later without interrupting the update
            // from continuing. @TODO this likely should be changed so that the
            // updater errors or not caught but the doUpdateWork resets the queue
            // in a finally block
            console.error('error', e)
            caughtErrors.push(e)
          }
        }
        // advance the cursor node
        queue.cursorNode = nextNode

        // if work started during this loop iteration as a result of the update
        // call we schedule a microtask to continue updates after react flushes
        // work synchronously. @TODO the use of a microtask won't work in concurrent
        // react b/c the update in react may not process synchronously. we should
        // revisit using a signal recived by useLayoutEffect that triggers update
        // continuation when the workNode (the node triggering this udpate) is
        // committed. earlier versions of this library did exactly that but there
        // are ways the work node can be unmounted and never execute a new useLayoutEffect.
        // However I think if did the update continuation in the effect cleanup call we
        // may be able to work around this
        if (isWorking) {
          if (_TRACE_WORK_) {
            console.log(
              `doUpdateWork, node ${
                nextNode.index
              } is now updating, defer to React`
            )
          }
          if (_TRACE_WORK_) {
            console.warn(`doUpdateWork, scheduling next work loop on microtask`)
          }
          // @TODO it would be ideal if we could have react call continueUpdate
          // the moment the current render is complete before the commit phase
          // begins. if you try to execute continueUpdate synchronously when your
          // workNode commits you end up getting hit with the maximum re-renders
          // limit (currently 50) and so it is not feasible at this time to
          // execute the next work loop until after react has relinquished control
          // @TODO scheduleAsMicrotask only works because react does all work
          // at Sync priority. the moment we have concurrent react this guarantee
          // is gone and either need a way to schedule at the same priority as
          // react or have react explicitly call the continuation
          scheduleAsMicrotask(continueUpdate)
          return
        }
        // if we get this far our nextNode was either removed, skipped, already
        // updated, or did not require an update. begin loop again unless this
        // node was the last node in the queue
      } while (queue.cursorNode !== queue.lastNode)

      // at this point we have exhausted the queue and can safely complete the
      // update
      if (_TRACE_UPDATE_) {
        performance.measure(
          `update ${updates}, state ${stateOnUpdate}`,
          'startUpdate'
        )
      }
      completeUpdate()
    } finally {
      if (_TRACE_UPDATE_) {
        performance.measure(`workStep `, 'workStep')
      }
    }
  }

  /*
    continueUpdate is scheduled after a new react update begins. it will begin
    after the commit phase but before the browser paints a frame. It resets
    workNode and isWorking states and calls our work loop function inside a new
    batched updates execution
    @TODO this function used to be called by an effect setup in useSelector and
    hence the batchedUpdates were required because otherwise react would flush
    the update synchronously before the work loop could continue when called from
    a callback. It may be unecessary not that this is executing on a new microtask
    but I'm leaving it in for now until we decide better how to deal with the
    coordination between react update cycles and the update work loop cycle
  */
  function continueUpdate() {
    workNode = null
    isWorking = false
    unstable_batchedUpdates(doUpdateWork)
  }

  /*
    completeUpdate will rethrow caught errors in their own task. As mentioned above
    we probably want the update to not catch and rethrow any updates and so this
    should proabably be refactored out

    After clearing caughErrors we check for next update
  */
  function completeUpdate() {
    let e
    while ((e = caughtErrors.pop())) {
      if (_TRACE_WORK_) {
        console.error(`completeUpdate, throwing caught error`, e)
      }
      scheduleAsTask(() => {
        throw e
      })
    }
    if (_TRACE_WORK_) {
      console.log(`completeUpdate, checkForNextUpdate`)
    }
    checkForNextUpdate()
  }

  /*
    checkForNextUpdate will make sure we are not in the middle of any update work
    and then schedule a new update on the Task queue. @TODO in it's current form this
    function should never be called when we are in the middle of an update so we
    can likely take this check out
  */
  function checkForNextUpdate() {
    if (isWorking) {
      if (_TRACE_WORK_) {
        console.log(
          `checkForNextUpdate, already working on ${workNode.index}, do nothing`
        )
      }
      return
    } else {
      if (_TRACE_WORK_) {
        console.log(`checkForNextUpdate, not working, startUpdate`)
      }
      // schedule a new update async
      // @TODO we want to give the browser a chance to render a frame. we very likely
      // might want put this on a different priority or use rAF or something.
      scheduleAsTask(startUpdate)
    }
  }

  // debug util for keep track of node identity and relative order
  let nodeCount = 0

  /*
    createNode, creates a node and appends it to the node queue. The update function comes
    from useSelect. create needs to be called in the render body once and only
    once and exactly on the very first execution to guarante ordering.
    if the render never commits the node will get cleaned up in a later update
  */
  let createNode = update => {
    let node = {
      index: nodeCount++,
      update: update,
      queue: queue,
      state: queue.state,
      nextNode: null
    }

    // append node ot queue
    appendNodeToQueue(node)

    // give node back to the caller since it is used in various parts of useSelect
    return node
  }

  /*
    updating tells us that this node sheduled an update in react. we use this
    to terminate the update work loop and allow react to render and commit the
    enuque updates before continueing the work loop
  */
  let updating = node => {
    isWorking = true
    workNode = node
    if (_TRACE_WORK_) {
      console.log(`updating, workNode ${node.index}`)
    }
  }

  // PRINT_QUEUE is a useful function to visualize the queue if you are debugging
  // in browser
  // window.PRINT_QUEUE = () => printQueue(queue)

  return [
    // the updater functions useful in Provider to subsbcrie to the redux store
    {
      newState,
      setStore
    },
    // the context value that we will consume in useSelector and useDispatch
    {
      createNode,
      updating,
      dispatch
    }
  ]
}

// will put fn execution on microtask queue by using a resolved promise
function scheduleAsMicrotask(fn) {
  Promise.resolve().then(fn)
}

// will put fn execution on task queue by using setTimout
function scheduleAsTask(fn) {
  setTimeout(fn, 0)
}

/*
  printQueue is a debug util for visualizing the node queue. it will not make it
  final implementation
*/
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
