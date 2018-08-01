const npmRun = require('npm-run')
const version = process.env.REACT

try {
  require('./install-test-deps.js')
  if (version.toLowerCase() === 'all') {
    npmRun.execSync(`cd test/react/0.14 && npm test`, { stdio: 'inherit' })
    npmRun.execSync(`cd test/react/15 && npm test`, { stdio: 'inherit' })
    npmRun.execSync(`cd test/react/16.2 && npm test`, { stdio: 'inherit' })
    npmRun.execSync(`cd test/react/16.3 && npm test`, { stdio: 'inherit' })
    npmRun.execSync(`cd test/react/16.4 && npm test`, { stdio: 'inherit' })
  } else {
    npmRun.execSync(`cd test/react/${version} && npm test`, { stdio: 'inherit' })
  }
} finally {
  npmRun.execSync('cd ../../..')
}
