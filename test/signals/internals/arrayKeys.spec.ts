import { describe, it, expect } from 'vitest'
import {
  findKeyField,
  buildIdentityPath,
  getKeyValue,
} from '../../../src/signals/arrayKeys'

describe('findKeyField', () => {
  it('detects "id" field', () => {
    expect(findKeyField({ id: 1, name: 'Alice' })).toBe('id')
  })

  it('detects "key" field', () => {
    expect(findKeyField({ key: 'abc', value: 42 })).toBe('key')
  })

  it('detects "_id" field (MongoDB-style)', () => {
    expect(findKeyField({ _id: 'abc123', name: 'test' })).toBe('_id')
  })

  it('detects "__id" field', () => {
    expect(findKeyField({ __id: 99, data: 'x' })).toBe('__id')
  })

  it('prefers "id" over "key"', () => {
    expect(findKeyField({ id: 1, key: 'abc' })).toBe('id')
  })

  it('prefers "key" over "_id"', () => {
    expect(findKeyField({ key: 'abc', _id: 'xyz' })).toBe('key')
  })

  it('accepts string key values', () => {
    expect(findKeyField({ id: 'uuid-123' })).toBe('id')
  })

  it('accepts number key values', () => {
    expect(findKeyField({ id: 42 })).toBe('id')
  })

  it('rejects object key values', () => {
    expect(findKeyField({ id: { nested: true }, name: 'x' })).toBe(undefined)
  })

  it('rejects boolean key values', () => {
    expect(findKeyField({ id: true })).toBe(undefined)
  })

  it('rejects null key values', () => {
    expect(findKeyField({ id: null })).toBe(undefined)
  })

  it('rejects undefined key values', () => {
    expect(findKeyField({ id: undefined })).toBe(undefined)
  })

  it('returns undefined for arrays', () => {
    expect(findKeyField([1, 2, 3])).toBe(undefined)
  })

  it('returns undefined for null', () => {
    expect(findKeyField(null)).toBe(undefined)
  })

  it('returns undefined for primitives', () => {
    expect(findKeyField(42)).toBe(undefined)
    expect(findKeyField('str')).toBe(undefined)
  })

  it('returns undefined for objects without ID fields', () => {
    expect(findKeyField({ name: 'Alice', age: 30 })).toBe(undefined)
  })
})

describe('buildIdentityPath', () => {
  it('builds path with numeric id', () => {
    expect(buildIdentityPath('items', 'id', 42)).toBe('items.{id:42}')
  })

  it('builds path with string id', () => {
    expect(buildIdentityPath('items', 'id', 'abc')).toBe('items.{id:abc}')
  })

  it('builds path with custom key field', () => {
    expect(buildIdentityPath('data', '_id', 'mongo123')).toBe(
      'data.{_id:mongo123}',
    )
  })

  it('handles empty parent path', () => {
    expect(buildIdentityPath('', 'id', 1)).toBe('{id:1}')
  })

  it('handles nested parent path', () => {
    expect(buildIdentityPath('state.users.list', 'id', 5)).toBe(
      'state.users.list.{id:5}',
    )
  })
})

describe('getKeyValue', () => {
  it('extracts string key', () => {
    expect(getKeyValue({ id: 'abc' }, 'id')).toBe('abc')
  })

  it('extracts number key', () => {
    expect(getKeyValue({ id: 42 }, 'id')).toBe(42)
  })

  it('returns undefined for missing field', () => {
    expect(getKeyValue({ name: 'x' }, 'id')).toBe(undefined)
  })

  it('returns undefined for non-primitive key value', () => {
    expect(getKeyValue({ id: { x: 1 } }, 'id')).toBe(undefined)
  })

  it('returns undefined for null input', () => {
    expect(getKeyValue(null, 'id')).toBe(undefined)
  })

  it('returns undefined for array input', () => {
    expect(getKeyValue([1, 2], 'id')).toBe(undefined)
  })

  it('returns undefined for primitive input', () => {
    expect(getKeyValue(42, 'id')).toBe(undefined)
  })
})
