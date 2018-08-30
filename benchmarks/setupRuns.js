/* eslint no-console: 0 */
'use strict';

const { readdirSync, copyFile } = require('fs');
const rimraf = require('rimraf');
const { join } = require('path');
const spawn = require("cross-spawn");
const copy = require('recursive-copy')

console.log('clearing out old runs...')
rimraf.sync(join(__dirname, 'runs', '*'))

const sources = readdirSync(join(__dirname, 'sources'))
sources.forEach(benchmark => {
  const src = join(__dirname, 'sources', benchmark)
  let cwd
  cwd = src
  console.log(`installing dependencies of benchmark ${benchmark}...`)
  let installTask = spawn.sync('npm', ['install'], {
    cwd,
    stdio: 'inherit',
  });
  if (installTask.status > 0) {
    process.exit(installTask.status);
  }
  console.log(`building production version of benchmark ${benchmark}...`)
  installTask = spawn.sync('npm', ['run', 'build'], {
    cwd,
    stdio: 'inherit',
  });
  if (installTask.status > 0) {
    process.exit(installTask.status);
  }
  readdirSync(join(__dirname, 'react-redux-versions')).forEach(version => {
    const rplVersion = version.replace('react-redux-', '').replace('.min.js', '')
    const dest = join(__dirname, 'runs', benchmark, rplVersion)
    console.log(`copying benchmark ${benchmark} build to ${dest}...`)
    copy(join(src, 'build'), join(dest, 'build'))
      .then(() => {
        console.log(`copying react-redux to ${dest}...`)
        copyFile(join(__dirname, 'react-redux-versions', version), join(dest, 'build', 'react-redux.min.js'), e => {
          if (e) {
            console.log(e)
            process.exit(-1);
          }
        })
      })
      .catch(error => {
        console.log(error)
        process.exit(-1);
      })
  })
})
