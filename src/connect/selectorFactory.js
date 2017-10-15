import verifySubselectors from './verifySubselectors'

export function impureFinalPropsSelectorFactory(
  mapStateToProps,
  mapDispatchToProps,
  mergeProps,
  dispatch
) {
  return function impureFinalPropsSelector(state, ownProps) {
    return mergeProps(
      mapStateToProps(state, ownProps),
      mapDispatchToProps(dispatch, ownProps),
      ownProps
    )
  }
}

export function pureFinalPropsSelectorFactory(
  mapStateToProps,
  mapDispatchToProps,
  mergeProps,
  dispatch,
  { areStatesEqual, areOwnPropsEqual, areStatePropsEqual }
) {
  let hasRunAtLeastOnce = false
  let state
  let ownProps
  let stateProps
  let dispatchProps
  let mergedProps

  function handleFirstCall(firstState, firstOwnProps) {
    state = firstState
    ownProps = firstOwnProps
    stateProps = mapStateToProps(state, ownProps)
    if (stateProps === false)
      throw new Error('Cannot short-circuit initial call to mapStateToProps.')
    dispatchProps = mapDispatchToProps(dispatch, ownProps)
    if (dispatchProps === false)
      throw new Error('Cannot short-circuit initial call to mapDispatchToProps.')
    mergedProps = mergeProps(stateProps, dispatchProps, ownProps)
    if (mergedProps === false)
      throw new Error('Cannot short-circuit initial call to mergeProps.')
    hasRunAtLeastOnce = true
    return mergedProps
  }

  function handleNewPropsAndNewState() {
    const newStateProps = mapStateToProps(state, ownProps)

    if (newStateProps !== false)
      stateProps = newStateProps

    if (mapDispatchToProps.dependsOnOwnProps) {
      const newDispatchProps = mapDispatchToProps(dispatch, ownProps)

      if (newDispatchProps !== false)
        dispatchProps = newDispatchProps
    }

    const newMergedProps = mergeProps(stateProps, dispatchProps, ownProps)

    if (newMergedProps !== false)
      mergedProps = newMergedProps

    return mergedProps
  }

  function handleNewProps() {
    if (mapStateToProps.dependsOnOwnProps) {
      const newStateProps = mapStateToProps(state, ownProps)

      if (newStateProps !== false)
        stateProps = newStateProps
    }

    if (mapDispatchToProps.dependsOnOwnProps) {
      const newDispatchProps = mapDispatchToProps(dispatch, ownProps)

      if (newDispatchProps !== false)
        dispatchProps = newDispatchProps
    }

    const newMergedProps = mergeProps(stateProps, dispatchProps, ownProps)

    if (newMergedProps !== false)
      mergedProps = newMergedProps

    return mergedProps
  }

  function handleNewState() {
    const nextStateProps = mapStateToProps(state, ownProps)

    if (nextStateProps === false)
      return mergedProps

    const statePropsChanged = !areStatePropsEqual(nextStateProps, stateProps)
    stateProps = nextStateProps

    if (statePropsChanged) {
      const newMergedProps = mergeProps(stateProps, dispatchProps, ownProps)

      if (newMergedProps !== false)
        mergedProps = newMergedProps
    }

    return mergedProps
  }

  function handleSubsequentCalls(nextState, nextOwnProps) {
    const propsChanged = !areOwnPropsEqual(nextOwnProps, ownProps)
    const stateChanged = !areStatesEqual(nextState, state)
    state = nextState
    ownProps = nextOwnProps

    if (propsChanged && stateChanged) return handleNewPropsAndNewState()
    if (propsChanged) return handleNewProps()
    if (stateChanged) return handleNewState()
    return mergedProps
  }

  return function pureFinalPropsSelector(nextState, nextOwnProps) {
    return hasRunAtLeastOnce
      ? handleSubsequentCalls(nextState, nextOwnProps)
      : handleFirstCall(nextState, nextOwnProps)
  }
}

// TODO: Add more comments

// If pure is true, the selector returned by selectorFactory will memoize its results,
// allowing connectAdvanced's shouldComponentUpdate to return false if final
// props have not changed. If false, the selector will always return a new
// object and shouldComponentUpdate will always return true.

export default function finalPropsSelectorFactory(dispatch, {
  initMapStateToProps,
  initMapDispatchToProps,
  initMergeProps,
  ...options
}) {
  const mapStateToProps = initMapStateToProps(dispatch, options)
  const mapDispatchToProps = initMapDispatchToProps(dispatch, options)
  const mergeProps = initMergeProps(dispatch, options)

  if (process.env.NODE_ENV !== 'production') {
    verifySubselectors(mapStateToProps, mapDispatchToProps, mergeProps, options.displayName)
  }

  const selectorFactory = options.pure
    ? pureFinalPropsSelectorFactory
    : impureFinalPropsSelectorFactory

  return selectorFactory(
    mapStateToProps,
    mapDispatchToProps,
    mergeProps,
    dispatch,
    options
  )
}
