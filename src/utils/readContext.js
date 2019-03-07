import React from 'react'

export const unstable_readContext = Context => {
  const s = React.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED
  return s.ReactCurrentDispatcher.current.readContext(Context)
}
