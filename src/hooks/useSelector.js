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

export function makeUseSelector(Context) {
  return function useSelector(selector, deps) {
    // use react-redux context
    let context = useContext(Context)

    // memoize the selector with the provided deps
    let select = useCallback(selector, deps)

    // expose a ref to updater so the node can access the latest updater
    let updateRef = useRef(null)

    // on mount construct a node with a ref to the updater
    let nodeRef = useRef(null)
    if (nodeRef.current === null) {
      nodeRef.current = context.create(updateRef)
    }

    // this node identity will be stable across re-renders
    let node = nodeRef.current

    // this queue identity will be stable across re-renders
    let queue = node.queue

    // this queueState is the latest state the queue knows about
    let queueState = queue.state

    // if this render commits ensure node captures state it rendered with
    useIsomorphicLayoutEffect(() => {
      node.state = queueState
    }, [queueState])

    // establish trigger for re-renders when selected state changes
    // capture memoized values if updater produces new state
    let [[memoSlice, memoSelect, memoState], setMemoSelection] = React.useState(
      false
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
        context.updating(node)
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
