/* eslint no-console: 0 */
/* adapted from airbnb's enzyme-adapter-react-install */

const semver = require('semver')
const npmRun = require('npm-run')

const reactEnv = process.env.REACT;
const reactArg = process.argv[2];

if (reactEnv && !semver.validRange(reactEnv)) {
  throw new Error('REACT environment variable is not a valid semver range');
}

if (reactArg && !semver.validRange(reactArg)) {
  throw new Error('Argument supplied to enzyme-adapter-react-install is not a valid semver range');
}

const reactVersion = reactEnv || reactArg;

if (!semver.intersects(reactVersion, '>=0.13')) {
  throw new Error('semver range is not valid. Please provide a valid semver range as an argument or environment variable.');
}

console.log('Cleaning up React and related packages...');
const commands = [
  'npm uninstall --loglevel=error -D react-dom react-test-renderer react-addons-test-utils enzyme-adapter-react-14 enzyme-adapter-react-15.4 enzyme-adapter-react-15 enzyme-adapter-react-16',
  'rimraf node_modules/react-test-renderer node_modules/react',
  'npm prune --loglevel=error',
];

try {
  commands.forEach((cmd) => {
    npmRun.execSync(cmd, { stdio: 'inherit' });
  });
} catch (e) {
  console.error('An uninstallation failed');
  console.log(e);
  process.exit(1);
}

console.log(`Installing React@${reactVersion} and related packages...`);
npmRun.execSync(`npm install --loglevel=error -D react@${reactVersion} react-dom@${reactVersion} react-test-renderer@${reactVersion}`, { stdio: 'inherit' });
if (semver.intersects(reactVersion, '^16.0.0')) {
  try {
    npmRun.execSync('npm install --loglevel=error -D enzyme-adapter-react-16', { stdio: 'inherit' });
  } catch (e) {
    console.error('An installation failed');
    console.log(e);
    process.exit(16);
  }
} else if (semver.intersects(reactVersion, '^15.5.0')) {
  try {
    npmRun.execSync('npm install --loglevel=error -D enzyme-adapter-react-15', { stdio: 'inherit' });
  } catch (e) {
    console.error('An installation failed');
    console.log(e);
    process.exit(155);
  }
} else if (semver.intersects(reactVersion, '15.0.0 - 15.4.x')) {
  try {
    npmRun.execSync('npm install --loglevel=error -D enzyme-adapter-react-15.4', { stdio: 'inherit' });
  } catch (e) {
    console.error('An installation failed');
    console.log(e);
    process.exit(15);
  }
} else if (semver.intersects(reactVersion, '^0.14.0')) {
  try {
    npmRun.execSync('npm install --loglevel=error -D enzyme-adapter-react-14', { stdio: 'inherit' });
  } catch (e) {
    console.error('An installation failed');
    console.log(e);
    process.exit(14);
  }
} else if (semver.intersects(reactVersion, '^0.13.0')) {
  try {
    npmRun.execSync('npm install --loglevel=error -D enzyme-adapter-react-13', { stdio: 'inherit' });
  } catch (e) {
    console.error('An installation failed');
    console.log(e);
    process.exit(13);
  }
}
