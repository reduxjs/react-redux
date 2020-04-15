import React, { useEffect } from 'react'
import * as rtl from '@testing-library/react'
import { useForceRender } from '../../src/utils/customHooks'

describe('customHooks', () => {
  describe('useForceRender', () => {
    it('re-render on using forceRender', () => {
      let renders = 0
      const Comp = () => {
        renders++

        const forceRender = useForceRender()

        useEffect(() => {
          forceRender()
        }, [])

        return <div />
      }

      rtl.render(<Comp />)

      expect(renders).toEqual(2)
    })
  })
})
