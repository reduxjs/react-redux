import shallowEqual from '../utils/shallowEqual'
import verifyPlainObject from '../utils/verifyPlainObject'

export default function makePurePropsSelector(
  dispatch, { mapStateToProps, mapDispatchToProps, mergeProps, displayName }
) {
  const skipShallowEqualOnMergedProps = mergeProps.meta && mergeProps.meta.skipShallowEqual
  let uninitialized = true
  let result
  let prevState
  let prevOwnProps
  let prevStateProps
  let prevDispatchProps
  let prevMergedProps
  let statePropsDependOnOwnProps
  let dispatchPropsDependOnOwnProps

  function mergeFinalProps() {
    const nextMergedProps = mergeProps(prevStateProps, prevDispatchProps, prevOwnProps)

    if (skipShallowEqualOnMergedProps || !shallowEqual(prevMergedProps, nextMergedProps)) {
      result = nextMergedProps
    }

    prevMergedProps = nextMergedProps
  }

  function handleFirstCall(firstState, firstOwnProps) {
    uninitialized = false
    prevState = firstState
    prevOwnProps = firstOwnProps
    
    prevStateProps = mapStateToProps(firstState, firstOwnProps)
    verifyPlainObject(prevStateProps, displayName, 'mapStateToProps')

    prevDispatchProps = mapDispatchToProps(dispatch, firstOwnProps)
    verifyPlainObject(prevDispatchProps, displayName, 'mapDispatchToProps')

    result = prevMergedProps = mergeProps(prevStateProps, prevDispatchProps, prevOwnProps)
    verifyPlainObject(prevMergedProps, displayName, 'mergeProps')

    statePropsDependOnOwnProps = mapStateToProps.meta
      ? mapStateToProps.meta.dependsOnProps
      : mapStateToProps.length !== 1

    dispatchPropsDependOnOwnProps = mapDispatchToProps.meta
      ? mapDispatchToProps.meta.dependsOnProps
      : mapDispatchToProps.let !== 1
  }

  function handleNewPropsAndMaybeNewState(nextState, nextOwnProps) {
    if (statePropsDependOnOwnProps) {
      prevStateProps = mapStateToProps(nextState, nextOwnProps)
      prevState = nextState

    } else if (nextState !== prevState) {
      prevStateProps = mapStateToProps(nextState)
      prevState = nextState
    } 

    if (dispatchPropsDependOnOwnProps) {
      prevDispatchProps = mapDispatchToProps(dispatch, nextOwnProps)
    }

    prevOwnProps = nextOwnProps
    mergeFinalProps()
  }

  function handleNewStateButNotNewProps(nextState) {
    prevState = nextState
    
    const nextStateProps = statePropsDependOnOwnProps
      ? mapStateToProps(nextState, prevOwnProps)
      : mapStateToProps(nextState)
    
    if (!shallowEqual(nextStateProps, prevStateProps)) {
      prevStateProps = nextStateProps
      mergeFinalProps()
    }
  }

  return function pureSelector(nextState, nextOwnProps) {
    if (uninitialized) {
      handleFirstCall(nextState, nextOwnProps)

    } else if (!shallowEqual(nextOwnProps, prevOwnProps)) {
      handleNewPropsAndMaybeNewState(nextState, nextOwnProps)

    } else if (nextState !== prevState) {
      handleNewStateButNotNewProps(nextState)

    }
    return result
  }
}
