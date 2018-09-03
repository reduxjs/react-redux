import * as c from './constants'

const initialState = []

function pairs (state = initialState, action) {
  switch (action.type) {
    case c.FILL_PAIRS: {
      return action.pairs.slice()
    }
    case c.UPDATE_PAIR: {
      return state.map(pair => {
        return pair.id === action.id
          ? {...pair, value: action.value }
          : pair
      })
    }
    default: {
      return state
    }
  }
}

export default pairs
