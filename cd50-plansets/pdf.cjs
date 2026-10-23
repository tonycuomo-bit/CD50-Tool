// Prints sites/<site>/out/cd50.html to cd50.pdf (36x24 in), then opens the PDF and its folder.
// Usage: node cd50-plansets/pdf.cjs sites/<site> [--no-open]   (no opening in CI, with --no-open or CD50_NO_OPEN=1)
const path = require('path');
const { execSync, spawn } = require('child_process');
const { pathToFileURL } = require('url');
const { chromium } = require(execSync('npm root -g').toString().trim()+'/playwright');
const args = process.argv.slice(2), noOpen = args.includes('--no-open'), site = args.filter(a => a !== '--no-open');
if (site.length !== 1) { console.error('usage: node cd50-plansets/pdf.cjs sites/<site> [--no-open]'); process.exit(1); }
const out = path.resolve(site[0], 'out'), pdf = path.join(out, 'cd50.pdf');
function run(cmd, a) { spawn(cmd, a, {detached:true, stdio:'ignore', windowsVerbatimArguments:true}).on('error', ()=>{}).unref(); }
function show() {
  if (noOpen || process.env.CI || process.env.CD50_NO_OPEN) return;
  if (process.platform === 'win32') { run('cmd', ['/c', 'start', '""', `"${pdf}"`]); run('explorer', [`/select,"${pdf}"`]); }
  else if (process.platform === 'darwin') { run('open', [pdf]); run('open', ['-R', pdf]); }
  else if (process.env.DISPLAY || process.env.WAYLAND_DISPLAY) { run('xdg-open', [pdf]); run('xdg-open', [out]); }
}
(async()=>{
const b = await chromium.launch({executablePath:'/opt/pw-browsers/chromium'}).catch(()=>chromium.launch());
const p = await b.newPage();
await p.goto(pathToFileURL(path.join(out, 'cd50.html')).href); await p.waitForTimeout(500);
try { await p.pdf({path:pdf, width:'36in', height:'24in', printBackground:true, preferCSSPageSize:true}); }
catch (e) { await b.close(); console.error(`Could not write ${pdf}. If it is open in a PDF viewer, close it and run again.\n${e.message}`); process.exit(1); }
await b.close();
console.log('PDF: ' + pdf);
show();})();
