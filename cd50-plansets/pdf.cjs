// Prints sites/<site>/out/cd50.html to cd50.pdf (36x24 in).  Usage: node cd50-plansets/pdf.cjs sites/<site>
const path = require('path');
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim()+'/playwright');
if (process.argv.length !== 3) { console.error('usage: node cd50-plansets/pdf.cjs sites/<site>'); process.exit(1); }
const out = path.resolve(process.argv[2], 'out');
(async()=>{
const b = await chromium.launch({executablePath:'/opt/pw-browsers/chromium'}).catch(()=>chromium.launch());
const p = await b.newPage();
await p.goto('file://'+path.join(out, 'cd50.html')); await p.waitForTimeout(500);
await p.pdf({path:path.join(out, 'cd50.pdf'), width:'36in', height:'24in', printBackground:true, preferCSSPageSize:true});
await b.close();})();
