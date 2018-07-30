import enzyme from 'enzyme'
import TestRenderer from 'react-addons-test-utils'
import Adapter from 'enzyme-adapter-react-14'

enzyme.configure({ adapter: new Adapter() })

export { TestRenderer, enzyme }