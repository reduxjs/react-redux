import {
  ActionCreator,
  ActionCreatorsMapObject,
  AnyAction,
  Dispatch,
} from 'redux'

function bindActionCreator<A extends AnyAction = AnyAction>(
  actionCreator: ActionCreator<A>,
  dispatch: Dispatch
) {
  return function (this: any, ...args: any[]) {
    return dispatch(actionCreator.apply(this, args))
  }
}

export default function bindActionCreators(
  actionCreators: ActionCreatorsMapObject,
  dispatch: Dispatch
): ActionCreatorsMapObject {
  const boundActionCreators: ActionCreatorsMapObject = {}

  for (const key in actionCreators) {
    const actionCreator = actionCreators[key]
    if (typeof actionCreator === 'function') {
      boundActionCreators[key] = (...args) => dispatch(actionCreator(...args))
    }
  }
  return boundActionCreators
}
