import React, { useLayoutEffect, useEffect } from 'react'

import { ReactReduxContext } from '../components/Context'

// React currently throws a warning when using useLayoutEffect on the server.
// To get around it, we can conditionally useEffect on the server (no-op) and
// useLayoutEffect in the browser. We need useLayoutEffect to ensure we can
// run effects before the node is updated in our queue
const useIsomorphicLayoutEffect =
  typeof window !== 'undefined' ? useLayoutEffect : useEffect

const NOOP_FN = () => {}

export function makeUseSelector(Context) {
  return function useSelector(selector, deps) {
    // use react-redux context
    let context = React.useContext(Context)

    // memoize the selector with the provided deps
    let select = React.useCallback(selector, deps)

    // expose a ref to work node to execute latest updater
    let updaterRef = React.useRef(NOOP_FN)

    // on mount construct a node with a ref to the updater
    let nodeRef = React.useRef(null)
    if (nodeRef.current === null) {
      nodeRef.current = context.create(updaterRef)
    }

    // this node identity will be stable across re-renders
    let node = nodeRef.current

    // this queue identity will be stable across re-renders
    let queue = node.queue

    // if this render commits ensure node captures state it rendered with
    useIsomorphicLayoutEffect(() => {
      node.state = queue.state
    }, [queue.state])

    // establishh trigger for re-renders when selected state changes
    let [[memoSlice, memoSelect, memoState], setMemoSelection] = React.useState(
      false
    )

    // compute slice if necessary
    let slice = React.useMemo(() => {
      if (queue.state === memoState && select === memoSelect) {
        // console.log(
        //   'skipping slice computation and using listeners captured result',
        //   node.tag
        // )
        return memoSlice
      }
      return select(queue.state)
    }, [node, memoSlice, memoSelect, memoState, select, queue.state])

    // expose a ref to last slice for listener to bail out from
    let lastSliceRef = React.useRef(null)
    // if this render commits ensure the latest slice is updated
    useIsomorphicLayoutEffect(() => {
      lastSliceRef.current = slice
    }, [slice])

    // ref stable updater
    let updater = React.useCallback(() => {
      // console.log('updater', queue.state)
      let slice = select(queue.state)
      if (lastSliceRef.current !== slice) {
        // console.log('slice is different so we will update things', node.tag)
        context.updating(node)
        setMemoSelection([slice, select, queue.state])
      } else {
        // since this node won't update we can set the node.state now
        node.state = queue.state
      }
    }, [node, select, queue, context])

    // update listener for next update and nullify on unmount
    useIsomorphicLayoutEffect(() => {
      updaterRef.current = updater
      return () => (updaterRef.current = null)
    }, [updater])

    // resume updates after render finishes
    // this needs to be the last layout effect
    useIsomorphicLayoutEffect(() => {
      context.continueUpdate(node)
    })

    return slice
  }
}

export const useSelector = makeUseSelector(ReactReduxContext)
