import { bindActionCreators } from 'redux'

export default function wrapActionCreators(actionCreators) {
  return (dispatch, props, actions) => {
    for (let key in actionCreators) {
      if (typeof actionCreators[key] === 'string' && actions && typeof actions[actionCreators[key]] === 'function') {
        actionCreators[key] = actions[actionCreators[key]];
      }
    }
    return bindActionCreators(actionCreators, dispatch)
  }
}
