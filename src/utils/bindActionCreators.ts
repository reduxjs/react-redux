import { ActionCreatorsMapObject, Dispatch } from 'redux'

export default function bindActionCreators(
  actionCreators: ActionCreatorsMapObject,
  dispatch: Dispatch
) {
  const boundActionCreators: ActionCreatorsMapObject<any> = {}
  for (const key in actionCreators) {
    const actionCreator = actionCreators[key]
    if (typeof actionCreator === 'function') {
      boundActionCreators[key] = (...args) => dispatch(actionCreator(...args))
    }
  }
  return boundActionCreators
}
