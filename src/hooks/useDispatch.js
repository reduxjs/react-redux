import React from 'react'

import { ReactReduxContext } from '../components/Context'

export function useDispatch() {
  let context = React.useContext(ReactReduxContext)
  return context.dispatch
}
