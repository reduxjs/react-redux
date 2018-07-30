import enzyme from 'enzyme'
import React from 'react'
import ReactDOM from 'react-dom'
import { Provider, createProvider, connect } from '../src/index'
import isPlainObject from '../src/utils/isPlainObject'
import shallowEqual from '../src/utils/shallowEqual'
import wrapActionCreators from '../src/utils/wrapActionCreators'
import TestRenderer from 'react-test-renderer'
import Adapter from 'enzyme-adapter-react-16'

enzyme.configure({ adapter: new Adapter() })

const Component = React.Component
const Children = React.Children

export { React, ReactDOM, Children, TestRenderer, Component, enzyme, Provider, createProvider, connect, isPlainObject, shallowEqual, wrapActionCreators }