const { Component, PropTypes, Children } = require('react')
const storeShape = require('../utils/storeShape')

if (process.env.NODE_ENV !== 'production') {
  let didWarnAboutReceivingStore = false
  /* eslint-disable no-var */
  var warnAboutReceivingStore = function () {
    /* eslint-enable no-var */
    if (didWarnAboutReceivingStore) {
      return
    }
    didWarnAboutReceivingStore = true

    /* eslint-disable no-console */
    if (typeof console !== 'undefined' && typeof console.error === 'function') {
      console.error(
        '<Provider> does not support changing `store` on the fly. ' +
        'It is most likely that you see this error because you updated to ' +
        'Redux 2.x and React Redux 2.x which no longer hot reload reducers ' +
        'automatically. See https://github.com/rackt/react-redux/releases/' +
        'tag/v2.0.0 for the migration instructions.'
      )
    }
    /* eslint-disable no-console */
  }
}

class Provider extends Component {
  getChildContext() {
    return { store: this.store }
  }

  constructor(props, context) {
    super(props, context)
    this.store = props.store
  }

  render() {
    let { children } = this.props
    return Children.only(children)
  }
}

if (process.env.NODE_ENV !== 'production') {
  Provider.prototype.componentWillReceiveProps = function (nextProps) {
    const { store } = this
    const { store: nextStore } = nextProps

    if (store !== nextStore) {
      warnAboutReceivingStore()
    }
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
