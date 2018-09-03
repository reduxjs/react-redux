import React from 'react'
import { connect } from 'react-redux'
import SpecialContext from './SpecialContext'

const mapState = (state, props) => state[props.id];

class Pair extends React.Component {
    state = {
        direction: 'up',
        value : this.props.value
    }

    /*
    componentWillReceiveProps (nextProps) {
        this.setState({
            direction: nextProps.value > this.props.value ? 'up' : 'down'
        })
    }
    */
    static getDerivedStateFromProps(props, state) {
        if(props.value === state.value) return null;

        const direction = props.value > state.value ? "up" : "down";

        return {
            value : props.value,
            direction,
        };
    }

    shouldComponentUpdate (nextProps) {
        return this.props.value !== nextProps.value
    }

    render() {
        const {direction} = this.state;

        return (
            <li className='list-group-item'>
                <span>{this.props.name}</span>
                <span className={'pull-right ' + (direction === 'up' ? 'text-success' : 'text-warning')}>
                  <span
                      className={'glyphicon ' + (direction === 'up' ? 'glyphicon-arrow-up' : 'glyphicon-arrow-down')}></span>
                  <span>{this.props.value}</span>
                </span>
            </li>
        )
    }
}

export default connect(mapState, undefined, undefined, { consumer: SpecialContext.Consumer })(Pair)
