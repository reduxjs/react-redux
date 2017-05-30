import { Component } from 'react'
import PropTypes from 'prop-types'
import { storeShape, subscriptionShape } from '../utils/PropTypes'
import warning from '../utils/warning'

let didWarnAboutReceivingStore = false
function warnAboutReceivingStore() {
  if (process.env.NODE_ENV !== 'production') {
    if (didWarnAboutReceivingStore) {
      return
    }
    didWarnAboutReceivingStore = true

    warning(
      '<Provider> does not support changing `store` on the fly. ' +
      'It is most likely that you see this error because you updated to ' +
      'Redux 2.x and React Redux 2.x which no longer hot reload reducers ' +
      'automatically. See https://github.com/reactjs/react-redux/releases/' +
      'tag/v2.0.0 for the migration instructions.'
    )
  }
}

export function createProvider(storeKey = 'store', subKey) {
    const subscriptionKey = subKey || `${storeKey}Subscription`

    class Provider extends Component {
        getChildContext() {
          return { [storeKey]: this[storeKey], [subscriptionKey]: null }
        }

        constructor(props, context) {
          super(props, context)
          this[storeKey] = props.store;
        }

        render() {
          if (process.env.NODE_ENV !== 'production') {
            if (this.props.children.length!=1){
              throw new Error('Provider should have exactly one child!');
            }
          }
          return this.props.children[0]
        }
    }

    if (process.env.NODE_ENV !== 'production') {
      Provider.prototype.componentWillReceiveProps = function (nextProps) {
        if (this[storeKey] !== nextProps.store) {
          warnAboutReceivingStore()
        }
      }
    }

    if (process.env.NODE_ENV !== 'production') {
      Provider.propTypes = {
        store: storeShape.isRequired,
        children: PropTypes.element.isRequired,
      }
      Provider.childContextTypes = {
        [storeKey]: storeShape.isRequired,
        [subscriptionKey]: subscriptionShape,
      }
    }
    Provider.displayName = 'Provider'

    return Provider
}

export default createProvider()
