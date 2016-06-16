import { createSelectorCreator, defaultMemoize } from 'reselect'
import shallowEqual from './shallowEqual'

export default createSelectorCreator(defaultMemoize, shallowEqual)
