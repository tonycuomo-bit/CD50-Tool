const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim()+'/playwright');
(async()=>{
const b = await chromium.launch({executablePath:'/opt/pw-browsers/chromium'}).catch(()=>chromium.launch());
const p = await b.newPage();
await p.goto('file://'+__dirname+'/cd50.html'); await p.waitForTimeout(500);
await p.pdf({path:__dirname+'/cd50.pdf', width:'36in', height:'24in', printBackground:true, preferCSSPageSize:true});
await b.close();})();
