/*eslint-disable react/prop-types*/

import React from 'react'
import { createStore } from 'redux'
import { Provider as ProviderMock, connect } from '../../src/index.js'
import * as rtl from 'react-testing-library'
import 'jest-dom/extend-expect'

describe('React', () => {
  describe('connect', () => {
    afterEach(() => rtl.cleanup())

    it('should render on useEffect hook state update', () => {
      const store = createStore((state, action) => {
        let newState =
          state !== undefined
            ? state
            : {
                byId: {},
                list: []
              }
        switch (action.type) {
          case 'FOO':
            newState = {
              ...newState,
              list: [1],
              byId: { 1: 'foo' }
            }
            break
        }
        return newState
      })

      const mapStateSpy1 = jest.fn()
      const renderSpy1 = jest.fn()

      const component1Decorator = connect(state => {
        mapStateSpy1()

        return {
          list: state.list
        }
      })

      const component2 = props => {
        const [state, setState] = React.useState({ list: props.list })

        React.useEffect(() => {
          setState(prevState => ({ ...prevState, list: props.list }))
        }, [props.list])

        renderSpy1()

        return <Component2 list={state.list} />
      }

      const Component1 = component1Decorator(component2)

      const mapStateSpy2 = jest.fn()
      const renderSpy2 = jest.fn()

      const component2Decorator = connect((state, ownProps) => {
        mapStateSpy2()

        return {
          mappedProp: ownProps.list.map(id => state.byId[id])
        }
      })

      const component3 = () => {
        renderSpy2()

        return <div>Hello</div>
      }

      const Component2 = component2Decorator(component3)

      rtl.render(
        <ProviderMock store={store}>
          <Component1 />
        </ProviderMock>
      )

      expect(mapStateSpy1).toHaveBeenCalledTimes(1)
      expect(renderSpy1).toHaveBeenCalledTimes(2)
      expect(mapStateSpy2).toHaveBeenCalledTimes(1)
      expect(renderSpy2).toHaveBeenCalledTimes(1)

      rtl.act(() => {
        store.dispatch({ type: 'FOO' })
      })

      expect(mapStateSpy1).toHaveBeenCalledTimes(2)
      expect(renderSpy1).toHaveBeenCalledTimes(4)
      expect(mapStateSpy2).toHaveBeenCalledTimes(3)
      expect(renderSpy2).toHaveBeenCalledTimes(3)
    })
  })
})
