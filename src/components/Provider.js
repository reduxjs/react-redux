const { Component, PropTypes, Children } = require('react')
const storeShape = require('../utils/storeShape')

let didWarnAboutReceivingStore = false
function warnAboutReceivingStore() {
  if (didWarnAboutReceivingStore) {
    return
  }

  didWarnAboutReceivingStore = true
  console.error( // eslint-disable-line no-console
    '<Provider> does not support changing `store` on the fly. ' +
    'It is most likely that you see this error because you updated to ' +
    'Redux 2.x and React Redux 2.x which no longer hot reload reducers ' +
    'automatically. See https://github.com/rackt/react-redux/releases/' +
    'tag/v2.0.0 for the migration instructions.'
  )
}

class Provider extends Component {
  getChildContext() {
    return { store: this.store }
  }

  constructor(props, context) {
    super(props, context)
    this.store = props.store
  }

  componentWillReceiveProps(nextProps) {
    const { store } = this
    const { store: nextStore } = nextProps

    if (store !== nextStore) {
      warnAboutReceivingStore()
    }
  }

  render() {
    let { children } = this.props
    return Children.only(children)
  }
}

Provider.propTypes = {
  store: storeShape.isRequired,
  children: PropTypes.element.isRequired
}
Provider.childContextTypes = {
  store: storeShape.isRequired
}

module.exports = Provider
