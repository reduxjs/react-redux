import React from 'react'

import { ReactReduxContext } from '../components/Context'

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
    React.useLayoutEffect(() => {
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
    }, [select, queue.state])

    // expose a ref to last slice for listener to bail out from
    let lastSliceRef = React.useRef(null)
    // if this render commits ensure the latest slice is updated
    React.useLayoutEffect(() => {
      lastSliceRef.current = slice
    }, [slice])

    // ref stable updater
    let updater = React.useCallback(() => {
      // console.log('updater', queue.state)
      let slice = select(queue.state)
      if (lastSliceRef.current !== slice) {
        // console.log('slice is different so we will update things', node.tag)
        // console.log('setStateCount', ++setStateCount)
        context.updating(node)
        setMemoSelection({
          slice,
          select,
          state: queue.state
        })
      }
    }, [select, queue, context])

    // update listener for next update and nullify on unmount
    React.useLayoutEffect(() => {
      updaterRef.current = updater
      return () => (updaterRef.current = null)
    }, [updater])

    // resume updates after render finishes
    // this needs to be the last layout effect
    React.useLayoutEffect(() => {
      context.continueUpdate(node)
    })

    return slice
  }
}

export const useSelector = makeUseSelector(ReactReduxContext)
