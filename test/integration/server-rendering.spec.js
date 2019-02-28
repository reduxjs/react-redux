/*eslint-disable react/prop-types*/

import React from 'react'
import { renderToString } from 'react-dom/server'
import { createStore } from 'redux'
import { Provider, connect } from '../../src/index.js'

describe('React', () => {
  describe('server rendering', () => {
    it('should be able to render connected component with props and state from store', () => {
      const store = createStore(() => ({ greeting: 'Hello' }))

      const Greeter = ({ greeting, greeted }) => (
        <div>{greeting + ' ' + greeted}</div>
      )

      const ConnectedGreeter = connect(state => state)(Greeter)

      const markup = renderToString(
        <Provider store={store}>
          <ConnectedGreeter greeted="world" />
        </Provider>
      )

      expect(markup).toContain('Hello world')
    })
  })
})
