const npmRun = require('npm-run')

try {
  npmRun.execSync('jest', { stdio: 'inherit' })
} finally {
  npmRun.execSync('npm i --log-level=error --no-save', { stdio: 'inherit' })
}
