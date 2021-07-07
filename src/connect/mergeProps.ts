import { Dispatch } from 'redux'
import verifyPlainObject from '../utils/verifyPlainObject'

type MergeProps<TStateProps, TDispatchProps, TOwnProps, TMergedProps> = (stateProps: TStateProps, dispatchProps: TDispatchProps, ownProps: TOwnProps) => TMergedProps

export function defaultMergeProps<TStateProps, TDispatchProps, TOwnProps>(stateProps: TStateProps, dispatchProps: TDispatchProps, ownProps: TOwnProps) {
  return { ...ownProps, ...stateProps, ...dispatchProps }
}

interface InitMergeOptions { 
  displayName: string;
  pure?: boolean;
  areMergedPropsEqual: (a: any, b: any) => boolean;
}

export function wrapMergePropsFunc<TStateProps, TDispatchProps, TOwnProps, TMergedProps>(mergeProps: MergeProps<TStateProps, TDispatchProps, TOwnProps, TMergedProps>): (dispatch: Dispatch, options: InitMergeOptions) => MergeProps<TStateProps, TDispatchProps, TOwnProps, TMergedProps> {
  return function initMergePropsProxy(
    dispatch,
    { displayName, pure, areMergedPropsEqual }
  ) {
    let hasRunOnce = false
    let mergedProps: TMergedProps

    return function mergePropsProxy(stateProps: TStateProps, dispatchProps: TDispatchProps, ownProps: TOwnProps) {
      const nextMergedProps = mergeProps(stateProps, dispatchProps, ownProps)

      if (hasRunOnce) {
        if (!pure || !areMergedPropsEqual(nextMergedProps, mergedProps))
          mergedProps = nextMergedProps
      } else {
        hasRunOnce = true
        mergedProps = nextMergedProps

        if (process.env.NODE_ENV !== 'production')
          verifyPlainObject(mergedProps, displayName, 'mergeProps')
      }

      return mergedProps
    }
  }
}

export function whenMergePropsIsFunction<TStateProps, TDispatchProps, TOwnProps, TMergedProps>(mergeProps: MergeProps<TStateProps, TDispatchProps, TOwnProps, TMergedProps>) {
  return typeof mergeProps === 'function'
    ? wrapMergePropsFunc(mergeProps)
    : undefined
}

export function whenMergePropsIsOmitted<TStateProps, TDispatchProps, TOwnProps, TMergedProps>(mergeProps?: MergeProps<TStateProps, TDispatchProps, TOwnProps, TMergedProps>) {
  return !mergeProps ? () => defaultMergeProps : undefined
}

export default [whenMergePropsIsFunction, whenMergePropsIsOmitted] as const
