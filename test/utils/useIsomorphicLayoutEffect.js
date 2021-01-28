describe('useIsomorphicLayoutEffect', () => {
  let useEffect, useLayoutEffect

  beforeEach(async () => {
    jest.resetModules()
    ;({ useLayoutEffect, useEffect } = await import('react'))
  })

  describe('useIsomorphicLayoutEffect', () => {
    let useIsomorphicLayoutEffect

    describe('when document.createElement is undefined', () => {
      let createElement

      beforeEach(async () => {
        if (window?.document?.createElement) {
          createElement = window.document.createElement
          window.document.createElement = undefined
        }

        ;({ useIsomorphicLayoutEffect } = await import(
          '../../src/utils/useIsomorphicLayoutEffect'
        ))
      })

      afterEach(() => {
        if (createElement) {
          window.document.createElement = createElement
        }
      })

      it('is useEffect', () => {
        expect(useIsomorphicLayoutEffect).toBe(useEffect)
      })
    })

    describe('when document.createElement is defined', () => {
      let _document, createElement

      beforeEach(async () => {
        _document = window?.document
        createElement = window?.document?.createElement

        if (!_document) window.document = {}
        if (!createElement) window.document.createElement = () => {}
        ;({ useIsomorphicLayoutEffect } = await import(
          '../../src/utils/useIsomorphicLayoutEffect'
        ))
      })

      afterEach(() => {
        if (createElement) window.document.createElement = createElement
        if (_document) window.document = _document
      })

      it('is useLayoutEffect', () => {
        expect(useIsomorphicLayoutEffect).toBe(useLayoutEffect)
      })
    })
  })

  describe('forceUseLayoutEffect', () => {
    let useIsomorphicLayoutEffect, forceUseLayoutEffect

    describe('when document.createElement is undefined', () => {
      let createElement

      beforeEach(async () => {
        if (window?.document?.createElement) {
          createElement = window.document.createElement
          window.document.createElement = undefined
        }

        ;({ useIsomorphicLayoutEffect, forceUseLayoutEffect } = await import(
          '../../src/utils/useIsomorphicLayoutEffect'
        ))
      })

      afterEach(() => {
        if (createElement) {
          window.document.createElement = createElement
        }
      })

      it('forces useIsomorphicLayoutEffect to useLayoutEffect', async () => {
        forceUseLayoutEffect()
        ;({ useIsomorphicLayoutEffect } = await import(
          '../../src/utils/useIsomorphicLayoutEffect'
        ))

        expect(useIsomorphicLayoutEffect).toBe(useLayoutEffect)
      })
    })
  })

  describe('getUseIsomorphicLayoutEffect', () => {
    let getUseIsomorphicLayoutEffect, forceUseLayoutEffect
    let createElement

    beforeEach(async () => {
      if (window?.document?.createElement) {
        createElement = window.document.createElement
        window.document.createElement = undefined
      }

      ;({ getUseIsomorphicLayoutEffect, forceUseLayoutEffect } = await import(
        '../../src/utils/useIsomorphicLayoutEffect'
      ))
    })

    afterEach(() => {
      if (createElement) {
        window.document.createElement = createElement
      }
    })

    it('returns the function useIsomorphicLayoutEffect currently references', async () => {
      expect(getUseIsomorphicLayoutEffect()).toBe(useEffect)

      forceUseLayoutEffect()

      expect(getUseIsomorphicLayoutEffect()).toBe(useLayoutEffect)
    })
  })
})
