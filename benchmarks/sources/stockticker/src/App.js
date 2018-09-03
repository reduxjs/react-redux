import React, { Component } from 'react';
import {connect} from "react-redux";

import SpecialContext from './SpecialContext'
import {fillPairs, updatePair} from "./pairActions";

import Pair from "./Pair";

function mapState(state) {
    const partition = Math.floor(state.length / 3)

    return {
        groups: [
            state.slice(0, partition),
            state.slice(partition, partition * 2),
            state.slice(partition * 2)
        ]
    }
}

const actions = {fillPairs, updatePair};

class App extends React.Component {
    componentDidMount =  () => {
        this.props.fillPairs()
        this.simulate()
    }

    simulate = () => {
        setInterval(this.props.updatePair, 13)

        setInterval(this.props.updatePair, 21)

        setInterval(this.props.updatePair, 34)

        setInterval(this.props.updatePair, 55)
    }

    render () {
        return (
            <div className='row'>
                {this.props.groups.map((group, idx) => {
                    return (
                        <div className='col-lg-4' key={idx}>
                            <ul className='list-group'>
                                {group.map((pair, i) => {
                                    return (
                                        <Pair key={pair.id} id={pair.id} unstable_observedBits={1 << (i%30)} />
                                    )
                                })}
                            </ul>
                        </div>
                    )
                })}
            </div>
        )
    }
}

export default connect(mapState, actions, undefined, { consumer: SpecialContext.Consumer })(App);
