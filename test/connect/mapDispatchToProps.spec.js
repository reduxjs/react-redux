import { whenMapDispatchToPropsIsFunction, whenMapDispatchToPropsIsMissing, whenMapDispatchToPropsIsObject } from '../../src/connect/mapDispatchToProps'

describe('Connect', () => {
    describe('whenMapDispatchToPropsIsFunction', () => {
        it('should return undefined when parameter is not a function', () => {
            expect(whenMapDispatchToPropsIsFunction(true)).toBeUndefined()
            expect(whenMapDispatchToPropsIsFunction(0)).toBeUndefined()
            expect(whenMapDispatchToPropsIsFunction({})).toBeUndefined()
            expect(whenMapDispatchToPropsIsFunction(undefined)).toBeUndefined()
            expect(whenMapDispatchToPropsIsFunction(null)).toBeUndefined()
            expect(whenMapDispatchToPropsIsFunction('')).toBeUndefined()
            expect(whenMapDispatchToPropsIsFunction(() => {})).toBeDefined()
        })
    })
    describe('whenMapDispatchToPropsIsMissing', () => {
        it('should return undefined when truthy', () => {
            expect(whenMapDispatchToPropsIsMissing(true)).toBeUndefined()
            expect(whenMapDispatchToPropsIsMissing(0)).toBeDefined()
            expect(whenMapDispatchToPropsIsMissing({})).toBeUndefined()
            expect(whenMapDispatchToPropsIsMissing(undefined)).toBeDefined()
            expect(whenMapDispatchToPropsIsMissing(null)).toBeDefined()
            expect(whenMapDispatchToPropsIsMissing('')).toBeDefined()
            expect(whenMapDispatchToPropsIsMissing(() => {})).toBeUndefined()
        })
    })
    describe('whenMapDispatchToPropsIsObject', () => {
        it('should return undefined when parameter is not an object', () => {
            expect(whenMapDispatchToPropsIsObject(true)).toBeUndefined()
            expect(whenMapDispatchToPropsIsObject(0)).toBeUndefined()
            expect(whenMapDispatchToPropsIsObject({})).toBeDefined()
            expect(whenMapDispatchToPropsIsObject(undefined)).toBeUndefined()
            expect(whenMapDispatchToPropsIsObject(null)).toBeUndefined()
            expect(whenMapDispatchToPropsIsObject('')).toBeUndefined()
            expect(whenMapDispatchToPropsIsObject(() => {})).toBeUndefined()
        })
    })
})