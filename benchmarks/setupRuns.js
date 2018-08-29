/* eslint no-console: 0 */
'use strict';

const { readdirSync, copyFile, mkdirSync, readFileSync } = require('fs');
const rimraf = require('rimraf');
const { join } = require('path');
const spawn = require("cross-spawn");
const copy = require('recursive-copy');

const reduxVersion = process.env.VERSION || 'all'

console.log('clearing out old runs...')
rimraf.sync(join(__dirname, 'runs', '*'))

readdirSync(join(__dirname, 'react-redux-versions')).forEach(version => {
  const rplVersion = version.replace('react-redux-', '').replace('.min.js', '')
  if (reduxVersion.toLowerCase() !== 'all' && rplVersion !== reduxVersion) {
    console.log(`skipping ${version}, ${reduxVersion} was specified`)
    return
  }

  const sources = readdirSync(join(__dirname, 'sources'))
  sources.forEach(benchmark => {
    const dest = join(__dirname, 'runs', benchmark, rplVersion)
    const src = join(__dirname, 'sources', benchmark)
    console.log(`copying benchmarks from ${src} to ${dest}...`)
    copy(src, dest)
      .then(results => {
        console.log(`copied ${results.length} files`)
        console.log(`installing dependencies of benchmark ${benchmark} for react-redux ${rplVersion}...`)
        const cwd = dest
        let installTask = spawn.sync('npm', ['install'], {
          cwd,
          stdio: 'inherit',
        });
        if (installTask.status > 0) {
          process.exit(installTask.status);
        }
        console.log(`building production version of benchmark ${benchmark} for react-redux ${rplVersion}...`)
        installTask = spawn.sync('npm', ['run', 'build'], {
          cwd,
          stdio: 'inherit',
        });
        if (installTask.status > 0) {
          process.exit(installTask.status);
        }
        console.log(`copying react-redux to ${dest}...`)
        copyFile(join(__dirname, 'react-redux-versions', version), join(dest, 'build', 'react-redux.min.js'))
      })
      .catch(error => {
        console.log(error)
        process.exit(-1)
      })
  })
})