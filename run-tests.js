const npmRun = require('npm-run')
const version = process.env.REACT

try {
  require('./install-test-deps.js')
  npmRun.execSync(`cd test/react/${version} && npm test`, { stdio: 'inherit' })
} finally {
  npmRun.execSync('cd ../../..')
}
