import React, {
  useContext,
  useRef,
  useMemo,
  useCallback,
  useLayoutEffect,
  useEffect
} from 'react'

import { ReactReduxContext } from '../components/Context'

// React currently throws a warning when using useLayoutEffect on the server.
// To get around it, we can conditionally useEffect on the server (no-op) and
// useLayoutEffect in the browser. We need useLayoutEffect to ensure we can
// run effects before the node is updated in our queue
const useIsomorphicLayoutEffect =
  typeof window !== 'undefined' ? useLayoutEffect : useEffect

/*
  makeUseSelector is implemented as a factory first in order to support the need
  for user supplied contexts.
*/
export function makeUseSelector(Context) {
  /*
    useSelector is designed to work with the node semantics of the updater
    which drive state updates into components in a top down manner and propogate
    new states to connected components and hooks in a consistent manner

    The general approach is to make the useSelector instance known to the updater
    by creating a node on the very first render for the useSelector instance.
    This constraint ensures the updater has an unamiguous order in which to
    execute updates.

    The node holds information about that last rendered state for this useSelector
    instance. useSelector's are comging into existence when the updater is not
    currently dispatching an update then it simply reads the latest state and
    memozies the computation until either the state or the selector change

    It also provides the updater node an update function. the updater will use
    this function to potentially trigger a re-render when a state update is being
    processed.

    It is useful to know that depending on a nodes position next to it's
    neighbors the node will 'see' new states as it is re-rendered but never
    have it's updater called. This is because if a preceding node (a node in a parent
    component for instance) triggers an update and that causes this node's owner
    (the component calling useSelector) to rerender then the node will appear to
    already be on the latest state by the time the updater gets around to
    deciding whether to call the update function (it will skip it)
  */
  return function useSelector(selector, deps) {
    // use react-redux context
    let context = useContext(Context)

    // memoize the selector with the provided deps
    let select = useCallback(selector, deps)

    // expose a ref to updater so the node can access the latest update function
    let updateRef = useRef(null)

    // on mount construct a node with a ref to the updater
    let nodeRef = useRef(null)
    if (nodeRef.current === null) {
      nodeRef.current = context.createNode(updateRef)
    }

    // this node identity will be stable across re-renders
    let node = nodeRef.current

    // this queue identity will be stable across re-renders
    let queue = node.queue

    // this queueState is the latest state the queue knows about
    let queueState = queue.state

    // if this render commits ensure node captures state it rendered with
    // this needs to run before commit phase finishes so we can skip this
    // node during an update work loop if it was already rendered as part of
    // another update
    useIsomorphicLayoutEffect(() => {
      node.state = queueState
    }, [queueState])

    // establish trigger for re-renders when selected state changes
    // capture memoized values if updater produces new state
    let [[memoSlice, memoSelect, memoState], setMemoSelection] = React.useState(
      []
    )

    // compute slice if necessary
    let slice = useMemo(() => {
      if (queueState === memoState && select === memoSelect) {
        return memoSlice
      }
      return select(queueState)
    }, [node, select, queueState, memoSlice, memoSelect, memoState])

    // expose a ref to last slice for listener to bail out from
    let lastSliceRef = useRef(null)
    // if this render commits ensure the latest slice is updated
    // @TODO does useEffect work here. does react guarantee tha that effects
    // flush before the next update to this component is processed?
    useIsomorphicLayoutEffect(() => {
      lastSliceRef.current = slice
    }, [slice])

    /*
      the update function is called by the updater to potentially trigger an
      update when the selected state changes. it dereferences the update state
      from the queue directly because we want to capture new states the component
      has not yet seen.

      @TODO this function can easily be memoized with useCallback. however if
      there is no overhead to refreshing it on every render we can decrease
      complexity and load on hooks by recreating it on every render
    */
    let update = () => {
      let slice = select(queue.state)
      if (lastSliceRef.current !== slice) {
        context.updating()
        setMemoSelection([slice, select, queue.state])
      } else {
        // since this node won't update we can set the node.state now
        node.state = queue.state
      }
    }

    // update listener for next update and nullify on unmount
    useIsomorphicLayoutEffect(() => {
      updateRef.current = update
      return () => (updateRef.current = null)
    })

    return slice
  }
}

export const useSelector = makeUseSelector(ReactReduxContext)
