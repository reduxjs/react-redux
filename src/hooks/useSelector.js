import React, { useLayoutEffect, useEffect } from 'react'

import { ReactReduxContext } from '../components/Context'

// React currently throws a warning when using useLayoutEffect on the server.
// To get around it, we can conditionally useEffect on the server (no-op) and
// useLayoutEffect in the browser. We need useLayoutEffect to ensure we can
// run effects before the node is updated in our queue
const useIsomorphicLayoutEffect =
  typeof window !== 'undefined' ? useLayoutEffect : useEffect

export function makeUseSelector(Context) {
  return function useSelector(select, label) {
    // use react-redux context
    let context = React.useContext(Context)

    // expose a ref to work node to execute latest updater
    let updaterRef = React.useRef(() => {})

    // on mount construct a node with a ref to listener
    let nodeRef = React.useRef(null)
    if (nodeRef.current === null) {
      nodeRef.current = context.create(updaterRef, label)
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
    let [memoSelection, setMemoSelection] = React.useState(false)

    // compute slice if necessary
    let slice = React.useMemo(() => {
      let {
        state: memoState,
        select: memoSelect,
        slice: memoSlice
      } = memoSelection
      if (queue.state === memoState && select === memoSelect) {
        // console.log(
        //   'skipping slice computation and using listeners captured result',
        //   node.tag
        // )
        return memoSlice
      }
      return select(queue.state)
    }, [node, memoSelection, select, queue.state])

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
        setMemoSelection({
          slice,
          select,
          state: queue.state
        })
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
