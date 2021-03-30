import bindActionCreators from './bindActionCreators'

export default function wrapActionCreators(actionCreators) {
  return (dispatch) => bindActionCreators(actionCreators, dispatch)
}
