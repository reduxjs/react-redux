import React, { Component } from 'react'
import PropTypes from 'prop-types'

import Provider from './Provider'

class LegacyProvider extends Component {
  getChildContext() {
    return { store: this.props.store }
  }

  render() {
    const { store, ...props } = this.props
    return <Provider store={store} {...props} />
  }
}

LegacyProvider.propTypes = {
  store: PropTypes.shape({
    subscribe: PropTypes.func.isRequired,
    dispatch: PropTypes.func.isRequired,
    getState: PropTypes.func.isRequired
  })
}

LegacyProvider.childContextTypes = {
  store: PropTypes.object.isRequired
}

export default LegacyProvider
