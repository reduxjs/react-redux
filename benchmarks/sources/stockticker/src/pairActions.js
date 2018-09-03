
import Chance from 'chance'
import * as c from './constants'

const chance = new Chance();

function createPairs () {
  const pairs = []
  for (let i = 0; i < c.NUM_ENTRIES; i++) {
    const pair = chance.currency_pair()
    pairs.push({
      id: i,
      value: Math.random(),
      name: pair[0].code + pair[1].code
    })
  }
  return pairs
}

export function fillPairs () {
  return {
    type: c.FILL_PAIRS,
    pairs: createPairs()
  }
}

function getRandIndex () {
    return Math.floor(Math.random() * (c.NUM_ENTRIES - 1))
}

export function updatePair () {
    return {
        type: c.UPDATE_PAIR,
        id: getRandIndex(),
        value: Math.random()
    }
}
