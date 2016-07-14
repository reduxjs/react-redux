import shallowEqual from '../utils/shallowEqual'

export function makeImpurePropsSelector(
  dispatch, { mapStateToProps, mapDispatchToProps, mergeProps }
) {
  // TODO: cache mapDispatchToProps result if not dependent on ownProps
  return function impureSelector(state, ownProps) {
    return mergeProps(
      mapStateToProps(state, ownProps),
      mapDispatchToProps(dispatch, ownProps),
      ownProps
    )
  }
}

export function makePurePropsSelector(
  dispatch, { mapStateToProps, mapDispatchToProps, mergeProps }
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
    dispatchProps = mapDispatchToProps(dispatch, ownProps)
    mergedProps = mergeProps(stateProps, dispatchProps, ownProps)
    hasRunAtLeastOnce = true
    return mergedProps
  }

  function mergeFinalProps() {
    const nextMergedProps = mergeProps(stateProps, dispatchProps, ownProps)

    if (mergeProps.meta.skipShallowEqual || !shallowEqual(mergedProps, nextMergedProps))
      mergedProps = nextMergedProps

    return mergedProps
  }

  function handleNewPropsAndNewState() {
    stateProps = mapStateToProps(state, ownProps)

    if (mapDispatchToProps.meta.dependsOnProps)
      dispatchProps = mapDispatchToProps(dispatch, ownProps)

    return mergeFinalProps()
  }

  function handleNewProps() {
    if (mapStateToProps.meta.dependsOnProps)
      stateProps = mapStateToProps(state, ownProps)

    if (mapDispatchToProps.meta.dependsOnProps)
      dispatchProps = mapDispatchToProps(dispatch, ownProps)

    return mergeFinalProps()
  }

  function handleNewState() {
    const nextStateProps = mapStateToProps(state, ownProps)
    const statePropsChanged = !shallowEqual(nextStateProps, stateProps)
    stateProps = nextStateProps
    
    return statePropsChanged
      ? mergeFinalProps()
      : mergedProps
  }

  function handleSubsequentCalls(nextState, nextOwnProps) {
    const propsChanged = !shallowEqual(nextOwnProps, ownProps)
    const stateChanged = nextState !== state
    state = nextState
    ownProps = nextOwnProps

    if (propsChanged && stateChanged) return handleNewPropsAndNewState()
    if (propsChanged) return handleNewProps()
    if (stateChanged) return handleNewState()
    return mergedProps
  }

  return function pureSelector(nextState, nextOwnProps) {
    return hasRunAtLeastOnce
      ? handleSubsequentCalls(nextState, nextOwnProps)
      : handleFirstCall(nextState, nextOwnProps)
  }
}

export function findMatchingSelector(name, options) {
  const factories = options[name + 'Factories']

  for (let i = factories.length - 1; i >= 0; i--) {
    const selector = factories[i](options)
    if (selector) return selector
  }

  throw new Error(`Unexpected value for ${name} in ${options.displayName}.`)
}

// TODO: Add more comments

// If pure is true, the selector returned by selectorFactory will memoize its results,
// allowing connectAdvanced's shouldComponentUpdate to return false if final
// props have not changed. If false, the selector will always return a new
// object and shouldComponentUpdate will always return true.

export default function selectorFactory(dispatch, { pure = true, ...options }) {
  const finalOptions = {
    ...options,
    mapStateToProps: findMatchingSelector('mapStateToProps', options),
    mapDispatchToProps: findMatchingSelector('mapDispatchToProps', { ...options, dispatch }),
    mergeProps: findMatchingSelector('mergeProps', options)
  }
  
  return pure
    ? makePurePropsSelector(dispatch, finalOptions)
    : makeImpurePropsSelector(dispatch, finalOptions)
}
