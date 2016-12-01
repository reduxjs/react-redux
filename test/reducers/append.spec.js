"use strict";
import expect from 'expect';
import append from '../../src/reducers/append';
import {APPEND, SET} from '../../src/utils/allyActionNames';

describe('reducers/append', function () {
    const path = ['one', 'two'];
    const value = 'charlie';
    const action = {
        type: APPEND,
        payload: {
            path: path,
            value: value
        }
    };
    const initialState = {
        one: {
            two: [1, 2]
        }
    };

    it('should not change the state object if a different action type is provided', function () {
        const anotherAction = {
            type: SET,
            payload: {
                path: path, 
                value: value
            }
        };
        console.log('APPEND: ', APPEND);
        const newState = append(initialState, anotherAction);
        expect(newState).toBe(initialState);
    });
    
    it('should not affect the state if the object at the path does not have a push method', function () {
        const anotherState = {
            one: {
                two: {"1": 1, "2": 2}
            }
        };
        const newState = append(anotherState, action);
        expect(newState).toBe(anotherState);
        expect(newState.one.two.push).toNotBeA('function');
    });

    it('should add charlie to the end of state.one.two', function () {
        const newState = append(initialState, action);
        expect(newState).toNotBe(initialState);
        expect(newState.one.two.push).toBeA('function');
        expect(newState).toEqual({
            one: {
                two: [1, 2, value]
            }
        });
    })
});