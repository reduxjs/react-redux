import * as tt from 'typescript-definition-tester'

describe('TypeScript definitions', () => {
  it('should compile against index.d.ts', (done) => {
    tt.compileDirectory(
      __dirname + '/typescript',
      fileName => fileName.match(/\.tsx?$/),
      { strict: true, jsx: true },
      () => done()
    )
  }).timeout(5000)
})