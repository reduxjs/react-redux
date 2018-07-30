import enzyme from 'enzyme'
import TestRenderer from 'react-test-renderer'
import Adapter from 'enzyme-adapter-react-16'

enzyme.configure({ adapter: new Adapter() })

export { TestRenderer, enzyme }