/* global page, jestPuppeteer */

const port = process.env.PORT || '8080';

const names = [
  'react-redux',
];

const sleep = ms => new Promise(r => setTimeout(r, ms));
jest.setTimeout(15 * 1000);
const REPEAT = 5;
const DOUBLE = 2; // two clicks to increment one
const NUM_COMPONENTS = 50; // defined in src/common.js

names.forEach((name) => {
  describe(name, () => {
    let delays;

    beforeAll(async () => {
      await page.goto(`http://localhost:${port}/${name}/index.html`);
      const title = await page.title();
      if (title === 'failed') throw new Error('failed to reset title');
      // wait until all counts become zero
      await Promise.all([...Array(NUM_COMPONENTS).keys()].map(async (i) => {
        await expect(page).toMatchElement(`.count:nth-of-type(${i + 1})`, {
          text: '0',
          timeout: 5 * 1000,
        });
      }));
    });

    it('check1: updated properly', async () => {
      delays = [];
      for (let loop = 0; loop < REPEAT * DOUBLE; ++loop) {
        const start = Date.now();
        // click buttons three times
        await Promise.all([
          page.click('#remoteIncrement'),
          page.click('#remoteIncrement'),
          sleep(50).then(() => page.click('#remoteIncrement')), // a bit delayed
        ]);
        delays.push(Date.now() - start);
      }
      console.log(name, delays);
      // check if all counts become REPEAT * 3
      await Promise.all([...Array(NUM_COMPONENTS).keys()].map(async (i) => {
        await expect(page).toMatchElement(`.count:nth-of-type(${i + 1})`, {
          text: `${REPEAT * 3}`,
          timeout: 10 * 1000,
        });
      }));
    });

    it('check2: no tearing during update', async () => {
      // check if there's inconsistency duroing update
      // see useCheckTearing() in src/common.js
      await expect(page.title()).resolves.not.toBe('failed');
    });

    it('check3: ability to interrupt render', async () => {
      // check delays taken by clicking buttons in check1
      // each render takes at least 20ms and there are 50 components,
      // it triggers triple clicks, so 300ms on average.
      const avg = delays.reduce((a, b) => a + b) / delays.length;
      expect(avg).toBeLessThan(300);
    });

    it('check4: proper update after interrupt', async () => {
      // click both buttons to update local count during updating remote count
      await Promise.all([
        page.click('#remoteIncrement'),
        page.click('#remoteIncrement'),
        page.click('#localIncrement'),
        page.click('#remoteIncrement'),
        page.click('#remoteIncrement'),
        page.click('#localIncrement'),
      ]);
      // check if all counts become REPEAT * 3 + 2
      await Promise.all([...Array(NUM_COMPONENTS).keys()].map(async (i) => {
        await expect(page).toMatchElement(`.count:nth-of-type(${i + 1})`, {
          text: `${REPEAT * 3 + 2}`,
          timeout: 5 * 1000,
        });
      }));
    });

    afterAll(async () => {
      await jestPuppeteer.resetBrowser();
    });
  });
});
