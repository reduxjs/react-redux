/* eslint no-console: 0 */
'use strict';

const { join } = require('path');
const { readdirSync } = require('fs')
const puppeteer = require("puppeteer");

const serverUtils = require('./utils/server.js')

const sources = readdirSync(join(__dirname, 'sources'))
const versions = readdirSync(join(__dirname, 'react-redux-versions')).map(version =>
  version.replace('react-redux-', '').replace('.min.js', ''))

const reduxVersions = process.env.REDUX ? process.env.REDUX.split('|') : versions
const benchmarksToRun = process.env.BENCHMARKS ? process.env.BENCHMARKS.split('|') : sources

const versionPerfEntries = {};

async function runBenchmarks() {
  for (let j = 0; j < benchmarksToRun.length; j++) {
    const benchmark = benchmarksToRun[j]
    const source = join(__dirname, 'runs', benchmark)
    console.log(`Running benchmark ${benchmark}`)
    for (let i = 0; i < reduxVersions.length; i++) {
      const version = reduxVersions[i]
      const toRun = join(source, version)
      console.log(`  react-redux version: ${version}`)
      const browser = await puppeteer.launch({
        //headless: false
      });
      const URL = `http://localhost:${9999 + i}`;
      try {
        await serverUtils.runServer(9999 + i, toRun)

        console.log(`    Checking max FPS...`)
        const fpsRunResults = await serverUtils.capturePageStats(browser, URL, null);

        console.log(`    Running trace...`);
        const traceFilename = join(__dirname, 'runs', `trace-${benchmark}-${version}.json`)
        const traceRunResults = await serverUtils.capturePageStats(browser, URL, traceFilename);


        const {fpsValues} = fpsRunResults;
        const {categories} = traceRunResults.traceMetrics;

        // skip first two values = it's usually way lower due to page startup
        const fpsValuesWithoutFirst = fpsValues.slice(1);

        const average = fpsValuesWithoutFirst.reduce((sum, val) => sum + val, 0) / fpsValuesWithoutFirst.length;

        const fps = {average, values : fpsValues}

        versionPerfEntries[benchmark] = versionPerfEntries[benchmark] ? versionPerfEntries[benchmark] : {}
        versionPerfEntries[benchmark][version] = {fps, profile : {categories}};
      } catch (e) {
        console.log(e)
        process.exit(-1)
      } finally {
        await browser.close()
      }
    }
  }

  Object.keys(versionPerfEntries).sort().forEach(benchmark => {
    const versions = versionPerfEntries[benchmark]
    console.log(`${benchmark} results:`)
    Object.keys(versions).sort().forEach(version => {
      const versionResults = versions[version];

      const {fps, profile} = versionResults;

      console.log(`  --${version}:`);
      console.log("  FPS (average, values): ", fps.average, "; ", fps.values);
      console.log("  Profile: ", profile)
    })
  })
}

runBenchmarks()