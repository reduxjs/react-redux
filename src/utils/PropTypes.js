import PropTypes from 'prop-types'

export const subscriptionShape = (process.env.NODE_ENV === 'production') ? 0 : PropTypes.shape({
  trySubscribe: PropTypes.func.isRequired,
  tryUnsubscribe: PropTypes.func.isRequired,
  notifyNestedSubs: PropTypes.func.isRequired,
  isSubscribed: PropTypes.func.isRequired,
})

export const storeShape = (process.env.NODE_ENV === 'production') ? 0 : PropTypes.shape({
  subscribe: PropTypes.func.isRequired,
  dispatch: PropTypes.func.isRequired,
  getState: PropTypes.func.isRequired
})
