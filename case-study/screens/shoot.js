// Screenshots web dashboard pages as the scenario's BLCS coordinator, through headless
// Chrome's DevTools protocol (Node 22 global WebSocket; no extra packages).
//   node shoot.js <sub> <outDir> <path:file.png> [<path:file.png> ...]
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const WEB = process.env.WEB || 'http://localhost:3100';
const [sub, outDir, ...shots] = process.argv.slice(2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const token = await (await fetch(`http://localhost:9998/token?sub=${encodeURIComponent(sub)}&name=${encodeURIComponent(process.env.NAME || sub)}`)).text();
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cs-chrome-'));
  const chrome = spawn('google-chrome', ['--headless=new', '--no-sandbox', '--hide-scrollbars', '--remote-debugging-port=9333',
    `--user-data-dir=${profile}`, '--window-size=1440,900', 'about:blank'], { stdio: 'ignore' });
  let target;
  for (let i = 0; i < 50 && !target; i++) {
    await sleep(200);
    try { target = (await (await fetch('http://localhost:9333/json')).json()).find((t) => t.type === 'page'); } catch {}
  }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let id = 0; const pending = {};
  ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending[d.id]) { pending[d.id](d); delete pending[d.id]; } };
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });

  await send('Page.enable');
  // Print-friendly light theme: the app follows prefers-color-scheme when no choice is stored.
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] });
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  for (const name of ['ecotrack_it', 'ecotrack_at']) {
    await send('Network.setCookie', { name, value: token, url: WEB, httpOnly: true, path: '/' });
  }
  fs.mkdirSync(outDir, { recursive: true });
  for (const spec of shots) {
    // route:file[:waitMs[:viewportHeight[:buttonTextToClick]]]
    const [route, file, waitMs = '9000', height = '900', click] = spec.split(':');
    await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: Number(height), deviceScaleFactor: 1, mobile: false });
    await send('Page.navigate', { url: `${WEB}${route}` });
    await sleep(Number(waitMs));
    if (click) {
      await send('Runtime.evaluate', { expression: `[...document.querySelectorAll('button,a')].find((b) => b.textContent.trim() === ${JSON.stringify(click)})?.click()` });
      await sleep(4000);
    }
    const { result } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    fs.writeFileSync(path.join(outDir, file), Buffer.from(result.data, 'base64'));
    console.log(`${route} -> ${file}`);
  }
  ws.close(); chrome.kill();
}
main().catch((e) => { console.error(e); process.exit(1); });
