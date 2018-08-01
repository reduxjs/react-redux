const { readdirSync } = require('fs')
const { join } = require('path')
const npmRun = require('npm-run')
const version = process.env.REACT

try {
  require('./install-test-deps.js')
  if (version.toLowerCase() === 'all') {
    readdirSync(join(__dirname, 'react')).forEach(version => {
      npmRun.execSync(`cd test/react/${version} && npm test`, { stdio: 'inherit' })
    })
  } else {
    npmRun.execSync(`cd test/react/${version} && npm test`, { stdio: 'inherit' })
  }
} finally {
  npmRun.execSync('cd ../../..')
}
