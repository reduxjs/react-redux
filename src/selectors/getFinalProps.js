import memoizeProps from '../utils/memoizeProps'
import shallowEqual from '../utils/shallowEqual'

export function createImpureFinalPropsSelector({ dispatch, getState, getDispatch, mergeProps }) {
  return function impureSelector(state, props) {
    return mergeProps(
      getState(state, props),
      getDispatch(dispatch, props),
      props
    )
  }
}

export function createPureFinalPropsSelector({ dispatch, getState, getDispatch, mergeProps }) {
  const memoizeResult = memoizeProps()
  let result = undefined
  let prevState = undefined
  let prevOwnProps = undefined
  let prevStateProps = undefined
  let prevDispatchProps = undefined
  let getStateDependsOnProps = undefined
  let getDispatchDependsOnProps = undefined

  function setResult() {
    result = memoizeResult(mergeProps(prevStateProps, prevDispatchProps, prevOwnProps))
  }

  function handleFirstCall(firstState, firstOwnProps) {
    prevState = firstState
    prevOwnProps = firstOwnProps
    prevStateProps = getState(firstState, firstOwnProps)
    prevDispatchProps = getDispatch(dispatch, firstOwnProps)
    getStateDependsOnProps = getState.meta && getState.meta.dependsOnProps
    getDispatchDependsOnProps = getDispatch.meta && getDispatch.meta.dependsOnProps

    setResult()
  }

  function handleNewPropsAndMaybeNewState(nextState, nextOwnProps) {
    if (getStateDependsOnProps || nextState !== prevState) {
      prevStateProps = getState(nextState, nextOwnProps)
    }

    if (getDispatchDependsOnProps) {
      prevDispatchProps = getDispatch(dispatch, nextOwnProps)
    }

    prevState = nextState
    prevOwnProps = nextOwnProps

    setResult()
  }

  function handleNewStateButNotNewProps(nextState) {
    const nextStateProps = getState(nextState, prevOwnProps)
    prevState = nextState
    
    if (!shallowEqual(nextStateProps, prevStateProps)) {
      prevStateProps = nextStateProps
      setResult()
    }
  }

  return function pureSelector(nextState, nextOwnProps) {
    if (result === undefined) {
      handleFirstCall(nextState, nextOwnProps)

    } else if (!shallowEqual(nextOwnProps, prevOwnProps)) {
      handleNewPropsAndMaybeNewState(nextState, nextOwnProps)

    } else if (nextState !== prevState) {
      handleNewStateButNotNewProps(nextState)

    }
    return result
  }
}

export function createFinalPropsSelector(options) {
  return options.pure
    ? createPureFinalPropsSelector(options)
    : createImpureFinalPropsSelector(options)
}
