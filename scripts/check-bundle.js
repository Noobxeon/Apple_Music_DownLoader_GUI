const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const engine = path.resolve(__dirname, '../vendor/gamdl-engine/gamdl-engine.exe');
if (!fs.existsSync(engine)) throw new Error('Missing bundled engine. Run your build venv Python scripts/build-engine.py first.');
const report = JSON.parse(execFileSync(engine, ['--gui-self-test'], { encoding: 'utf8', windowsHide: true, timeout: 30000 }));
if (report.version !== '3.9.1' || !report.frozen || !report.native) throw new Error('Bundled engine self-test failed.');
console.log('Release bundle: standalone engine is ready.');
