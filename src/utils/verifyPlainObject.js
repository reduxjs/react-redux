import isPlainObject from 'lodash/isPlainObject'
import warning from './warning'

// verifies that the first execution of func returns a plain object
export default function verifyPlainObject(displayName, methodName, func) {
  if (process.env.NODE_ENV === 'production') return func
  if (!func) throw new Error('Missing ' + methodName)

  let hasVerified = false
  return (...args) => {
    const result = func(...args)
    if (hasVerified) return result
    hasVerified = true
    if (!isPlainObject(result)) {
      warning(
        `${methodName}() in ${displayName} must return a plain object. ` +
        `Instead received ${result}.`
      )
    }
    return result
  }
}
