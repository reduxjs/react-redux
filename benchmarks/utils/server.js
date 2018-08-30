/* eslint no-console: 0 */
'use strict';

const express = require("express");
const tracealyzer = require('tracealyzer');

const { join } = require('path');

const timeout = ms => new Promise(res => setTimeout(res, ms))

module.exports = {
  runServer(port, sources) {

    const app = express();

    app.use(express.static(join(sources, 'build')))

    return new Promise((resolve, reject) => { // eslint-disable-line
      app.use((err) => {
        reject(err)
      })
      app.listen(port, () => resolve())
    })
  },
  async capturePageStats(browser, url, traceFilename, delay = 30000) {
    const page = await browser.newPage();
    await page.evaluate(() => performance.setResourceTimingBufferSize(1000000));

    let fpsValues, traceMetrics;

    const trace = !!traceFilename;

    //console.log(`Loading page for version ${version}...`)

    if (trace) {
      page.on('load', async () => {
        await timeout(1000)
        page.tracing.start({ path: traceFilename })
      })
    }
    await page.goto(url);

    if (trace) {
      await timeout(delay + 1000);
      await page.tracing.stop();
      traceMetrics = tracealyzer(traceFilename);
    } else {
      await timeout(delay);
    }

    const fpsStatsEntries = JSON.parse(
      await page.evaluate(() => JSON.stringify(window.getFpsStats()))
    );

    fpsValues = fpsStatsEntries.map(entry => entry.meta.details.FPS);

    await page.close();

    return {fpsValues, traceMetrics};
  }
}
