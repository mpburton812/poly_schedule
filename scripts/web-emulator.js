#!/usr/bin/env node
/**
 * PolySchedule Web Emulator
 * Starts the local dev server (or reuses an existing one) and opens Playwright
 * with device emulation — default Pixel 5 matches the portrait PWA layout.
 */

const { spawn, execSync } = require('child_process');
const http = require('http');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT || 8080);
const BASE_URL = `http://127.0.0.1:${PORT}`;

const DEVICE_PRESETS = {
  mobile: 'Pixel 5',
  tablet: 'iPad Pro 11',
  desktop: 'Desktop Chrome',
};

function parseDeviceArg() {
  const explicit = process.argv.find((arg) => arg.startsWith('--device='));
  if (explicit) return explicit.split('=').slice(1).join('=');

  const preset = process.argv.find((arg) => arg.startsWith('--preset='));
  if (preset) {
    const key = preset.split('=')[1];
    if (DEVICE_PRESETS[key]) return DEVICE_PRESETS[key];
    console.warn(`Unknown preset "${key}", using mobile.`);
  }

  return process.env.EMULATOR_DEVICE || DEVICE_PRESETS.mobile;
}

function waitForServer(url, timeoutMs = 45000) {
  const deadline = Date.now() + timeoutMs;

  return new Promise((resolve, reject) => {
    const attempt = () => {
      const req = http.get(url, (res) => {
        res.resume();
        resolve();
      });

      req.on('error', () => {
        if (Date.now() >= deadline) {
          reject(new Error(`Timed out waiting for ${url}`));
          return;
        }
        setTimeout(attempt, 350);
      });
    };

    attempt();
  });
}

function isServerRunning() {
  return waitForServer(BASE_URL, 1500).then(() => true).catch(() => false);
}

function startServer() {
  return spawn(
    process.platform === 'win32' ? 'npx.cmd' : 'npx',
    ['http-server', '.', '-p', String(PORT), '-c-1'],
    { cwd: ROOT, stdio: 'ignore', shell: true }
  );
}

function openEmulator(device) {
  const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  return spawn(npx, ['playwright', 'open', BASE_URL, `--device=${device}`], {
    cwd: ROOT,
    stdio: 'inherit',
    shell: false
  });
}

async function main() {
  const device = parseDeviceArg();

  execSync('node generate-version.js', { cwd: ROOT, stdio: 'inherit' });

  let serverProc = null;
  let startedServer = false;

  if (await isServerRunning()) {
    console.log(`Reusing dev server at ${BASE_URL}`);
  } else {
    console.log(`Starting dev server at ${BASE_URL}...`);
    serverProc = startServer();
    startedServer = true;
    await waitForServer(BASE_URL);
  }

  console.log(`Opening web emulator (${device}) → ${BASE_URL}`);
  console.log('Close the browser window to exit.\n');

  const browserProc = openEmulator(device);

  await new Promise((resolve) => {
    browserProc.on('close', resolve);
    browserProc.on('error', resolve);
  });

  if (startedServer && serverProc && !serverProc.killed) {
    serverProc.kill();
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
