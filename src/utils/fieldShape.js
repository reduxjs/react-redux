import { PropTypes } from 'react';

export default PropTypes.shape({
    name: PropTypes.isRequired,
    type: PropTypes.oneOf(['instance', 'component', 'shared']).isRequired,
    path: PropTypes.isRequired,
    defaultValue: PropTypes.any,
    getter: PropTypes.func,
    setter: PropTypes.func
})