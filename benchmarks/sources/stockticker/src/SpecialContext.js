import { createContext } from 'react'
const MoreEfficient = require('react-redux')

let context = { Provider: false, Consumer: false }
if (MoreEfficient.Context) {
  context = createContext(null, (prev, next) => {
    let changes = 0
    const prevState = prev.state
    const nextState = next.state
    for (let i = 0; i < prevState.length; i++) {
      if (prevState[i] !== nextState[i]) {
        changes |= (1 << (i%30))
      }
    }
    return changes
  })
}

export default context