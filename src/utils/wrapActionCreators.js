import { bindActionCreators } from 'redux'

function wrapActionCreators(actionCreators) {
  return dispatch => bindActionCreators(actionCreators, dispatch)
}

module.exports = wrapActionCreators
