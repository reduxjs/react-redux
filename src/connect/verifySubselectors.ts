import warning from '../utils/warning'

function verify(
  selector: unknown,
  methodName: string,
  displayName: string
): void {
  if (!selector) {
    throw new Error(`Unexpected value for ${methodName} in ${displayName}.`)
  } else if (
    methodName === 'mapStateToProps' ||
    methodName === 'mapDispatchToProps'
  ) {
    if (!Object.prototype.hasOwnProperty.call(selector, 'dependsOnOwnProps')) {
      warning(
        `The selector for ${methodName} of ${displayName} did not specify a value for dependsOnOwnProps.`
      )
    }
  }
}

export default function verifySubselectors(
  mapStateToProps: unknown,
  mapDispatchToProps: unknown,
  mergeProps: unknown,
  displayName: string
): void {
  verify(mapStateToProps, 'mapStateToProps', displayName)
  verify(mapDispatchToProps, 'mapDispatchToProps', displayName)
  verify(mergeProps, 'mergeProps', displayName)
}
