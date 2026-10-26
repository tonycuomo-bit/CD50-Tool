(() => {
// ---------- sizing. Mirrors cd50-plansets/sizing.py; tests/test_sizing.py runs this block in node and compares.
// BEGIN SIZING
// BEGIN RULES (copied from rules/sizing_rules.json by tools/sync_rules.py; edit the JSON, not this line)
const RULES = {"volts":480,"posts_per_cabinet":{"V4":8,"MW":2},"inputs":[{"kva":499,"label":"499 kW · Cleveland / Madisonville basis (600 A)"},{"kva":625,"label":"625 kVA nameplate (750 A)"},{"kva":998,"label":"998 kVA nameplate (1200 A)"},{"kva":1247,"label":"1247 kVA nameplate (1500 A)"}],"ocpd_factor":1.25,"xfmr_factor":1.25,"service_factor":1.25,"std_ocpd":[400,450,500,600,700,800,1000,1200,1600,2000,2500,3000,4000,5000],"std_xfmr":[150,225,300,500,750,1000,1500,2000,2500,3000,3750,5000],"panelboard_max_amps":800,"feeders":[{"max_amps":800,"amps_per_set":310,"cond":"500 kcmil AL"},{"max_amps":null,"amps_per_set":385,"cond":"750 kcmil AL"}],"egc_al":{"400":"1 AL","450":"1/0 AL","500":"1/0 AL","600":"2/0 AL","700":"3/0 AL","800":"3/0 AL","1000":"4/0 AL","1200":"250 kcmil AL","1600":"350 kcmil AL","2000":"400 kcmil AL","2500":"600 kcmil AL","3000":"600 kcmil AL","4000":"750 kcmil AL","5000":"1200 kcmil AL"}};
// END RULES
// BEGIN TESLA (copied from rules/tesla_rules.json by tools/sync_rules.py; edit the JSON, not this line)
const TESLA = {"sources":{"V4DG":"Tesla V4 Supercharger Design Guide, rev 0 (06/23/25, plotted 04/28/26)","V4IM":"Tesla V4 Supercharger Install Manual (12/2025)","CCDM":"Tesla Commercial Charging Design Manual, NA (rev 03/18/24)"},"cat_max_ft":330,"cat_runs":"post to cabinet, cabinet to cabinet, cabinet to switchgear","posts_per_cabinet_max":8,"dc_trench":{"max_per_group":24,"group_sep_in":24,"no_fill_max":4,"max_depth_in":28},"stall":{"w":9,"l":17,"obst":[9,10.5,11]},"ada":{"van":{"w":11,"aisle":5},"std":{"w":9,"aisle":5},"amb":null,"l":18},"notes":[["Comms run length","CAT6 (shielded) post to cabinet, cabinet to cabinet or cabinet to switchgear: 330 ft (100 m) max. Checked on every DC, COM and cabinet feeder run (plan length + 10 ft stub-ups).","V4DG G-106; CCDM p.31"],["Posts per cabinet","8 V4 posts max per V4 cabinet. Multi-cabinet sites: one leader cabinet, up to 9 followers.","V4IM; V4DG G-106"],["DC post circuits","(1) 4\" conduit per post: (4) 600 kcmil AL (2 POS, 2 NEG) or (4) 350 kcmil CU, 4/0 AL or 2/0 CU EGC, Tesla signal cable bundle. 1000 V rated, 90°C min.","V4DG G-107; V4IM"],["Cabinet AC input","(5) 4\" conduits, each (3) 750 kcmil AL, no neutral; EGC 350 kcmil AL (1250 kW) or 250 kcmil AL (990 kW). EEOR confirms against NEC 250.122.","V4DG G-107"],["Breakers (Tesla)","Cabinet 1600 AF/AT 80% (2000 A for the 1500 A NEVI variant). Main 100% rated: 1 cab 1600 A, 2 cab 3000 A, 3 cab 5000 AF / 4500 AT.","V4DG G-106"],["DC post trench","Up to 24 DC post conduits per group with no spacing; over 24, 24\" between groups of 24 max. 28\" max to top of upper conduits; 24\" min cover in vehicle areas. Stack 2 high max.","V4DG G-107; supersedes CCDM 16 conduits, 24 in. depth"],["Backfill","More than 4 DC post conduits need engineered backfill per the Rho table (Rho 90 slurry 150 psi, Rho 60 concrete 3000 psi, Rho 120 tested native). 2\" min around conduits. Red warning tape 8\" below grade.","V4DG G-107"],["AC trench","Cabinet feeders: 5 conduits per cabinet, 15 per group (1200 A); 6 per cabinet, 18 per group (1500 A); 24\" between groups.","V4DG G-107"],["Conduit stub-ups","V4 cabinet: 4-6\" above concrete, bell fittings on rigid conduit, all conduits labeled. Post anchors 4\" min above foundation.","V4IM"],["Cabinet","Clearances 5' front, 3' sides, 6\" back; front clearance not over a curb drop or drive aisle. Pad slope 0.5-2%. Slabs over 50 ft need an expansion joint.","V4DG G-105"],["Post","Service side 1'-6\", non-service 5\" clear. Rear clearance not over an elevation change or road. Level within 1/4\"; leveling nuts to 4% slope.","V4DG G-101; V4IM; CCDM p.76"],["Fuel","Posts and cabinets 20 ft min from fuel dispensers and 10 ft from UST vents, all directions (NEC 514.3(B)(1)).","V4DG G-101, G-105"],["Stalls and aisles","Stall 9' x 17' min (10'-6\" / 11' with obstruction one / both sides). Drive aisle 20' min; angled stalls need a 24' two-way aisle (no V4 posts on one-way angled aisles). Trailer stall 13'-6\" x 34' with 24' aisles, 10% max of stalls.","V4DG G-101 to G-103; CCDM pp.7-19"],["Protection","Fixed bollards at supply equipment, never inside service clearances (removable there). A curb alone protects only if 6\" or higher; non-post equipment 5' min from curb face. Parking stops 4\" max high, 3' to curb, 4' to wall. Sign bottoms 80\" where people walk.","CCDM pp.22-25"]]};
// END TESLA
const SQ3 = Math.sqrt(3);
const STD_OCPD = RULES.std_ocpd, STD_XFMR = RULES.std_xfmr, INPUTS = RULES.inputs;
const nextUp = (list, v) => list.find(x => x >= v - 1e-6) ?? list[list.length-1];
// feeder sets for a given breaker / service rating
function feeder(amps){
  const f = RULES.feeders.find(f => f.max_amps === null || amps <= f.max_amps);
  return {sets:Math.ceil(amps / f.amps_per_set), cond:f.cond};
}
// groups: [{kind:"V4"|"MW", posts, kva, ...}] on one service; kva is the per-cabinet input setting
function sizeGroups(groups){
  const G = groups.map(g => {
    const perCab = RULES.posts_per_cabinet[g.kind];
    const cabs = Math.max(1, Math.ceil(g.posts / perCab));
    const cabAmps = g.kva * 1000 / (RULES.volts * SQ3);
    const cabOcpd = nextUp(STD_OCPD, cabAmps * RULES.ocpd_factor);
    const nameplate = INPUTS.slice(1).find(i => i.kva >= g.kva) || INPUTS[INPUTS.length - 1];
    return {...g, perCab, cabs, cabAmps, cabOcpd, nameplate, derated:g.kva < nameplate.kva};
  });
  const cabs = G.reduce((a, g) => a + g.cabs, 0);
  const totalKva = G.reduce((a, g) => a + g.kva * g.cabs, 0);
  const totalAmps = G.reduce((a, g) => a + g.cabAmps * g.cabs, 0);
  const xfReq = totalKva * RULES.xfmr_factor;
  const xfmr = nextUp(STD_XFMR, xfReq);
  const svcReq = Math.max(...G.map(g => g.cabOcpd), totalAmps * RULES.service_factor);
  const svcAmps = nextUp(STD_OCPD, svcReq);
  const svcOver = svcReq > STD_OCPD[STD_OCPD.length - 1];
  const xfOver = xfReq > STD_XFMR[STD_XFMR.length - 1];
  const svcType = svcAmps <= RULES.panelboard_max_amps ? "Panelboard" : "Switchboard";
  const svcTag = svcType === "Panelboard" ? "PB1" : "SB-1";
  const g0 = G[0];
  return {G, cabs, perCab:g0.perCab, kva:g0.kva, cabAmps:g0.cabAmps, cabOcpd:g0.cabOcpd, totalKva, totalAmps, xfReq, xfmr, xfOver, svcReq, svcAmps, svcOver, svcType, svcTag,
    derated:G.some(g => g.derated), nameplate:g0.nameplate};
}
// END SIZING

<!-- @include sites.js -->

// ---------- export contract with cd50-plansets/cd50.py (checked there by layout_io.py, described in cd50-layout/layout-format.md).
// TOOL_BUILD is filled in by tools/build_layout.py with a hash of src/, so a build can be traced to the tool that made its layout.
const LAYOUT_FORMAT = "cd50-layout/2", TOOL_BUILD = "@@TOOL_BUILD@@";

// ---------- state
const DEFAULT = {product:"V4", posts:4, inputKva:499, mwPosts:2, mwInputKva:1247, items:{}, routes:{}, img:null, view:null, sketch:true, opacity:0.8, bollards:true,
  park:{jur:"CA", stripe:"w4", w:9, l:18, stencil:true, sign:"tesla", aisleCol:"white"}, pk:{}};
let S = {...structuredClone(DEFAULT), ...(load() || {})};
S.park = {...DEFAULT.park, ...(S.park || {})}; S.pk = S.pk || {};
const O = id => S.items[id] || S.pk[id];
// one address, written different ways ("299 E. San Ysidro Blvd" / "299 east san ysidro boulevard"), compares equal
const normAddr = a => String(a || "").toLowerCase().replace(/[.,#]/g, " ").replace(/\b(east)\b/g, "e").replace(/\b(west)\b/g, "w")
  .replace(/\b(north)\b/g, "n").replace(/\b(south)\b/g, "s").replace(/\b(boulevard)\b/g, "blvd").replace(/\b(drive)\b/g, "dr")
  .replace(/\b(street)\b/g, "st").replace(/\b(avenue)\b/g, "ave").replace(/\b(northwest)\b/g, "nw").replace(/\b(northeast)\b/g, "ne")
  .replace(/\b(southwest)\b/g, "sw").replace(/\b(southeast)\b/g, "se").replace(/\s+/g, " ").trim();
const addrKey = a => normAddr(a).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "none";
// the site folder name for an address, same rule as tools/aerial.py and tools/new_site.py: street part, up to 5 words
function siteSlug(a){ return String(a || "").toLowerCase().split(",")[0].replace(/[^a-z0-9 ]+/g, " ").trim().split(/\s+/).filter(Boolean).slice(0, 5).join("-"); }
const sameAddr = (a, b) => !a || !b || normAddr(a) === normAddr(b);   // an unknown address matches anything
// Every background is placed so the site point (the address pin, or the centre of a sketch sent at its scale) lands here, in
// tool feet, near the default equipment row. Load site, the sketch result, Google Earth import and Sketch view all use it.
const SITE_PT = [60, 50];
// How the background's scale is known, exported with layout.json (frame.scale) so the plan set can flag an estimate:
// measured (preset, a marked length, an Earth path), assumed (a count of standard 9 ft stalls), estimated (Earth saved view,
// sketch from 9 ft stalls), unscaled. Anything but measured is flagged on the plan views.
const setScale = (I, how, by) => { I.scale = {how, by}; return I; };
const scaleHow = I => (I && I.scale && I.scale.how) || (I && I.guess ? "unscaled" : "measured");
// ---------- browser storage. The layout goes to localStorage; its images (data URIs, often over 1 MB each) go to IndexedDB,
// so a few images can't fill the ~5 MB localStorage quota and stop the layout from saving. A failed write shows a warning.
const IDB = (() => {
  let dbp = null;
  const open = () => dbp || (dbp = new Promise((res, rej) => {
    try { const r = indexedDB.open("cd50layout", 1); r.onupgradeneeded = () => r.result.createObjectStore("img"); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }
    catch(e){ rej(e); } }));
  const run = (mode, fn) => open().then(db => new Promise((res, rej) => { const t = db.transaction("img", mode), q = fn(t.objectStore("img"));
    t.oncomplete = () => res(q.result); t.onerror = t.onabort = () => rej(t.error); }));
  return {get:k => run("readonly", st => st.get(k)), put:(k, v) => run("readwrite", st => st.put(v, k)), del:k => run("readwrite", st => st.delete(k))};
})();
const kept = {};   // key -> the data URI last written, so an unchanged image is not written again
function keepImage(key, src){
  if (typeof src !== "string" || !src.startsWith("data:")) return src;   // already a reference ("idb:...") or nothing
  if (kept[key] !== src){ kept[key] = src; IDB.put(key, src).catch(e => { delete kept[key]; storeWarn("images", e); }); }
  return "idb:" + key;
}
function storeWarn(what, e){ const w = document.getElementById("storewarn"); if (!w) return; w.hidden = false;
  w.textContent = `This browser did not keep the ${what} (${(e && (e.name || e.message)) || "storage error"}), so they will be gone after a reload. Download layout to keep your work.`; }
function save(){
  undoNote();
  let o = S;
  if (S.img){ const I = S.img; o = {...S, img:{...I, src:keepImage("bg", I.src), sketchSrc:I.sketchSrc === I.src ? "same" : keepImage("bgsketch", I.sketchSrc)}}; }
  try { localStorage.setItem("cd50layout", JSON.stringify(o)); } catch(e){ storeWarn("layout", e); }
}
// ---------- undo: the last UNDO_MAX changes to the layout. save() runs on every render, so a change is taken as done once the
// layout has been still for UNDO_IDLE ms (a whole drag is one step). Pan/zoom, the address, site folders and builds are not undone.
const UNDO_MAX = 4, UNDO_IDLE = 400, UNDO_KEEP = ["view", "address", "folders", "build", "sketchAuto"];
const undoStack = []; let undoCur = null, undoTimer = null;
function undoSnap(){ const o = {...S}; for (const k of UNDO_KEEP) delete o[k];
  const I = S.img; if (I) o.img = {...I, src:null, sketchSrc:null};
  return {json:JSON.stringify(o), src:I && I.src, sk:I && I.sketchSrc}; }   // image data URIs are kept by reference, not copied
const sameSnap = (a, b) => a && b && a.json === b.json && a.src === b.src && a.sk === b.sk;
function undoNote(){ clearTimeout(undoTimer); undoTimer = setTimeout(() => { const s = undoSnap();
  if (!undoCur){ undoCur = s; return; }
  if (sameSnap(s, undoCur)) return;
  undoStack.push(undoCur); if (undoStack.length > UNDO_MAX) undoStack.shift(); undoCur = s; undoBtn(); }, UNDO_IDLE); }
function undoReset(){ clearTimeout(undoTimer); undoStack.length = 0; undoCur = null; undoNote(); undoBtn(); }   // a new project address starts a fresh history
function undoBtn(){ const b = document.getElementById("b-undo"); if (!b) return;
  b.disabled = !undoStack.length; b.textContent = undoStack.length ? `↶ Undo (${undoStack.length})` : "↶ Undo"; }
function undo(){
  clearTimeout(undoTimer); const now = undoSnap();
  if (undoCur && !sameSnap(now, undoCur)){ undoCur = now; }   // an edit still settling counts as the step being undone
  const s = undoStack.pop(); if (!s) return;
  const keep = {}; for (const k of UNDO_KEEP) if (k in S) keep[k] = S[k];
  const o = JSON.parse(s.json); if (o.img){ o.img.src = s.src; o.img.sketchSrc = s.sk; }
  for (const k of Object.keys(S)) delete S[k];
  Object.assign(S, o, keep); undoCur = s;
  selectOnly(null); syncInputs(); syncPark(); render(); undoBtn();
}
// put saved images back after load; a missing one (storage cleared) falls back to the sample lot with a warning
async function restoreImages(){
  const I = S.img; let lost = false;
  if (I){
    const get = async (v, key) => { if (typeof v !== "string" || !v.startsWith("idb:")) return v; const d = await IDB.get(key).catch(() => null); if (d) kept[key] = d; return d; };
    const src = await get(I.src, "bg"), sk = I.sketchSrc === "same" ? src : await get(I.sketchSrc, "bgsketch");
    if (S.img === I){ if (src){ I.src = src; I.sketchSrc = sk || src; } else { lost = true; S.img = sampleLot(); } }
  }
  if (await restorePhotos()) lost = true;
  if (lost) storeWarn("saved images", {name:"not found"});
  drawPhotos(); syncInputs(); render();
}
function load(){ try{ const t = localStorage.getItem("cd50layout"); return t ? JSON.parse(t) : null; }catch(e){ return null; } }

// ---------- sizing
// charger groups on the one service: V4 only, MW only, or MW + V4 (mixed)
function groups(){
  const v4 = {kind:"V4", posts:S.posts, kva:S.inputKva, cabPrefix:"SPR-", postPrefix:""};
  if (S.product === "V4") return [v4];
  if (S.product === "MW") return [{...v4, kind:"MW"}];
  return [v4, {kind:"MW", posts:S.mwPosts, kva:S.mwInputKva, cabPrefix:"MW-", postPrefix:"M"}];
}
function size(){ return sizeGroups(groups()); }
const grp = (z, kind) => z.G.find(g => g.kind === kind) || z.G[0];

// ---------- equipment specs (feet). Approximate footprints from the V4 template and SSC details.
function xfmrDims(kva){
  if (kva <= 300) return [5.5,5.5]; if (kva <= 750) return [6.5,5.7];
  if (kva <= 1500) return [7.5,7]; if (kva <= 2500) return [8.2,8]; return [9,9];
}
function svcDims(a){ if (a <= 800) return [3,1.8]; if (a <= 1600) return [3.5,4]; if (a <= 2500) return [7,4.5]; return [15.7,5.2]; }
function spec(it, z){
  switch(it.type){
    case "xfmr": { const [w,d] = xfmrDims(z.xfmr); return {w:w-1.2,d:d-1.4,pw:w,pd:d,cs:3,cb:3,cf:8,shape:"rect",name:`Utility transformer ${z.xfmr} kVA`}; }
    case "ct": return {w:3,d:1.2,pw:6,pd:1.6,cs:0,cb:0,cf:3,shape:"rect",name:"CT cabinet on utility rack"};
    case "mtr": return {w:1.1,d:0.9,pw:0,pd:0,cs:0,cb:0,cf:3,shape:"round",name:"Utility meter"};
    case "svc": { const [w,d] = svcDims(z.svcAmps); return {w,d,pw:w+1,pd:d+1,cs:0,cb:0,cf:3.5,shape:"rect",name:`${z.svcAmps} A ${z.svcType.toLowerCase()} ${z.svcTag}`}; }
    case "cab": return it.kind === "MW"
      ? {w:5.2,d:4.0,pw:6.2,pd:5.0,cs:3,cb:0.5,cf:5,shape:"rect",name:`V4 Megacharger cabinet, ${grp(z, "MW").kva} kVA input`}
      : {w:4.56,d:3.85,pw:5.6,pd:4.9,cs:3,cb:0.5,cf:5,shape:"rect",name:`V4 Supercharger cabinet, ${grp(z, "V4").kva} kVA input`};
    case "post": return {w:1.9,d:0.9,pw:4.67,pd:2.5,cs:0,cb:1.5,cf:0,shape:"oval",name:it.kind === "MW" ? "V4 Megacharger post" : "V4 Supercharger post"};
  }
}
// ---------- bollards. Sources: Tesla V4 templatized S-502 (rebounding bollards 2'-3 3/4" each side of post CL),
// Tesla MW Design Guide G-102 fig. 4 (drive-thru: one bollard 5'-7" upstream of post), CFC 312 guard posts
// (3' from equipment, 4' max on center) for cabinets / service, utility transformer per utility (3' sides, removable at doors).
function bollardRing(hw, hd, off, sides, removableSides){
  const P = [], c = {tl:[-hw-off,-hd-off], tr:[hw+off,-hd-off], br:[hw+off,hd+off], bl:[-hw-off,hd+off]};
  const edges = {back:["tl","tr"], right:["tr","br"], front:["br","bl"], left:["bl","tl"]};
  for (const sd of sides){ const [a, b] = edges[sd].map(k => c[k]); const L = Math.hypot(b[0]-a[0], b[1]-a[1]); const n = Math.max(1, Math.ceil(L / 4));
    for (let i = 0; i <= n; i++){ const p = [a[0] + (b[0]-a[0])*i/n, a[1] + (b[1]-a[1])*i/n];
      if (!P.some(q => Math.hypot(q.x-p[0], q.y-p[1]) < 0.5)) P.push({x:p[0], y:p[1], k:removableSides.includes(sd) ? "removable" : "fixed"}); } }
  return P;
}
function inPoly(x, y, P){ let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++){ const [xi, yi] = P[i], [xj, yj] = P[j];
  if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; }
// guard posts never go inside the site's truck swept path (noBollard polygon, tool ft); Tesla post bollards stay
function bollards(it, s){
  if (S.bollards === false) return [];
  if (it.bl) return it.bl;
  const all = bollardsRaw(it, s); const site = S.img && SITES.find(x => x.id === S.img.site); const P = site && site.noBollard;
  if (!P) return all; const c = Math.cos(it.rot * Math.PI / 180), sn = Math.sin(it.rot * Math.PI / 180);
  return all.filter(b => b.k === "rebound" || !inPoly(it.x + b.x*c - b.y*sn, it.y + b.x*sn + b.y*c, P));
}
// guard-post sides per equipment type; the front (door side) is removable
const RING = {cab:["left","right","front"], xfmr:["left","right","back","front"], svc:["left","right","front"], ct:["left","right","front"]};
function bollardsRaw(it, s){
  if (it.type === "post") return it.kind === "MW" ? [{x:-5.583, y:0, k:"rebound"}] : [{x:-2.3125, y:0, k:"rebound"}, {x:2.3125, y:0, k:"rebound"}];
  return RING[it.type] ? bollardRing(s.pw/2, s.pd/2, 3, RING[it.type], ["front"]) : [];
}
// exactly n guard posts spaced evenly along the same ring (user-chosen count; spacing may exceed 4 ft o.c.)
function bollardRingN(it, s, n){
  const off = 3, hw = s.pw/2 + off, hd = s.pd/2 + off, closed = RING[it.type].includes("back");
  const V = closed ? [[-hw,-hd],[hw,-hd],[hw,hd],[-hw,hd],[-hw,-hd]] : [[-hw,-hd],[-hw,hd],[hw,hd],[hw,-hd]];
  const seg = V.slice(1).map((b, i) => Math.hypot(b[0]-V[i][0], b[1]-V[i][1])), L = seg.reduce((a, b) => a + b, 0);
  const at = d => { for (let i = 0; i < seg.length; i++){ if (d <= seg[i] + 1e-9 || i === seg.length - 1){ const t = seg[i] ? Math.min(1, d / seg[i]) : 0;
    return [V[i][0] + (V[i+1][0]-V[i][0])*t, V[i][1] + (V[i+1][1]-V[i][1])*t]; } d -= seg[i]; } };
  const P = [];
  for (let i = 0; i < n; i++){ const [x, y] = at(closed ? L*i/n : n === 1 ? L/2 : L*i/(n-1));
    P.push({x:+x.toFixed(3), y:+y.toFixed(3), k:Math.abs(y - hd) < 0.01 && Math.abs(x) < hw - 0.01 ? "removable" : "fixed"}); }
  return P;
}
function inTruckPath(it, b){
  const site = S.img && SITES.find(x => x.id === S.img.site); const P = site && site.noBollard; if (!P) return false;
  const c = Math.cos(it.rot * Math.PI / 180), sn = Math.sin(it.rot * Math.PI / 180);
  return inPoly(it.x + b.x*c - b.y*sn, it.y + b.x*sn + b.y*c, P);
}
// first edit on an item freezes its current bollards into it.bl, which then moves and rotates with the item
function customBollards(it, z){ if (!it.bl) it.bl = bollards(it, spec(it, z)).map(b => ({...b})); return it.bl; }
// ---------- parking: EV stalls, accessible EVCS, striping, signs (tool ft; stall head = charger end at local y = -l/2)
// Accessible EVCS: CA CBC 11B-228.3.2.1 (scoping) and 11B-812 (van 12' + 5' aisle, standard 9' + 5', ambulatory 10' no aisle, 18' long).
// Federal: no enforceable EV scoping yet; 2010 ADA 208.2 parking table used as a proxy, with US Access Board EV recommendations for size.
// Tesla V4 Supercharger Design Guide (rev 0, 06/23/25): G-101 stall minimums, G-104 ADA configurations.
// Effective size is the larger of Tesla and the jurisdiction (CA van 12', otherwise 11', per G-104).
const JUR = {
  CA:{label:"California (CBC 11B-812)", van:{w:12, aisle:5}, std:{w:9, aisle:5}, amb:{w:10, aisle:0}, l:18},
  FED:{label:"Federal (2010 ADA + Access Board EV guidance)", van:{w:11, aisle:5}, std:{w:8, aisle:5}, amb:null, l:18},
};
const TESLA_ADA = TESLA.ada;        // G-104: van 11' (12' CA) + 5' aisle, standard 9' + 5', 18' long
const TESLA_STALL = TESLA.stall;    // G-101: min 9' x 17'; width 9' / 10'-6" / 11' with 0 / 1 / 2 side obstructions
const AISLE_COL = {white:{label:"White (Tesla G-104)", col:"#f8fafc"}, blue:{label:"Blue", col:"#2563eb"}};
const STRIPES = {
  w4:{label:"4\" white single line", col:"#f8fafc", dbl:false},
  hp:{label:"4\" white hairpin (double, 12\" apart)", col:"#f8fafc", dbl:true},
  y4:{label:"4\" yellow single line", col:"#facc15", dbl:false},
  bl:{label:"4\" blue single line", col:"#2563eb", dbl:false},
};
const SIGNS = {
  tesla:{code:"TESLA", label:"Tesla Supercharger parking sign (Tesla-furnished)"},
  d911b:{code:"D9-11b", label:"EV charging symbol + EV CHARGING plaque (MUTCD D9-11b/D9-11bP)"},
  tow:{code:"CVC 22511", label:"EV charging only, tow-away (CA CVC 22511)"},
  isa:{code:"ISA", label:"Accessible EVCS, ISA (R7-8 / CBC 11B-812.8)"},
  van:{code:"VAN", label:"ISA + VAN ACCESSIBLE plaque (R7-8P)"},
  idle:{code:"IDLE", label:"Time limit / idle fee (owner text)"},
};
const STALL_KINDS = {ev:"EV stall", van:"Van accessible EVCS", std:"Standard accessible EVCS", amb:"Ambulatory EVCS"};
function adaRequired(n, jur){
  if (n < 1) return {van:0, std:0, amb:0};
  if (jur === "CA"){
    if (n <= 4) return {van:1, std:0, amb:0}; if (n <= 25) return {van:1, std:1, amb:0}; if (n <= 50) return {van:1, std:1, amb:1};
    if (n <= 75) return {van:1, std:2, amb:2}; if (n <= 100) return {van:1, std:3, amb:3};
    return {van:1, std:3 + Math.ceil((n-100)/60), amb:3 + Math.ceil((n-100)/50)};
  }
  const T = [[25,1],[50,2],[75,3],[100,4],[150,5],[200,6],[300,7],[400,8],[500,9]];
  const tot = (T.find(t => n <= t[0]) || [0, Math.ceil(n*0.02)])[1], van = Math.ceil(tot/6);
  return {van, std:tot - van, amb:0};
}
function stallDims(st){
  const P = S.park, J = JUR[P.jur], l = Math.max(P.l, J.l, TESLA_ADA.l || 0);
  if (st.kind === "ev") return {w:Math.max(P.w, TESLA_STALL.obst[st.obs || 0]), l:Math.max(P.l, TESLA_STALL.l), aisle:0};
  const j = J[st.kind] || J.std, t = TESLA_ADA[st.kind];
  return {w:Math.max(j.w, t ? t.w : 0), l, aisle:Math.max(j.aisle, t ? t.aisle : 0)};
}
function adaCheck(){
  const n = groups().filter(g => g.kind === "V4").reduce((a, g) => a + g.posts, 0);
  const req = adaRequired(n, S.park.jur), have = {van:0, std:0, amb:0};
  for (const o of Object.values(S.pk)) if (o.type === "stall" && have[o.kind] !== undefined) have[o.kind]++;
  // a higher class covers a lower one: van -> standard -> ambulatory
  const sv = have.van - req.van, ss = have.std + Math.max(0, sv) - req.std, sa = have.amb + Math.max(0, ss) - req.amb;
  return {n, req, have, ok:sv >= 0 && ss >= 0 && sa >= 0};
}
let pkSeq = 0;
function pkId(p){ let i; do { i = `${p}${++pkSeq}`; } while (S.pk[i]); return i; }
function addStall(kind, x, y, rot){ const id = pkId(kind === "ev" ? "S" : "A"); S.pk[id] = {id, type:"stall", kind, aisle:"R", x:+x.toFixed(2), y:+y.toFixed(2), rot}; return id; }
// generic landscaping (species TBD): canopy / spread diameter in ft, nursery size
const PLANTS = {
  tree_lg:{code:"T-1", label:"Large canopy tree", dia:30, size:"24\" box", tree:true},
  tree_md:{code:"T-2", label:"Medium canopy tree", dia:20, size:"24\" box", tree:true},
  tree_sm:{code:"T-3", label:"Small accent tree", dia:12, size:"15 gal", tree:true},
  tree_col:{code:"T-4", label:"Columnar screening tree", dia:8, size:"15 gal", tree:true},
  shrub_lg:{code:"S-1", label:"Large screening shrub", dia:6, size:"5 gal"},
  shrub_sm:{code:"S-2", label:"Small shrub", dia:3, size:"5 gal"},
  grass:{code:"S-3", label:"Ornamental grass / groundcover", dia:2, size:"1 gal"},
};
function addPlant(plant, x, y){ const id = pkId("PL"); S.pk[id] = {id, type:"plant", plant, x:+x.toFixed(2), y:+y.toFixed(2), rot:0}; return id; }
function addSign(sign, x, y){ const id = pkId("SG"); S.pk[id] = {id, type:"sign", sign, x:+x.toFixed(2), y:+y.toFixed(2), rot:0}; return id; }
const local2world = (o, [x, y]) => { const c = Math.cos(o.rot * Math.PI / 180), s = Math.sin(o.rot * Math.PI / 180); return [o.x + x*c - y*s, o.y + x*s + y*c]; };
function stallsAtPosts(){
  for (const id of Object.keys(S.pk)) if (S.pk[id].type === "stall" && S.pk[id].kind === "ev" && S.pk[id].auto) delete S.pk[id];
  for (const p of Object.values(S.items)) if (p.type === "post" && p.kind !== "MW"){
    const [x, y] = local2world(p, [0, S.park.l/2 - 1.6]); S.pk[addStall("ev", x, y, p.rot)].auto = true; }
}
function signsAtStalls(){
  for (const id of Object.keys(S.pk)) if (S.pk[id].type === "sign" && S.pk[id].auto) delete S.pk[id];
  for (const o of Object.values(S.pk)) if (o.type === "stall"){ const d = stallDims(o);
    const [x, y] = local2world(o, [0, -d.l/2 - 0.8]); S.pk[addSign(o.kind === "ev" ? S.park.sign : o.kind === "van" ? "van" : "isa", x, y)].auto = true; }
}
function drawParking(g, unit){
  const P = S.park, sp = STRIPES[P.stripe] || STRIPES.w4;
  for (const o of Object.values(S.pk)){
    const on = isSel(o.id), gg = el("g", {transform:`translate(${o.x} ${o.y}) rotate(${o.rot})`, "data-pk":o.id, style:"cursor:move"}, g);
    if (o.type === "plant"){ const pl = PLANTS[o.plant] || PLANTS.shrub_sm, r = (o.dia || pl.dia)/2;
      el("circle", {cx:0, cy:0, r, fill:"#16a34a", "fill-opacity":pl.tree ? 0.18 : 0.3, stroke:on ? "var(--sel)" : "#15803d", "stroke-width":unit*(on ? 3 : 1.2), "stroke-dasharray":pl.tree ? `${unit*5} ${unit*2}` : "none"}, gg);
      if (pl.tree){ el("circle", {cx:0, cy:0, r:Math.max(0.3, r*0.08), fill:"#15803d"}, gg); for (let k = 0; k < 6; k++){ const a = k*Math.PI/3; el("line", {x1:0, y1:0, x2:r*0.7*Math.cos(a), y2:r*0.7*Math.sin(a), stroke:"#15803d", "stroke-width":unit*0.8}, gg); } }
      const t = el("text", {x:0, y:0, "font-size":Math.max(unit*9, 0.8), "text-anchor":"middle", "dominant-baseline":"central", fill:"var(--ink)", "font-family":"IBM Plex Mono, monospace", "paint-order":"stroke", stroke:"var(--canvas)", "stroke-width":unit*3}, gg);
      t.textContent = pl.code; continue; }
    if (o.type === "sign"){ el("circle", {cx:0, cy:0, r:Math.max(0.6, unit*6), fill:"#dc2626", stroke:on ? "var(--sel)" : "var(--ink)", "stroke-width":unit*(on ? 3 : 1.2)}, gg);
      const t = el("text", {x:unit*9, y:0, "font-size":Math.max(unit*10, 0.9), fill:"var(--ink)", "dominant-baseline":"central", "font-family":"IBM Plex Mono, monospace", transform:`rotate(${-o.rot})`, "paint-order":"stroke", stroke:"var(--canvas)", "stroke-width":unit*3}, gg);
      t.textContent = (SIGNS[o.sign] || {code:"?"}).code; continue; }
    const d = stallDims(o), ada = o.kind !== "ev", ac = (AISLE_COL[P.aisleCol] || AISLE_COL.white).col, col = ada ? ac : sp.col, hw = d.w/2, hl = d.l/2;
    el("rect", {x:-hw, y:-hl, width:d.w, height:d.l, fill:ada ? "#2563eb" : "var(--accent)", "fill-opacity":on ? 0.18 : 0.06, stroke:on ? "var(--sel)" : "none", "stroke-width":unit*2}, gg);
    const line = (x) => { const xs = !ada && sp.dbl ? [x - 0.5, x + 0.5] : [x];
      for (const xx of xs){ el("line", {x1:xx, y1:-hl, x2:xx, y2:hl, stroke:"var(--ink)", "stroke-width":0.5, "stroke-linecap":"round"}, gg);
        el("line", {x1:xx, y1:-hl, x2:xx, y2:hl, stroke:col, "stroke-width":0.33, "stroke-linecap":"round"}, gg); } };
    line(-hw); line(hw);
    if (d.aisle){ const ax = o.aisle === "L" ? -hw - d.aisle : hw, x0 = ax, x1 = ax + d.aisle;
      line(o.aisle === "L" ? x0 : x1);
      const hatch = (xa, wa, k) => { const hp = el("path", {d:Array.from({length:Math.ceil(d.l/3) + 2}, (_, i) => { const y = -hl + i*3; return `M${xa} ${y}L${xa + wa} ${y - wa}`; }).join(""), stroke:"var(--ink)", "stroke-width":0.45, fill:"none"}, gg);
        const hp2 = hp.cloneNode(); hp2.setAttribute("stroke", ac); hp2.setAttribute("stroke-width", 0.3); gg.appendChild(hp2);
        const cid = `clip-${o.id}-${k}`; const cp = el("clipPath", {id:cid}, gg); el("rect", {x:xa, y:-hl, width:wa, height:d.l}, cp);
        hp.setAttribute("clip-path", `url(#${cid})`); hp2.setAttribute("clip-path", `url(#${cid})`);
        el("rect", {x:xa, y:-hl, width:wa, height:d.l, fill:"none", stroke:ac, "stroke-width":0.33}, gg); };
      hatch(x0, d.aisle, "a");
      if (o.buffer){ hatch(o.aisle === "L" ? hw : -hw - 2, 2, "b"); }
      const t = el("text", {x:x0 + d.aisle/2, y:hl - 3, "font-size":1, "text-anchor":"middle", "dominant-baseline":"central", fill:"var(--ink)", "font-weight":700, transform:`rotate(-90 ${x0 + d.aisle/2} ${hl - 3})`, "font-family":"IBM Plex Sans Condensed, sans-serif", "paint-order":"stroke", stroke:"var(--canvas)", "stroke-width":0.25}, gg); t.textContent = "NO PARKING"; }
    // G-104: 30" x 48" clear floor space at the charge post, beyond the head of an accessible stall
    if (ada) el("rect", {x:-2, y:-hl - 2.5, width:4, height:2.5, fill:"none", stroke:ac, "stroke-width":unit*1.5, "stroke-dasharray":`${unit*4} ${unit*3}`}, gg);
    const lab = ada ? {van:"VAN", std:"ACCESSIBLE", amb:"AMBULATORY"}[o.kind] : (P.stencil ? "EV CHARGING ONLY" : "");
    if (lab){ const t = el("text", {x:0, y:hl - 2.5, "font-size":Math.min(1.2, d.w/8), "text-anchor":"middle", fill:ada ? ac : "var(--ink)", "font-weight":700, "font-family":"IBM Plex Sans Condensed, sans-serif", opacity:0.85}, gg); t.textContent = lab; }
  }
}
function parkingExport(r3){
  const P = S.park, out = {jurisdiction:P.jur, jurisdiction_label:JUR[P.jur].label, striping:P.stripe, striping_label:(STRIPES[P.stripe] || STRIPES.w4).label,
    stencil:!!P.stencil, aisle_marking:`4" ${P.aisleCol === "blue" ? "blue" : "white"} border and cross striping, NO PARKING in 12" letters (Tesla G-104)`,
    aisle_color:P.aisleCol === "blue" ? "blue" : "white", ada:adaCheck(), stalls:[], signs:[]};
  for (const o of Object.values(S.pk)){
    const tr = p => local2world(o, p).map(r3);
    if (o.type === "plant") continue;
    if (o.type === "sign"){ out.signs.push({id:o.id, sign:o.sign, code:SIGNS[o.sign].code, label:SIGNS[o.sign].label, xy:tr([0, 0])}); continue; }
    const d = stallDims(o), hw = d.w/2, hl = d.l/2, ax = o.aisle === "L" ? -hw - d.aisle : hw, bx = o.aisle === "L" ? hw : -hw - 2;
    out.stalls.push({id:o.id, kind:o.kind, name:STALL_KINDS[o.kind], x:r3(o.x), y:r3(o.y), rot:r3(o.rot), w_ft:d.w, l_ft:d.l, aisle_ft:d.aisle, aisle_side:d.aisle ? o.aisle : null,
      side_obstructions:o.kind === "ev" ? (o.obs || 0) : null,
      outline:[[-hw,-hl],[hw,-hl],[hw,hl],[-hw,hl]].map(tr), aisle:d.aisle ? [[ax,-hl],[ax+d.aisle,-hl],[ax+d.aisle,hl],[ax,hl]].map(tr) : null,
      buffer:o.kind !== "ev" && o.buffer ? [[bx,-hl],[bx+2,-hl],[bx+2,hl],[bx,hl]].map(tr) : null,
      clear_floor:o.kind !== "ev" ? [[-2,-hl-2.5],[2,-hl-2.5],[2,-hl],[-2,-hl]].map(tr) : null});
  }
  return out;
}
function landscapeExport(r3){
  const plants = Object.values(S.pk).filter(o => o.type === "plant").map(o => { const pl = PLANTS[o.plant] || PLANTS.shrub_sm;
    return {id:o.id, plant:o.plant, code:pl.code, label:pl.label, tree:!!pl.tree, dia_ft:o.dia || pl.dia, size:pl.size, species:"TBD", xy:[r3(o.x), r3(o.y)]}; });
  return plants.length ? {plants} : null;
}
const COLORS = {xfmr:"#64748b", ct:"#475569", mtr:"#475569", svc:"#0f766e", cab:"#9a3412", post:"#1f2937", cabMW:"#6d28d9", postMW:"#4c1d95"};

// ---------- items + runs
function buildItems(z){
  const want = [];
  want.push({id:"XR-1", type:"xfmr"}, {id:"CT-1", type:"ct"}, {id:"MTR", type:"mtr"}, {id:z.svcTag, type:"svc"});
  const letters = "ABCDEFGH";
  for (const g of z.G){
    for (let c = 1; c <= g.cabs; c++) want.push({id:`${g.cabPrefix}${c}`, type:"cab", kind:g.kind});
    for (let p = 0; p < g.posts; p++){ const c = Math.floor(p / g.perCab) + 1; want.push({id:`${g.postPrefix}${c}${letters[p % g.perCab]}`, type:"post", kind:g.kind, cab:`${g.cabPrefix}${c}`}); }
  }
  const old = S.items; const next = {}; let missing = false;
  // keep service equipment position across PB1 / SB-1 renames
  const oldSvc = Object.values(old).find(o => o.type === "svc");
  for (const w of want){
    const o = old[w.id] || (w.type === "svc" ? oldSvc : null);
    if (o) next[w.id] = {...w, x:o.x, y:o.y, rot:o.rot||0, ...(o.bl ? {bl:o.bl} : {})}; else { next[w.id] = {...w, x:null, y:null, rot:0}; missing = true; }
  }
  S.items = next;
  if (missing) arrange(z, true);
}
function arrange(z, onlyMissing){
  // stalls run along y=60 (curb) heading north; equipment row behind the curb
  const its = Object.values(S.items);
  const mixed = S.product === "MIX";
  const posts = its.filter(i => i.type === "post" && !(mixed && i.kind === "MW"));
  const stall = 10.5;
  const baseX = 40, curbY = 56;
  const place = (it, x, y, rot) => { if (!onlyMissing || it.x == null){ it.x = x; it.y = y; it.rot = rot; } };
  posts.forEach((p, i) => place(p, baseX + 6 + i * stall, curbY + 1.6, 0));
  const cabs = its.filter(i => i.type === "cab" && !(mixed && i.kind === "MW"));
  cabs.forEach((c, i) => place(c, baseX + 6 + i * 16, curbY - 9, 180));
  // MW (Semi) posts get their own pull-through row west of the car stalls, 16 ft apart (site.mwRow can override)
  if (mixed){
    const site = S.img && SITES.find(s => s.id === S.img.site); const [mx, my] = (site && site.mwRow) || [baseX - 160, curbY + 30];
    const nl = (site && site.mwLayout) ? [site.mwLayout.posts.length, site.mwLayout.cabs.length] : [0, 0];
    its.filter(i => i.type === "post" && i.kind === "MW").forEach((p, i) => { if (i >= nl[0]) place(p, mx + i * 16, my, 0); });
    its.filter(i => i.type === "cab" && i.kind === "MW").forEach((c, i) => { if (i >= nl[1]) place(c, mx + 8 + i * 32, my - 9, 180); });
  }
  // a site can carry a drawn MW layout: put the first MW posts / cabinets on it
  const lay = S.img && (SITES.find(s => s.id === S.img.site) || {}).mwLayout;
  if (lay){
    its.filter(i => i.type === "post" && i.kind === "MW").forEach((p, i) => { const q = lay.posts[i]; if (q) place(p, q[0], q[1], q[2]); });
    its.filter(i => i.type === "cab" && i.kind === "MW").forEach((c, i) => { const q = lay.cabs[i]; if (q) place(c, q[0], q[1], q[2]); });
  }
  const svc = its.find(i => i.type === "svc"); const xf = its.find(i => i.type === "xfmr");
  const ct = its.find(i => i.type === "ct"); const m = its.find(i => i.type === "mtr");
  // a site can carry a drawn service yard (transformer, switchboard, CT, meter) as [x, y, rot] in tool ft
  const sl = (S.img && (SITES.find(s => s.id === S.img.site) || {}).svcLayout) || {};
  place(svc, ...(sl.svc || [baseX - 8, curbY - 9, 180]));
  place(ct, ...(sl.ct || [baseX - 8, curbY - 17, 180]));
  place(m, ...(sl.mtr || [baseX - 5.8, curbY - 17.2, 180]));
  place(xf, ...(sl.xfmr || [baseX - 22, curbY - 14, 90]));
  if (!onlyMissing) S.routes = {};
}
function runs(z){
  const R = []; const its = S.items;
  const svcF = feeder(z.svcAmps);
  R.push({id:"SL-1", from:"XR-1", to:"CT-1", kind:"ac", n:svcF.sets, size:'4"', cond:`(3) ${svcF.cond} + (1) neutral per set`, fn:"Service lateral"});
  R.push({id:"SL-2", from:"CT-1", to:z.svcTag, kind:"ac", n:svcF.sets, size:'4"', cond:`(3) ${svcF.cond} + (1) neutral per set`, fn:"Service lateral"});
  Object.values(its).filter(i => i.type === "cab").forEach(c => { const g = grp(z, c.kind), cabF = feeder(g.cabOcpd);
    R.push({id:`AC-${c.id}`, from:z.svcTag, to:c.id, kind:"ac", n:cabF.sets, size:'4"', cond:`(3) ${cabF.cond} + EGC per set, no neutral`, fn:`Cabinet feeder, ${g.cabOcpd} A breaker`}); });
  Object.values(its).filter(i => i.type === "post").forEach(p =>
    R.push({id:`DC-${p.id}`, from:p.cab, to:p.id, kind:"dc", n:p.kind === "MW" ? 2 : 1, size:'4"',
      cond: p.kind === "MW" ? "(4) 750 kcmil AL per set, EGC, Tesla signal wire" : "(4) 600 kcmil AL (2+, 2−), #2/0 CU EGC, Tesla signal wire", fn:"DC-POST"}));
  const cabs = Object.values(its).filter(i => i.type === "cab");
  for (let k = 1; k < cabs.length; k++) R.push({id:`COM-${k}`, from:cabs[k-1].id, to:cabs[k].id, kind:"com", n:1, size:'1.25"', cond:"(2) CAT6 shielded (etherloop)", fn:"Cabinet comms"});
  return R;
}

// ---------- geometry
const svg = document.getElementById("plan");
const NS = "http://www.w3.org/2000/svg";
function el(tag, attrs, parent){ const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; }
function pathPts(r){ const a = S.items[r.from], b = S.items[r.to]; const mid = S.routes[r.id] || []; return [[a.x,a.y], ...mid, [b.x,b.y]]; }
function plen(pts){ let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0]-pts[i-1][0], pts[i][1]-pts[i-1][1]); return L; }
function toFt(evt){ const p = svg.createSVGPoint(); p.x = evt.clientX; p.y = evt.clientY; const q = p.matrixTransform(svg.getScreenCTM().inverse()); return [q.x, q.y]; }

// ---------- view
function fit(){
  const xs = [], ys = [];
  Object.values(S.items).forEach(i => { xs.push(i.x); ys.push(i.y); });
  if (S.img){ xs.push(S.img.x, S.img.x + S.img.w / S.img.ppf); ys.push(S.img.y, S.img.y + S.img.h / S.img.ppf); }
  const minX = Math.min(...xs) - 15, maxX = Math.max(...xs) + 15, minY = Math.min(...ys) - 15, maxY = Math.max(...ys) + 15;
  S.view = {x:minX, y:minY, w:maxX - minX, h:maxY - minY};
}
function zoom(f, cx, cy){
  const v = S.view; cx ??= v.x + v.w/2; cy ??= v.y + v.h/2;
  S.view = {x:cx - (cx - v.x) * f, y:cy - (cy - v.y) * f, w:v.w * f, h:v.h * f}; render();
}

// ---------- sample lot (drawn once, 10 px per ft)
function sampleLot(){
  const ppf = 10, W = 140, H = 100; const c = document.createElement("canvas"); c.width = W*ppf; c.height = H*ppf;
  const g = c.getContext("2d"); g.fillStyle = "#fafaf8"; g.fillRect(0,0,c.width,c.height);
  g.strokeStyle = "#2b2b2b"; g.lineWidth = 3;
  g.fillStyle = "#e8e8e3"; g.fillRect(0, 56*ppf, W*ppf, 44*ppf); // asphalt
  g.beginPath(); g.moveTo(0, 56*ppf); g.lineTo(W*ppf, 56*ppf); g.stroke(); // curb
  g.lineWidth = 2; for (let x = 40; x <= 136; x += 10.5){ g.beginPath(); g.moveTo(x*ppf, 56*ppf); g.lineTo(x*ppf, 74*ppf); g.stroke(); }
  g.setLineDash([18,12]); g.beginPath(); g.moveTo(0, 86*ppf); g.lineTo(W*ppf, 86*ppf); g.stroke(); g.setLineDash([]);
  g.fillStyle = "#cfe3c9"; g.fillRect(0, 0, W*ppf, 56*ppf);
  g.strokeStyle = "#7c8c74"; g.lineWidth = 2;
  for (let i = 0; i < 9; i++){ g.beginPath(); g.arc((12 + i*15)*ppf, 6*ppf, 4*ppf, 0, Math.PI*2); g.stroke(); }
  g.strokeStyle = "#2b2b2b"; g.setLineDash([30,10,6,10]); g.beginPath(); g.moveTo(0, 2*ppf); g.lineTo(W*ppf, 2*ppf); g.stroke(); g.setLineDash([]);
  g.fillStyle = "#555"; g.font = `${2*ppf}px sans-serif`; g.fillText("SAMPLE LOT · EXISTING ASPHALT PARKING", 44*ppf, 95*ppf); g.fillText("PROPERTY LINE", 4*ppf, 5.2*ppf);
  const url = c.toDataURL("image/png");
  return {src:url, sketchSrc:url, w:c.width, h:c.height, ppf, x:0, y:0, sample:true, scale:{how:"measured", by:"sample lot"}};
}

// ---------- sketch conversion (Sobel edges over a faded tone)
function makeSketch(img, w, h){
  const c = document.createElement("canvas"); c.width = w; c.height = h; const g = c.getContext("2d");
  g.drawImage(img, 0, 0, w, h); const d = g.getImageData(0, 0, w, h); const p = d.data;
  const gray = new Float32Array(w*h);
  for (let i = 0; i < w*h; i++) gray[i] = 0.299*p[i*4] + 0.587*p[i*4+1] + 0.114*p[i*4+2];
  const out = g.createImageData(w, h);
  for (let y = 1; y < h-1; y++) for (let x = 1; x < w-1; x++){
    const i = y*w + x;
    const gx = -gray[i-w-1] - 2*gray[i-1] - gray[i+w-1] + gray[i-w+1] + 2*gray[i+1] + gray[i+w+1];
    const gy = -gray[i-w-1] - 2*gray[i-w] - gray[i-w+1] + gray[i+w-1] + 2*gray[i+w] + gray[i+w+1];
    const m = Math.min(255, Math.hypot(gx, gy) * 1.3);
    const tone = 235 + (gray[i] - 128) * 0.08;
    const v = Math.max(0, Math.min(255, tone - m));
    out.data[i*4] = v; out.data[i*4+1] = v; out.data[i*4+2] = v; out.data[i*4+3] = 255;
  }
  g.putImageData(out, 0, 0); return c.toDataURL("image/png");
}
function cropImage(src, sx, sy, sw, sh){
  return new Promise(res => { const im = new Image(); im.onload = () => {
    const c = document.createElement("canvas"); c.width = sw; c.height = sh; c.getContext("2d").drawImage(im, sx, sy, sw, sh, 0, 0, sw, sh); res(c.toDataURL("image/jpeg", 0.9)); }; im.src = src; });
}

// ---------- render
// selection: selSet holds every selected item and parking/landscape object; selected is the one the inspectors show
let selected = null, selBoll = null, mode = "select", selSet = new Set(), multi = false;
const isSel = id => selSet.has(id);
function selectOnly(id){ selected = id || null; selSet = new Set(id ? [id] : []); selBoll = null; }
const selIds = () => [...selSet].filter(id => O(id));
const selCentre = ids => { let x = 0, y = 0; for (const id of ids){ x += O(id).x; y += O(id).y; } return [x / ids.length, y / ids.length]; };
const norm360 = a => +(((a % 360) + 360) % 360).toFixed(1);
const snapOf = ids => Object.fromEntries(ids.map(id => { const o = O(id); return [id, {x:o.x, y:o.y, rot:o.rot || 0}]; }));
// rotate the objects in snap by deg about pivot c (a single item turns in place); any angle, 0 to 360
function rotateSnap(snap, c, deg){ const t = deg * Math.PI / 180, cs = Math.cos(t), sn = Math.sin(t);
  for (const [id, s0] of Object.entries(snap)){ const o = O(id); if (!o) continue; delete o.auto;
    const dx = s0.x - c[0], dy = s0.y - c[1]; o.x = +(c[0] + dx*cs - dy*sn).toFixed(2); o.y = +(c[1] + dx*sn + dy*cs).toFixed(2); o.rot = norm360(s0.rot + deg); } }
function rotateSel(deg){ const ids = selIds(); if (!ids.length) return; rotateSnap(snapOf(ids), ids.length > 1 ? selCentre(ids) : [O(ids[0]).x, O(ids[0]).y], deg); }
function render(){
  const z = size(); const R = runs(z);
  const v = S.view; svg.setAttribute("viewBox", `${v.x} ${v.y} ${v.w} ${v.h}`);
  svg.replaceChildren();
  const defs = el("defs", {}, svg);
  const pat = el("pattern", {id:"hatch", width:1, height:1, patternUnits:"userSpaceOnUse", patternTransform:"rotate(45)"}, defs);
  el("line", {x1:0, y1:0, x2:0, y2:1, stroke:"var(--pad)", "stroke-width":0.12}, pat);
  const unit = v.w / svg.clientWidth || 0.05; // ft per screen px

  if (S.img){
    const sl = S.sketch ? sketchLayer() : null;
    const im = el("image", sl ? {...sl, opacity:S.opacity, preserveAspectRatio:"none"} : {href: S.sketch ? S.img.sketchSrc : S.img.src, x:S.img.x, y:S.img.y, width:S.img.w / S.img.ppf, height:S.img.h / S.img.ppf, opacity:S.opacity, preserveAspectRatio:"none"}, svg);
    if (S.sketch) im.setAttribute("class", "sketch");
    if (S.img.pin){ const [px, py] = S.img.pin; const gp = el("g", {"pointer-events":"none"}, svg);
      el("circle", {cx:px, cy:py, r:unit*7, fill:"none", stroke:"var(--clear)", "stroke-width":unit*2}, gp);
      el("path", {d:`M${px-unit*12} ${py}H${px+unit*12}M${px} ${py-unit*12}V${py+unit*12}`, stroke:"var(--clear)", "stroke-width":unit*1.5}, gp);
      const pt = el("text", {x:px + unit*10, y:py - unit*10, "font-size":unit*11, fill:"var(--clear)", "font-family":"IBM Plex Mono, monospace", "paint-order":"stroke", stroke:"var(--canvas)", "stroke-width":unit*3}, gp);
      pt.textContent = S.img.pinLabel || "Address"; }
  }
  const gK = el("g", {}, svg); drawParking(gK, unit);
  const gC = el("g", {}, svg), gP = el("g", {}, svg), gR = el("g", {}, svg), gI = el("g", {}, svg), gH = el("g", {}, svg);

  // equipment
  for (const it of Object.values(S.items)){
    const s = spec(it, z);
    const g = el("g", {transform:`translate(${it.x} ${it.y}) rotate(${it.rot})`, "data-item":it.id, style:"cursor:move"}, gI);
    if (s.cs || s.cb || s.cf) el("rect", {x:-s.w/2 - s.cs, y:-s.d/2 - s.cb, width:s.w + 2*s.cs, height:s.d + s.cb + s.cf, fill:"none", stroke:"var(--clear)", "stroke-width":unit*1.2, "stroke-dasharray":`${unit*5} ${unit*4}`, opacity:0.75}, gC)
      .setAttribute("transform", `translate(${it.x} ${it.y}) rotate(${it.rot})`);
    if (s.pw) el("rect", {x:-s.pw/2, y:-s.pd/2, width:s.pw, height:s.pd, fill:"url(#hatch)", stroke:"var(--pad)", "stroke-width":unit*1.2}, gP)
      .setAttribute("transform", `translate(${it.x} ${it.y}) rotate(${it.rot})`);
    const col = (it.kind === "MW" && S.product === "MIX" && COLORS[it.type + "MW"]) || COLORS[it.type];
    if (s.shape === "oval") el("ellipse", {cx:0, cy:0, rx:s.w/2, ry:s.d/2, fill:col, stroke:isSel(it.id) ? "var(--sel)" : "none", "stroke-width":unit*3}, g);
    else if (s.shape === "round") el("circle", {cx:0, cy:0, r:s.w/2, fill:col, stroke:isSel(it.id) ? "var(--sel)" : "none", "stroke-width":unit*3}, g);
    else el("rect", {x:-s.w/2, y:-s.d/2, width:s.w, height:s.d, fill:col, rx:0.15, stroke:isSel(it.id) ? "var(--sel)" : "none", "stroke-width":unit*3}, g);
    bollards(it, s).forEach((b, i) => { const on = selBoll && selBoll.id === it.id && selBoll.i === i;
      const gb = el("g", {transform:`translate(${it.x} ${it.y}) rotate(${it.rot})`, "data-boll":`${it.id}|${i}`, style:"cursor:move"}, gH);
      el("circle", {cx:b.x, cy:b.y, r:Math.max(0.45, unit*7), fill:"transparent"}, gb);
      el("circle", {cx:b.x, cy:b.y, r:on ? 0.6 : 0.45, fill:b.k === "rebound" ? "#f97316" : b.k === "removable" ? "var(--sheet)" : "#eab308", stroke:on ? "var(--sel)" : "var(--ink)", "stroke-width":unit*(on ? 3 : 1.2)}, gb); });
    // front edge marker
    if (s.shape !== "round") el("line", {x1:-s.w/2, y1:s.d/2, x2:s.w/2, y2:s.d/2, stroke:"#fbbf24", "stroke-width":unit*2.5}, g);
    const t = el("text", {x:0, y:0, "font-size":Math.max(unit*11, 0.9), "text-anchor":"middle", "dominant-baseline":"central", fill:"#fff", "font-family":"IBM Plex Mono, monospace", transform:`rotate(${-it.rot})`, "pointer-events":"none"}, g);
    t.textContent = it.id;
  }

  // conduits
  for (const r of R){
    const pts = pathPts(r); const d = "M" + pts.map(p => p.join(" ")).join(" L");
    const col = r.kind === "dc" ? "var(--conduit-dc)" : r.kind === "com" ? "var(--conduit-com)" : "var(--conduit-ac)";
    const w = (r.kind === "dc" ? 2 : 2 + Math.min(r.n, 6) * 0.6) * unit;
    el("path", {d, fill:"none", stroke:col, "stroke-width":w, "stroke-dasharray":r.kind === "com" ? `${unit*6} ${unit*4}` : "none", "stroke-linejoin":"round", "pointer-events":"none"}, gR);
    el("path", {d, fill:"none", stroke:"transparent", "stroke-width":unit*14, "data-run":r.id, style:"cursor:copy"}, gR);
    // label on the longest segment
    let best = 1, bl = -1; for (let i = 1; i < pts.length; i++){ const l = Math.hypot(pts[i][0]-pts[i-1][0], pts[i][1]-pts[i-1][1]); if (l > bl){ bl = l; best = i; } }
    const a = pts[best-1], b = pts[best]; let ang = Math.atan2(b[1]-a[1], b[0]-a[0]) * 180 / Math.PI; if (ang > 90) ang -= 180; if (ang < -90) ang += 180;
    if (bl > unit * 60){
      const lt = el("text", {x:(a[0]+b[0])/2, y:(a[1]+b[1])/2, "font-size":unit*10.5, fill:col, "text-anchor":"middle", "font-family":"IBM Plex Mono, monospace",
        transform:`rotate(${ang} ${(a[0]+b[0])/2} ${(a[1]+b[1])/2}) translate(0 ${-unit*5})`, "pointer-events":"none", "paint-order":"stroke", stroke:"var(--canvas)", "stroke-width":unit*3}, gR);
      lt.textContent = `(${r.n}) ${r.size}C`;
    }
    (S.routes[r.id] || []).forEach((p, i) => el("circle", {cx:p[0], cy:p[1], r:unit*5, fill:"var(--sheet)", stroke:col, "stroke-width":unit*2, "data-vtx":`${r.id}|${i}`, style:"cursor:pointer"}, gH));
  }

  // group selection outline, rotate guide, selection box
  if (selSet.size > 1){ const ids = selIds(); if (ids.length){ const xs = ids.map(id => O(id).x), ys = ids.map(id => O(id).y), m = 3;
    el("rect", {x:Math.min(...xs) - m, y:Math.min(...ys) - m, width:Math.max(...xs) - Math.min(...xs) + 2*m, height:Math.max(...ys) - Math.min(...ys) + 2*m, fill:"none", stroke:"var(--sel)", "stroke-width":unit*1.5, "stroke-dasharray":`${unit*4} ${unit*3}`, "pointer-events":"none"}, gH); } }
  if (drag && drag.kind === "rot" && drag.cur){ const [cx, cy] = drag.c, [qx, qy] = drag.cur, r = Math.hypot(qx - cx, qy - cy);
    el("circle", {cx, cy, r, fill:"none", stroke:"var(--sel)", "stroke-width":unit*1.2, "stroke-dasharray":`${unit*5} ${unit*4}`, "pointer-events":"none"}, gH);
    el("line", {x1:cx, y1:cy, x2:qx, y2:qy, stroke:"var(--sel)", "stroke-width":unit*1.5, "pointer-events":"none"}, gH);
    const t = el("text", {x:qx + unit*10, y:qy - unit*10, "font-size":unit*13, fill:"var(--sel)", "font-family":"IBM Plex Mono, monospace", "paint-order":"stroke", stroke:"var(--canvas)", "stroke-width":unit*3, "pointer-events":"none"}, gH);
    t.textContent = drag.ids.length > 1 ? `${drag.deg >= 0 ? "+" : ""}${(drag.deg || 0).toFixed(1)}°` : `${norm360(O(drag.ids[0]).rot || 0)}°`; }
  if (drag && drag.kind === "box"){ const [x0,y0] = drag.a, [x1,y1] = drag.b;
    el("rect", {x:Math.min(x0,x1), y:Math.min(y0,y1), width:Math.abs(x1-x0), height:Math.abs(y1-y0), fill:"var(--sel)", "fill-opacity":0.08, stroke:"var(--sel)", "stroke-width":unit*1.5, "stroke-dasharray":`${unit*4} ${unit*3}`, "pointer-events":"none"}, gH); }
  // crop / scale overlays
  if (drag && drag.kind === "crop"){ const [x0,y0] = drag.a, [x1,y1] = drag.b;
    el("rect", {x:Math.min(x0,x1), y:Math.min(y0,y1), width:Math.abs(x1-x0), height:Math.abs(y1-y0), fill:"var(--accent)", "fill-opacity":0.12, stroke:"var(--accent)", "stroke-width":unit*2, "stroke-dasharray":`${unit*6} ${unit*4}`}, gH); }
  if (S.img && S.img.ge) for (const sh of S.img.ge.shapes){ // the Google Earth placemark shapes, to check the fit
    el(sh.closed ? "polygon" : "polyline", {points:sh.pts.map(q => q.join(",")).join(" "), fill:"none", stroke:"var(--warn, #c2410c)", "stroke-width":unit*2, "stroke-dasharray":`${unit*8} ${unit*5}`, "pointer-events":"none"}, gH);
    if (mode === "gecal" && sh === S.img.ge.cal) [sh.pts[0], sh.pts[sh.pts.length - 1]].forEach((q, i) => { const t = el("text", {x:q[0] + unit*6, y:q[1] - unit*6, "font-size":unit*12, fill:"var(--warn, #c2410c)", "pointer-events":"none"}, gH); t.textContent = i ? "last" : "first"; }); }
  if (scalePts.length){ const pts = scalePts.concat(drag && (drag.kind === "scale" || drag.kind === "gecal") ? [drag.b] : []);
    if (pts.length > 1) el("line", {x1:pts[0][0], y1:pts[0][1], x2:pts[1][0], y2:pts[1][1], stroke:"var(--accent)", "stroke-width":unit*3}, gH);
    pts.forEach(p => el("circle", {cx:p[0], cy:p[1], r:unit*5, fill:"var(--accent)"}, gH)); }

  // north arrow + scale bar (screen corner)
  const nx = v.x + v.w - unit*40, ny = v.y + unit*46;
  const na = el("g", {"pointer-events":"none", transform:`rotate(${(S.img && S.img.north) || 0} ${nx} ${ny})`}, svg);
  el("circle", {cx:nx, cy:ny, r:unit*18, fill:"var(--sheet)", stroke:"var(--ink)", "stroke-width":unit*1.5}, na);
  el("path", {d:`M${nx} ${ny-unit*15} L${nx+unit*7} ${ny+unit*9} L${nx} ${ny+unit*4} L${nx-unit*7} ${ny+unit*9} Z`, fill:"var(--ink)"}, na);
  const nt = el("text", {x:nx, y:ny+unit*30, "font-size":unit*12, "text-anchor":"middle", fill:"var(--ink)", "font-family":"IBM Plex Sans Condensed, sans-serif"}, na); nt.textContent = "N";
  const nice = [1,2,5,10,20,25,50,100,200,500]; const target = unit*120; const L = nice.find(n => n >= target) || 500;
  const sx = v.x + v.w - unit*30 - L, sy = v.y + v.h - unit*24;
  const sb = el("g", {"pointer-events":"none"}, svg);
  el("rect", {x:sx - unit*6, y:sy - unit*18, width:L + unit*12, height:unit*28, fill:"var(--sheet)", opacity:0.85}, sb);
  el("rect", {x:sx, y:sy, width:L/2, height:unit*4, fill:"var(--ink)"}, sb);
  el("rect", {x:sx + L/2, y:sy, width:L/2, height:unit*4, fill:"none", stroke:"var(--ink)", "stroke-width":unit}, sb);
  const st = el("text", {x:sx + L/2, y:sy - unit*5, "font-size":unit*11, "text-anchor":"middle", fill:"var(--ink)", "font-family":"IBM Plex Mono, monospace"}, sb); st.textContent = `${L} ft`;

  renderSide(z, R);
  save();
}

// Tesla limits (rules/tesla_rules.json). CAT6 runs with every DC post circuit, cabinet comms run and cabinet feeder (V4DG G-106).
const STUB_FT = 10;   // stub-up allowance added to plan length, same as the plan set generator
function catRun(r){ return r.kind === "dc" || r.kind === "com" || (r.kind === "ac" && S.items[r.to] && S.items[r.to].type === "cab"); }
function teslaChecks(R){
  const T = TESLA, out = [], cat = R.filter(catRun).map(r => ({r, L:plen(pathPts(r)) + STUB_FT}));
  if (cat.length){ const m = cat.reduce((a, b) => b.L > a.L ? b : a);
    const over = cat.filter(c => c.L > T.cat_max_ft);
    out.push({ok:!over.length, text:over.length ? `${over.map(c => c.r.id).join(", ")} over the ${T.cat_max_ft} ft CAT6 limit (${T.cat_runs}). Move the cabinet closer or add a cabinet.`
      : `Longest comms run ${m.r.id} ${m.L.toFixed(0)} ft incl. stub-ups, within the ${T.cat_max_ft} ft CAT6 limit.`}); }
  const byCab = {}; R.filter(r => r.kind === "dc").forEach(r => byCab[r.from] = (byCab[r.from] || 0) + r.n);
  for (const [cab, n] of Object.entries(byCab)){ const D = T.dc_trench;
    out.push({ok:n <= D.max_per_group, info:n > D.no_fill_max, text:`${cab}: ${n} DC post conduit${n > 1 ? "s" : ""} in the trench. ` + (n > D.max_per_group ? `Over ${D.max_per_group}: split into groups ${D.group_sep_in}" apart. ` : "") +
      (n > D.no_fill_max ? `More than ${D.no_fill_max}: engineered backfill per the Tesla Rho table, ${D.max_depth_in}" max to top of conduit.` : "Native backfill allowed.")}); }
  const posts = Object.values(S.items).filter(i => i.type === "post" && i.kind === "V4"), cabs = new Set(posts.map(p => p.cab));
  for (const c of cabs){ const n = posts.filter(p => p.cab === c).length;
    if (n > T.posts_per_cabinet_max) out.push({ok:false, text:`${c} feeds ${n} V4 posts; Tesla allows ${T.posts_per_cabinet_max}.`}); }
  return out;
}
function fmtA(a){ return Math.round(a).toLocaleString(); }
function renderSide(z, R){
  const res = document.getElementById("results");
  res.innerHTML = `
    ${z.G.map(g => `
    <dt>${z.G.length > 1 ? g.kind + " cabinets" : "Cabinets"}</dt><dd>${g.cabs} <span class="sub">(${g.perCab} posts each max)</span></dd>
    <dt>${z.G.length > 1 ? g.kind + " input / breaker" : "Input per cabinet"}</dt><dd>${g.kva} kVA · ${fmtA(g.cabAmps)} A${z.G.length > 1 ? ` · ${g.cabOcpd} A/3P` : ""}</dd>`).join("")}
    <dt>Total input</dt><dd>${z.totalKva.toLocaleString()} kVA</dd>
    <dt>Transformer (× 1.25)</dt><dd>${fmtA(z.xfReq)} → <b>${z.xfmr.toLocaleString()} kVA</b>${z.xfOver ? ' <span class="pill warn">Over largest pad-mount</span>' : ""}</dd>
    ${z.G.length > 1 ? "" : `<dt>Cabinet breaker</dt><dd>${z.cabOcpd} A/3P</dd>`}
    <dt>Service equipment</dt><dd>${z.svcAmps} A ${z.svcType.toLowerCase()} ${z.svcTag}${z.svcOver ? ` <span class="pill warn">Needs ${fmtA(z.svcReq)} A</span>` : ""}</dd>
    ${(() => { if (S.bollards === false) return `<dt>Bollards</dt><dd><span class="pill warn">Hidden</span></dd>`; let n = {rebound:0, fixed:0, removable:0};
      for (const it of Object.values(S.items)) for (const b of bollards(it, spec(it, z))) n[b.k]++;
      return `<dt>Bollards</dt><dd>${n.rebound + n.fixed + n.removable} <span class="sub">(${n.rebound} Tesla rebounding · ${n.fixed} fixed · ${n.removable} removable)</span></dd>`; })()}
    <dt>Derate table</dt><dd>${z.derated ? '<span class="pill warn">Required</span>' : '<span class="pill ok">Not needed</span>'}</dd>`;
  document.getElementById("assume").textContent =
    `Transformer uses the next standard size at or above the required kVA (${z.xfReq.toFixed(0)} kVA), so it is never undersized. ` +
    `Breakers follow NEC 240.6 standard sizes at 125% of input current. Feeder sets are preliminary for the EEOR to confirm.` +
    (z.G.length > 1 ? ` MW and V4 cabinets share one transformer and service; the service is sized at 125% of the summed cabinet input current.` : "") +
    (z.svcOver ? ` That exceeds a single 5000 A, 480 V service, so plan on a second service or a utility discussion about load management.` : "");
  renderPark();
  const ins = document.getElementById("inspector");
  if (selSet.size > 1){ const ids = selIds();
    ins.innerHTML = `<div><b>${ids.length} items selected</b> <span class="sub">${ids.join(", ")}</span></div>
      <div class="note">Drag any of them to move the group. Rotate turns the group about its centre.</div>
      <div class="btns"><button class="btn" type="button" data-grot="-90">⟲ 90°</button><button class="btn" type="button" data-grot="-15">⟲ 15°</button>
      <button class="btn" type="button" data-grot="15">⟳ 15°</button><button class="btn" type="button" data-grot="90">⟳ 90°</button>
      <label class="note" style="margin:0">Turn by <input id="grotdeg" type="number" min="-360" max="360" step="1" value="0" style="width:64px">°</label>
      <button class="btn" type="button" data-gact="clear">Clear selection</button></div>`;
  } else if (selected && S.items[selected]){
    const it = S.items[selected]; const s = spec(it, z);
    ins.innerHTML = `<div><b style="font-family:var(--f-mono)">${it.id}</b> · ${s.name}</div>
      <div class="note">Pad ${s.pw ? s.pw.toFixed(1) + " × " + s.pd.toFixed(1) + " ft" : "on rack"}</div>
      <div class="btns" style="align-items:center"><label for="rotdeg" class="note" style="margin:0">Rotation</label>
      <input id="rotdeg" type="number" min="0" max="360" step="1" value="${norm360(it.rot)}" style="width:72px"><span class="note" style="margin:0">° (0 to 360)</span></div>
      <div class="btns"><button class="btn" type="button" data-rot="-90">⟲ 90°</button><button class="btn" type="button" data-rot="-15">⟲ 15°</button>
      <button class="btn" type="button" data-rot="15">⟳ 15°</button><button class="btn" type="button" data-rot="90">⟳ 90°</button></div>
      ${S.bollards === false ? "" : (() => { const B = bollards(it, s); const inPath = it.bl ? B.filter(b => b.k !== "rebound" && inTruckPath(it, b)).length : 0;
        const sb = selBoll && selBoll.id === it.id && B[selBoll.i];
        return `<div class="btns" style="align-items:center"><label for="bcount" class="note" style="margin:0">Bollards</label>
          ${RING[it.type] ? `<input id="bcount" type="number" min="0" max="40" step="1" value="${B.length}" style="width:64px">` : `<b>${B.length}</b>`}
          <span class="pill ${it.bl ? "warn" : "ok"}">${it.bl ? "Custom" : "Auto"}</span>
          ${it.bl ? `<button class="btn" type="button" data-bact="reset">Reset to auto</button>` : ""}</div>
          ${inPath ? `<div class="note"><span class="pill warn">${inPath} in truck path</span></div>` : ""}
          ${sb ? `<div class="btns" style="align-items:center"><span class="note" style="margin:0">Bollard ${selBoll.i + 1}:</span>
            ${sb.k === "rebound" ? `<span class="note" style="margin:0">Tesla rebounding</span>` :
              `<button class="btn" type="button" data-bact="fixed" aria-pressed="${sb.k === "fixed"}">Fixed</button><button class="btn" type="button" data-bact="removable" aria-pressed="${sb.k === "removable"}">Removable</button>`}
            <button class="btn" type="button" data-bact="delete">Delete</button></div>` : ""}
          <div class="note">Drag a bollard to move it. Select one and press Delete to remove it.</div>`; })()}`;
  } else ins.innerHTML = `<div class="note">${Object.keys(S.items).length} items placed. Select one on the plan to rotate it, or use ⟳ Rotate and drag it round. Shift-click or Multi-select picks several to move together.</div>`;
  const t = document.getElementById("sched");
  const rows = R.map(r => { const L = plen(pathPts(r)); const over = catRun(r) && L + STUB_FT > TESLA.cat_max_ft;
    const col = r.kind === "dc" ? "var(--conduit-dc)" : r.kind === "com" ? "var(--conduit-com)" : "var(--conduit-ac)";
    return `<tr><td class="tag"><span class="swatch" style="background:${col}"></span>${r.id}</td><td>${r.from} → ${r.to}</td><td>(${r.n}) ${r.size}C<br><span class="note">${r.cond}</span></td><td class="n">${L.toFixed(0)} ft${over ? `<br><span class="pill warn">over ${TESLA.cat_max_ft}</span>` : ""}</td></tr>`; }).join("");
  t.innerHTML = `<thead><tr><th>Run</th><th>From → to</th><th>Conduit and wire</th><th>Length</th></tr></thead><tbody>${rows}</tbody>`;
  document.getElementById("sched-check").innerHTML = teslaChecks(R).map(c => `<div><span class="pill ${c.ok ? (c.info ? "" : "ok") : "warn"}">${c.ok ? (c.info ? "Note" : "OK") : "Check"}</span> ${c.text}</div>`).join("");
}

function renderPark(){
  const P = S.park, c = adaCheck(), J = JUR[P.jur];
  const row = k => `${c.have[k]} of ${c.req[k]}`;
  document.getElementById("pk-check").innerHTML = `<dl class="kv">
    <dt>Accessible EVCS</dt><dd>${c.ok ? '<span class="pill ok">Meets scoping</span>' : '<span class="pill warn">Short</span>'} <span class="sub">(${c.n} V4 EVCS)</span></dd>
    <dt>Van / standard / amb.</dt><dd>${row("van")} · ${row("std")} · ${row("amb")}</dd>
    <dt>Van / standard size</dt><dd>${stallDims({kind:"van"}).w}' + ${stallDims({kind:"van"}).aisle}' · ${stallDims({kind:"std"}).w}' + ${stallDims({kind:"std"}).aisle}' aisle, ${stallDims({kind:"van"}).l}' long</dd></dl>
    <div class="note">${P.jur === "CA" ? "Scoping per CBC Table 11B-228.3.2.1 (MW truck posts excluded). Fishbone and on-the-line ADA stalls are not allowed in CA (Tesla G-104). " : "Federal has no enforceable EV scoping yet: count uses the 2010 ADA 208.2 parking table as a proxy (1 in 6 van); sizes follow the US Access Board EV recommendations. "}Sizes are the larger of Tesla G-104 and the code. Tesla G-104: 30" x 48" clear floor space at the post (dashed), 3' clear behind the post and 1:48 max slope where the accessible route passes the stall head; 4" border and cross striping, NO PARKING in 12" letters; ADA signs per AHJ, clear of operable parts. EV stalls: Tesla G-101 minimum 9' x 17', 10'-6" wide with an obstruction on one side, 11' with both. Verify with the AHJ.</div>`;
  const pi = document.getElementById("pk-ins"), o = selSet.size === 1 && selected && S.pk[selected];
  if (!o){ pi.innerHTML = ""; return; }
  const opts = (M, v, f) => Object.entries(M).map(([k, x]) => `<option value="${k}"${k === v ? " selected" : ""}>${f(x)}</option>`).join("");
  if (o.type === "plant"){ const pl = PLANTS[o.plant] || PLANTS.shrub_sm;
    pi.innerHTML = `<div><b style="font-family:var(--f-mono)">${o.id}</b> · ${pl.code} ${pl.label} · species TBD</div><div class="btns"><select data-pkf="plant">${opts(PLANTS, o.plant, x => `${x.code} ${x.label} (${x.dia}' dia)`)}</select>
      <label class="note" style="margin:0">Dia (ft) <input data-pkf="dia" type="number" min="1" max="60" step="1" value="${o.dia || pl.dia}" style="width:56px"></label><button class="btn" type="button" data-pka="del">Delete</button></div>`; return; }
  pi.innerHTML = o.type === "sign"
    ? `<div><b style="font-family:var(--f-mono)">${o.id}</b> · sign</div><div class="btns"><select data-pkf="sign">${opts(SIGNS, o.sign, x => x.label)}</select>
      <label class="note" style="margin:0">Rotation <input data-pkf="rot" type="number" min="0" max="360" step="1" value="${norm360(o.rot || 0)}" style="width:64px">°</label><button class="btn" type="button" data-pka="del">Delete</button></div>`
    : `<div><b style="font-family:var(--f-mono)">${o.id}</b> · ${STALL_KINDS[o.kind]} · ${stallDims(o).w}' x ${stallDims(o).l}'${stallDims(o).aisle ? ` + ${stallDims(o).aisle}' aisle` : ""}</div>
       <div class="btns"><select data-pkf="kind">${opts(STALL_KINDS, o.kind, x => x)}</select>
       ${o.kind !== "ev" && stallDims(o).aisle ? `<button class="btn" type="button" data-pka="flip">Aisle ${o.aisle === "L" ? "left" : "right"} ⇄</button>
         <button class="btn" type="button" data-pka="buffer" aria-pressed="${!!o.buffer}">2' buffer</button>` : ""}
       ${o.kind === "ev" ? `<select data-pkf="obs">${["No side obstructions (9')", "Obstruction one side (10'-6\")", "Obstructions both sides (11')"].map((t, i) => `<option value="${i}"${(+o.obs || 0) === i ? " selected" : ""}>${t}</option>`).join("")}</select>` : ""}
       <button class="btn" type="button" data-pka="-90">⟲ 90°</button><button class="btn" type="button" data-pka="-15">⟲ 15°</button><button class="btn" type="button" data-pka="15">⟳ 15°</button><button class="btn" type="button" data-pka="90">⟳ 90°</button>
       <label class="note" style="margin:0">Rotation <input data-pkf="rot" type="number" min="0" max="360" step="1" value="${norm360(o.rot || 0)}" style="width:64px">°</label>
       <button class="btn" type="button" data-pka="del">Delete</button></div>`;
}
document.getElementById("tesla-notes").innerHTML = TESLA.notes.map(([t, r, src]) => `<p><b>${t}.</b> ${r} <span class="sub">(${src})</span></p>`).join("") +
  `<p class="sub">${Object.entries(TESLA.sources).map(([k, v]) => `${k}: ${v}`).join(" · ")}. Where they differ, the newest wins.</p>`;
// ---------- inputs
const sel = document.getElementById("input");
sel.innerHTML = INPUTS.map(i => `<option value="${i.kva}">${i.label}</option>`).join("");
const mwSel = document.getElementById("mwinput");
mwSel.innerHTML = sel.innerHTML;
function syncInputs(){
  sel.value = S.inputKva; document.getElementById("posts").value = S.posts;
  mwSel.value = S.mwInputKva; document.getElementById("mwposts").value = S.mwPosts;
  document.getElementById("p-v4").setAttribute("aria-pressed", S.product === "V4");
  document.getElementById("p-mw").setAttribute("aria-pressed", S.product === "MW");
  document.getElementById("p-mix").setAttribute("aria-pressed", S.product === "MIX");
  document.getElementById("mwrow").hidden = S.product !== "MIX";
  document.getElementById("posts-l").textContent = S.product === "MIX" ? "V4 posts" : "Posts installed";
  document.getElementById("input-l").textContent = S.product === "MIX" ? "V4 cabinet input" : "Cabinet input";
  document.getElementById("b-sketch").setAttribute("aria-pressed", !!S.sketch);
  document.getElementById("b-boll").setAttribute("aria-pressed", S.bollards !== false);
  document.getElementById("opacity").value = S.opacity;
  document.getElementById("imgnote").hidden = !(S.img && S.img.sample) && !!S.img;
  const how = scaleHow(S.img), st = document.getElementById("scalestat");
  st.hidden = !S.img || S.img.sample; st.className = "note" + (how === "measured" ? "" : " warn");
  st.textContent = !S.img ? "" : how === "measured" ? `Scale: ${(1 / S.img.ppf).toFixed(2)} ft per pixel, from ${(S.img.scale && S.img.scale.by) || "a set length"}.`
    : how === "assumed" ? `Scale: ${(1 / S.img.ppf).toFixed(2)} ft per pixel, from ${(S.img.scale && S.img.scale.by) || "standard stalls"}. Stall widths vary (8.5 to 10 ft), so the plan set marks this scale to verify; set it from a known length (a survey dimension or measured curb) to clear that.`
    : how === "estimated" ? `Scale estimated (${(S.img.scale && S.img.scale.by) || "no measurement"}). Check it: Set scale, then click stripe centres a few stalls apart (standard stalls are 9 ft).`
    : "No scale yet. Set scale, then click stripe centres a few stalls apart (standard stalls are 9 ft), or both ends of a known length.";
  const site = S.img && SITES.find(s => s.id === S.img.site); const sn = document.getElementById("sitenote");
  sn.hidden = !site; if (site){ sn.textContent = `Scale preset at ${(1 / S.img.ppf).toFixed(2)} ft per pixel${S.img.north ? "" : ", north up"}. ${site.credit}`; siteSel.value = site.id; }
}
function changed(){ buildItems(size()); render(); }
const pkJur = document.getElementById("pk-jur"), pkStripe = document.getElementById("pk-stripe"), pkSign = document.getElementById("pk-sign");
pkJur.innerHTML = Object.entries(JUR).map(([k, j]) => `<option value="${k}">${j.label}</option>`).join("");
pkStripe.innerHTML = Object.entries(STRIPES).map(([k, j]) => `<option value="${k}">${j.label}</option>`).join("");
pkSign.innerHTML = Object.entries(SIGNS).map(([k, j]) => `<option value="${k}">${j.label}</option>`).join("");
function syncPark(){ const P = S.park; pkJur.value = P.jur; document.getElementById("pk-aisle").value = P.aisleCol || "white"; pkStripe.value = P.stripe; pkSign.value = P.sign;
  document.getElementById("pk-w").value = P.w; document.getElementById("pk-l").value = P.l; document.getElementById("pk-stencil").value = P.stencil ? "1" : "0"; }
pkJur.onchange = e => { S.park.jur = e.target.value; render(); };
pkStripe.onchange = e => { S.park.stripe = e.target.value; render(); };
pkSign.onchange = e => { S.park.sign = e.target.value; render(); };
document.getElementById("pk-stencil").onchange = e => { S.park.stencil = e.target.value === "1"; render(); };
document.getElementById("pk-w").onchange = e => { S.park.w = Math.max(TESLA_STALL.w, Math.min(14, +e.target.value || 9)); syncPark(); render(); };
document.getElementById("pk-l").onchange = e => { S.park.l = Math.max(TESLA_STALL.l, Math.min(24, +e.target.value || 18)); syncPark(); render(); };
const pkAisle = document.getElementById("pk-aisle");
pkAisle.innerHTML = Object.entries(AISLE_COL).map(([k, j]) => `<option value="${k}">${j.label}</option>`).join("");
pkAisle.onchange = e => { S.park.aisleCol = e.target.value; render(); };
const viewC = () => [S.view.x + S.view.w/2, S.view.y + S.view.h/2];
document.getElementById("pk-posts").onclick = () => { stallsAtPosts(); render(); };
for (const k of ["van","std","amb","ev"]) document.getElementById("pk-" + k).onclick = () => { const [x, y] = viewC(); selectOnly(addStall(k, x, y, 0)); render(); };
const lsKind = document.getElementById("ls-kind");
lsKind.innerHTML = Object.entries(PLANTS).map(([k, x]) => `<option value="${k}">${x.code} ${x.label} (${x.dia}')</option>`).join("");
document.getElementById("ls-add").onclick = () => { const [x, y] = viewC(); selectOnly(addPlant(lsKind.value, x, y)); render(); };
document.getElementById("pk-signs").onclick = () => { signsAtStalls(); render(); };
document.getElementById("pk-addsign").onclick = () => { const [x, y] = viewC(); selectOnly(addSign(S.park.sign, x, y)); render(); };
document.getElementById("pk-ins").onclick = e => { const a = e.target.closest("[data-pka]"), o = selected && S.pk[selected]; if (!a || !o) return;
  const v = a.dataset.pka; if (v === "del"){ delete S.pk[o.id]; selectOnly(null); } else if (v === "flip") o.aisle = o.aisle === "L" ? "R" : "L"; else if (v === "buffer") o.buffer = !o.buffer;
  else o.rot = norm360((o.rot || 0) + +v); render(); };
document.getElementById("pk-ins").onchange = e => { const f = e.target.dataset.pkf, o = selected && S.pk[selected]; if (!f || !o) return; o[f] = f === "rot" ? norm360(+e.target.value || 0) : f === "obs" || f === "dia" ? +e.target.value : e.target.value; if (f === "plant") delete o.dia; delete o.auto; render(); };
const siteSel = document.getElementById("site");
siteSel.innerHTML = SITES.map(s => `<option value="${s.id}">${s.label}</option>`).join("");
function loadSite(site){
  if (!site) return;
  // a saved site with its own address is that project: switch to it (which sets the last address's site images aside)
  if (site.address && !sameAddr(site.address, S.address)) setAddress(site.address);
  const im = new Image(); im.onload = () => {
    const w = im.width, h = im.height, ppf = w / site.wFt;
    let sk = site.sketchSrc; if (!sk) try { sk = makeSketch(im, w, h); } catch(e){ sk = site.src; }
    if (site.pin){
      // put the address pin near the default equipment row so the layout starts on the site
      const [ax, ay] = SITE_PT;
      S.img = {src:site.src, sketchSrc:sk, w, h, ppf, x:ax - site.pin[0], y:ay - site.pin[1], sample:false, site:site.id,
        pin:[ax, ay], pinLabel:site.label.split(",")[0], scale:{how:"measured", by:"preset with the saved site"}};
      S.view = {x:ax - 180, y:ay - 128, w:360, h:255};
    } else {
      S.img = {src:site.src, sketchSrc:sk, w, h, ppf, x:site.place[0], y:site.place[1], sample:false, site:site.id, north:site.north || 0, linework:!!site.sketchSrc,
        scale:{how:"measured", by:"preset with the saved site"}};
      S.view = {...site.view};
    }
    S.sketch = false;
    if (site.mwLayout || site.svcLayout){ const svcT = ["svc","xfmr","ct","mtr"];
      Object.values(S.items).filter(i => (site.mwLayout && i.kind === "MW") || (site.svcLayout && svcT.includes(i.type))).forEach(i => { i.x = null; });
      S.routes = {}; arrange(size(), true); }
    const fo = SITE_FOLDER[site.id] || site.folder; S.folders = S.folders || {}; if (fo && !S.folders[normAddr(S.address)]) S.folders[normAddr(S.address)] = fo; syncFolder();
    syncInputs(); setMode("select");
  }; im.src = site.src;
}
document.getElementById("b-site").onclick = () => loadSite(SITES.find(s => s.id === siteSel.value));
document.getElementById("p-v4").onclick = () => { S.product = "V4"; syncInputs(); changed(); };
document.getElementById("p-mw").onclick = () => { S.product = "MW"; if (S.inputKva < 1247) S.inputKva = 1247; syncInputs(); changed(); };
document.getElementById("p-mix").onclick = () => { S.product = "MIX"; if (S.inputKva >= 1247 && S.posts > 2) S.inputKva = 499; syncInputs(); changed(); };
document.getElementById("mwposts").oninput = e => { S.mwPosts = Math.max(1, Math.min(32, parseInt(e.target.value) || 1)); changed(); };
mwSel.onchange = e => { S.mwInputKva = +e.target.value; changed(); };
document.getElementById("posts").oninput = e => { const n = Math.max(1, Math.min(64, parseInt(e.target.value) || 1)); S.posts = n; changed(); };
sel.onchange = e => { S.inputKva = +e.target.value; changed(); };
document.getElementById("opacity").oninput = e => { S.opacity = +e.target.value; render(); };
document.getElementById("b-sketch").onclick = () => { S.sketch = !S.sketch; syncInputs(); render(); };
document.getElementById("b-boll").onclick = () => { S.bollards = S.bollards === false; syncInputs(); render(); };
document.getElementById("b-arrange").onclick = () => { arrange(size(), false); fit(); render(); };
document.getElementById("b-reroute").onclick = () => { S.routes = {}; render(); };
// layout.json for the plan set generator (sites/<site>/layout.json, read by cd50-plansets/cd50.py).
// Everything is in tool feet, world frame; frame.origin_ft is the top-left of the site image (or linework).
function siteLayout(){
  const z = size(); const R = runs(z); const r3 = v => +v.toFixed(3);
  const items = [], boll = [];
  for (const it of Object.values(S.items)){
    const s = spec(it, z), c = Math.cos(it.rot * Math.PI / 180), sn = Math.sin(it.rot * Math.PI / 180);
    const tr = ([x, y]) => [r3(it.x + x*c - y*sn), r3(it.y + x*sn + y*c)];
    const rect = (x0, y0, x1, y1) => [[x0,y0],[x1,y0],[x1,y1],[x0,y1]].map(tr);
    items.push({id:it.id, type:it.type, kind:it.kind || null, cab:it.cab || null, name:s.name, shape:s.shape, x:r3(it.x), y:r3(it.y), rot:r3(it.rot),
      size_ft:[s.w, s.d], pad_ft:s.pw ? [s.pw, s.pd] : null,
      body:rect(-s.w/2, -s.d/2, s.w/2, s.d/2), pad:s.pw ? rect(-s.pw/2, -s.pd/2, s.pw/2, s.pd/2) : null,
      front_clear:s.cf ? rect(-s.w/2, s.d/2, s.w/2, s.d/2 + s.cf) : null});
    for (const b of bollards(it, s)) boll.push({item:it.id, kind:b.k, xy:tr([b.x, b.y])});
  }
  const im = S.img;
  return {format:LAYOUT_FORMAT, exported:new Date().toISOString().slice(0, 10), tool:{build:TOOL_BUILD}, project:{address:S.address || null, geo:S.geo || null},
    frame:im ? {site:im.site || null, origin_ft:[r3(im.x), r3(im.y)], size_ft:[r3(im.w / im.ppf), r3(im.h / im.ppf)], north:im.north || 0,
      scale:{how:scaleHow(im), by:(im.scale && im.scale.by) || null}} : null,
    sizing:{total_kva:z.totalKva, xfmr_kva:z.xfmr, service_amps:z.svcAmps, service_tag:z.svcTag},
    chargers:z.G.map(g => ({tag:`${g.cabPrefix}1`, kind:g.kind, posts:g.posts, kva:g.kva,
      name:`${g.kind === "MW" ? "V4 Megacharger" : "V4 Supercharger"} cabinet (${g.posts} posts)`})),
    items, bollards:boll, parking:parkingExport(r3), landscape:landscapeExport(r3),
    routes:R.map(r => { const P = pathPts(r); return {id:r.id, from:r.from, to:r.to, kind:r.kind, n:r.n, size:r.size, cond:r.cond, fn:r.fn,
      path:P.map(p => p.map(r3)), length_ft:+plen(P).toFixed(1)}; })};
}
// layout.json carries the design only (a few KB). The site images never ride inside it as data URIs, which made it 99%
// image bytes: Download puts them beside it in a zip (images/<slot>.<ext>, each with its sha256 and address stamp), Build PDF
// sends asset ids from the page's asset store (Claude fetches them before the build), and Copy leaves them out.
function dataUrlBlob(u){ const [h, b64] = u.split(","), bin = atob(b64), a = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return new Blob([a], {type:(h.match(/^data:([^;]+)/) || [])[1] || "image/png"}); }
async function sha256(blob){ try { const h = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, "0")).join(""); } catch(e){ return null; } }
const imgExt = t => ({"image/png":"png", "image/jpeg":"jpg", "image/webp":"webp", "image/gif":"gif"})[t] || "img";
const BG_ASSET = {};   // the background's uploaded asset (site image slots keep theirs on PH)
async function siteImageAssets(){
  const assets = window.claude?.use ? await window.claude.use("assets").catch(() => null) : null, out = {}, ex = imagesExport();
  if (!assets || !Object.keys(ex).length) return {out, missing:Object.keys(ex)};
  for (const [k, v] of Object.entries(ex)){
    const p = PH[k] || BG_ASSET, blob = dataUrlBlob(v.src);
    if (!(p.asset && p.asset.n === v.src.length && p.asset.head === v.src.slice(-64))){ const r = await assets.upload(blob); p.asset = {id:r.id, n:v.src.length, head:v.src.slice(-64)}; }
    const {src, ...rest} = v; out[k] = {...rest, asset_id:p.asset.id, sha256:await sha256(blob)};
  }
  savePhotos(); return {out, missing:[]};
}
// the zip: layout.json plus images/; unzip it into sites/<site>/ and cd50.py reads the images from there
async function layoutFiles(){   // [[path, Blob]]: layout.json and images/<slot>.<ext>, as the zip or a chosen folder holds them
  const ex = imagesExport(), imgs = {}, files = [];
  for (const [k, v] of Object.entries(ex)){ const blob = dataUrlBlob(v.src), file = `images/${k}.${imgExt(blob.type)}`, {src, ...rest} = v;
    files.push([file, blob]); imgs[k] = {...rest, file, sha256:await sha256(blob)}; }
  files.unshift(["layout.json", new Blob([JSON.stringify({...siteLayout(), site_images:imgs}, null, 1)], {type:"application/json"})]);
  return {files, n:Object.keys(imgs).length};
}
async function layoutZip(){
  const {files, n} = await layoutFiles(), z = new JSZip();
  for (const [f, b] of files) z.file(f, b);
  return {blob:await z.generateAsync({type:"blob"}), n};
}
// Choose save folder: with a folder chosen for this address, Download layout writes layout.json and images/ straight into it
// (File System Access API: Chrome and Edge, with the tool opened as a file). The folder handle is kept in IndexedDB per address.
const dirKey = () => "dir-" + addrKey(S.address), dirNote = document.getElementById("savedir-note");
const GENERIC_DIRS = new Set(["downloads", "desktop", "documents", "sites", "onedrive", "cd50-tool", "hion-claude"]);
let saveDir = null;
async function loadSaveDir(){ saveDir = await IDB.get(dirKey()).catch(() => null) || null; showSaveDir(); }
const DIR_NOTE = dirNote.textContent;
function showSaveDir(){ dirNote.textContent = saveDir ? `Download layout saves layout.json and its images into the folder “${saveDir.name}”. Choose again to change it.` : DIR_NOTE; }
async function writeToDir(dir){
  if (dir.queryPermission && await dir.queryPermission({mode:"readwrite"}) !== "granted" && await dir.requestPermission({mode:"readwrite"}) !== "granted") throw {name:"NotAllowedError"};
  const {files} = await layoutFiles();
  for (const [path, blob] of files){
    const parts = path.split("/"); let d = dir;
    for (const sub of parts.slice(0, -1)) d = await d.getDirectoryHandle(sub, {create:true});
    const w = await (await d.getFileHandle(parts.at(-1), {create:true})).createWritable(); await w.write(blob); await w.close();
  }
  return files.length;
}
document.getElementById("b-savedir").onclick = async () => {
  if (!window.showDirectoryPicker){ dirNote.textContent = "This browser cannot pick a folder. Use Chrome or Edge with the tool opened as a file, or set your browser to ask where to save each download."; return; }
  try {
    const h = await window.showDirectoryPicker({id:"cd50-site", mode:"readwrite", startIn:"documents"});
    saveDir = h; await IDB.put(dirKey(), h).catch(() => {});
    const f = cleanFolder(h.name);
    if (f && !GENERIC_DIRS.has(f)){ pdfSite.value = f; pdfSite.dispatchEvent(new Event("input")); }   // the folder's name is the site folder
    showSaveDir();
  } catch(err){
    if (err?.name === "AbortError") return;
    dirNote.textContent = err?.name === "SecurityError"
      ? "The claude.ai viewer does not let pages pick folders. Open the tool as a file in Chrome or Edge to save into a folder, or set your browser to ask where to save each download."
      : `Could not use that folder (${err?.message || err?.name || "error"}).`;
  }
};
const copyText = () => { const ex = imagesExport(), imgs = {};
  for (const [k, v] of Object.entries(ex)){ const {src, ...rest} = v; imgs[k] = {...rest, omitted:"use Download layout for the image files"}; }
  return JSON.stringify({...siteLayout(), site_images:imgs}, null, 1); };
document.getElementById("b-copy").onclick = async (e) => {
  try { await navigator.clipboard.writeText(copyText()); e.target.textContent = Object.keys(imagesExport()).length ? "Copied (without images)" : "Copied"; } catch(err){ e.target.textContent = "Copy blocked"; }
  setTimeout(() => e.target.textContent = "Copy layout.json", 1600);
};
// In the claude.ai viewer, saves go through the downloads capability; opened as a local file, a plain link works.
// With site images it saves <site>-layout.zip (layout.json + images/), without them a plain layout.json.
document.getElementById("b-dl").onclick = async (e) => {
  const label = e.target.textContent, ex = Object.keys(imagesExport()).length;
  if (saveDir){   // a chosen folder: write straight into it; if that fails, fall back to a normal download
    try { const n = await writeToDir(saveDir); e.target.textContent = `Saved ${n} file${n > 1 ? "s" : ""} to ${saveDir.name}`; setTimeout(() => e.target.textContent = label, 2400); return; }
    catch(err){ dirNote.textContent = `Could not write to “${saveDir.name}” (${err?.name || "error"}), so the layout was downloaded instead. Choose the folder again.`; }
  }
  let file;
  try { file = ex ? {filename:`${pdfFolder() || "site"}-layout.zip`, data:(await layoutZip()).blob} : {filename:"layout.json", data:copyText()}; }
  catch(err){ e.target.textContent = "Could not pack the images"; setTimeout(() => e.target.textContent = label, 2400); return; }
  const dl = window.claude?.use ? await window.claude.use("downloads").catch(() => null) : null;
  if (dl) {
    try { await dl.save(file); }
    catch(err){ if (err?.code !== "declined") { e.target.textContent = "Download blocked, use Copy"; setTimeout(() => e.target.textContent = label, 2400); } }
    return;
  }
  const blob = typeof file.data === "string" ? new Blob([file.data], {type:"application/json"}) : file.data;
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = file.filename;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};
// Build PDF: in the claude.ai viewer, fire Tony's "Build PDF" scheduled task through the Claude Code Remote connector,
// which wakes the CD50 Claude session with this layout. Opened as a local file, save layout.json and copy a Claude Code prompt.
const BUILD_TRIGGER = "trig_01SUGXsC5acu3krHpFg7uN6A";
// Each build gets an id and a status doc builds/<id> in the page's db: {status: requested|working|ready|failed, site, address,
// msg, pdf, at}. Claude moves it along and the page shows it, so a failed build is not mistaken for a slow one. While a build
// of a site is open the button does not send that site again (no duplicate _rN), unless it has had no answer for BUILD_STALE_MIN.
const BUILD_STALE_MIN = 30, OPEN_BUILD = new Set(["requested", "working"]);
const hhmm = t => new Date(t || Date.now()).toLocaleTimeString([], {hour:"numeric", minute:"2-digit"});
let buildDbP = null, buildWatch = null;
const buildDb = () => buildDbP || (buildDbP = window.claude?.use ? window.claude.use("db").catch(() => null) : Promise.resolve(null));
const buildStale = d => Date.now() - (+d.at || 0) > BUILD_STALE_MIN * 60000;
async function openBuild(db, site){
  try { const q = await db.collection("builds").where("site", "==", site).get();
    for (const doc of q.docs){ const d = doc.data() || {};
      if (!OPEN_BUILD.has(d.status)) continue;
      if (buildStale(d)){ db.doc("builds/" + doc.id).update({status:"failed", msg:`no answer from Claude after ${BUILD_STALE_MIN} minutes`}).catch(() => {}); continue; }
      return {id:doc.id, d}; } }
  catch(e){}
  return null;
}
function watchBuild(db, id){
  if (buildWatch) buildWatch();
  const stop = () => { if (buildWatch) buildWatch(); buildWatch = null; if (S.build && S.build.id === id){ delete S.build; save(); } };
  buildWatch = db.doc("builds/" + id).onSnapshot(snap => {
    const d = snap.exists ? snap.data() : null; if (!d) return;
    if (d.status === "ready"){ stop(); pdfStatus.textContent = `PDF ready for ${d.site}: ${d.pdf || "posted in your CD50 project"}.` + (d.msg ? ` ${d.msg}` : ""); }
    else if (d.status === "failed"){ stop(); pdfStatus.textContent = `Claude could not build ${d.site}: ${d.msg || "no reason given"}. Fix that and press Build PDF again, or use Download layout.`; }
    else if (buildStale(d)){ stop(); pdfStatus.textContent = `No answer from Claude on ${d.site} since ${hhmm(d.at)}. Press Build PDF to send it again, or use Download layout.`; }
    else pdfStatus.textContent = `Claude is building ${d.site} (sent ${hhmm(d.at)}): ${d.msg || d.status}…`;
  }, () => {});
}
// pick up a build that was still open when the page was closed
if (S.build) buildDb().then(db => { if (db && S.build) watchBuild(db, S.build.id); });
// Aerials Claude fetched for the removed Find aerial step are in the page db as aerials/<site>; ready ones are listed under
// Saved site imagery (Load site switches to their address). Read only: nothing waits on a request any more, so a doc left
// in requested or working by a session that died is simply not listed.
buildDb().then(async db => { if (!db) return;
  try { const q = await db.collection("aerials").get();
    q.docs.forEach(doc => { const d = doc.data() || {};
      if (d.status !== "ready" || !d.asset_id || !(d.wFt > 0) || !Array.isArray(d.pin)) return;
      const site = {id:"addr-" + doc.id, folder:doc.id, label:d.label || d.address || doc.id, wFt:d.wFt, hFt:d.hFt, pin:d.pin, address:d.address || null,
        credit:d.credit || "", src:"/_blob/" + d.asset_id};
      if (SITES.some(s => s.id === site.id)) return;
      SITES.push(site); siteSel.add(new Option(site.label, site.id)); });
  } catch(e){} });
const SITE_FOLDER = {"san-ysidro-299e":"san-ysidro-r6", "san-ysidro-299e-sketch":"san-ysidro-r6"};
const pdfSite = document.getElementById("pdf-site"), pdfStatus = document.getElementById("pdf-status");
// Site folder: sites/<folder> in the CD50-Tool repo, where Claude saves layout.json and site.json and builds the PDF.
// It is remembered per address (S.folders); a new address starts from its slug (siteSlug), a saved site from its own folder.
const pdfWhere = document.getElementById("pdf-where");
const cleanFolder = v => String(v || "").trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
const autoFolder = () => SITE_FOLDER[S.img?.site] || (SITES.find(s => s.id === S.img?.site) || {}).folder || siteSlug(S.address);
const pdfFolder = () => cleanFolder(pdfSite.value) || autoFolder() || "";
function showWhere(){ const f = pdfFolder();
  pdfWhere.textContent = f ? `Claude saves this layout to sites/${f}/ in the CD50-Tool repo (with a starter site.json for a new site) and the PDF to your CD50 project files as cd50-plansets/${f}_CD50_<date>_rN.pdf, never overwriting an earlier revision.` : "Enter the project address first."; }
function syncFolder(){ S.folders = S.folders || {}; pdfSite.value = S.folders[normAddr(S.address)] || autoFolder() || ""; showWhere(); }
pdfSite.addEventListener("input", () => { S.folders = S.folders || {}; const k = normAddr(S.address), f = cleanFolder(pdfSite.value);
  if (f) S.folders[k] = f; else delete S.folders[k]; save(); showWhere(); });
pdfSite.addEventListener("change", () => { pdfSite.value = pdfFolder(); showWhere(); });
document.getElementById("b-pdf").onclick = async (e) => {
  const site = pdfFolder();
  if (!site){ pdfStatus.textContent = "Enter the site folder name first (the folder under sites/ in the repo)."; pdfSite.focus(); return; }
  const notes = document.getElementById("pdf-notes").value.trim();
  const mcp = window.claude?.use ? await window.claude.use("mcp").catch(() => null) : null;
  e.target.disabled = true;
  if (mcp){
    pdfStatus.textContent = "Sending to Claude…";
    const db = await buildDb();
    const open = db ? await openBuild(db, site) : null;
    if (open){
      pdfStatus.textContent = `A build of ${site} is already with Claude (sent ${hhmm(open.d.at)}, ${open.d.msg || open.d.status}). This button sends again once it finishes, or after ${BUILD_STALE_MIN} minutes without an answer.`;
      watchBuild(db, open.id); e.target.disabled = false; return;
    }
    const id = `${site}-${Date.now().toString(36)}`.slice(0, 120);
    try {
      let imgs = {out:{}, missing:[]};
      try { imgs = await siteImageAssets(); } catch(err){ imgs.missing = Object.keys(imagesExport()); }
      if (db) try { await db.doc("builds/" + id).set({status:"requested", site, address:S.address || null, msg:"Waiting for Claude", at:Date.now()}); } catch(err){}
      await mcp.callTool("Claude Code Remote", "fire_trigger", {trigger_id: BUILD_TRIGGER, text: JSON.stringify({build_id: db ? id : null, site, notes, layout: {...siteLayout(), site_images:imgs.out}})}, {cache:false});
      pdfStatus.textContent = `Sent ${site} to Claude at ${hhmm(Date.now())}.` + (db ? " Its progress shows here; the PDF is usually ready within 10 minutes." : " The PDF is usually posted in your CD50 project within 10 minutes.")
        + (imgs.missing.length ? ` The site images (${imgs.missing.join(", ")}) could not be attached, so their sheets will be left out; use Download layout for those.` : "");
      if (db){ S.build = {id, site, at:Date.now()}; save(); watchBuild(db, id); }
    } catch(err){
      if (db) db.doc("builds/" + id).update({status:"failed", msg:"not sent"}).catch(() => {});
      pdfStatus.textContent = err?.code === "server_not_connected" ? "Connect Claude Code in claude.ai Settings → Connectors, then try again."
        : err?.code === "declined" || err?.code === "not_granted" ? "Not sent. Allow the Claude Code Remote connector for this page to use the button."
        : `Not sent (${err?.message || err?.code || "error"}). Use Download layout and send it to Claude instead.`;
    }
    e.target.disabled = false; return;
  }
  document.getElementById("b-dl").click();
  const zip = Object.keys(imagesExport()).length, what = zip ? `${site}-layout.zip` : "layout.json";
  const prompt = `Build the CD50 PDF for sites/${site} from the ${what} in my Downloads folder: ${zip ? `unzip it into sites/${site}/ (layout.json and images/)` : `copy it to sites/${site}/layout.json`}, then run cd50.py and pdf.cjs.` + (notes ? ` Notes: ${notes}` : "");
  try { await navigator.clipboard.writeText(prompt); pdfStatus.textContent = `Saved ${what} and copied a prompt. Paste it into Claude Code in your CD50-Tool folder.`; }
  catch(err){ pdfStatus.textContent = `Saved ${what}. In Claude Code, ask: ` + prompt; }
  e.target.disabled = false;
};
document.getElementById("inspector").onclick = e => {
  const g = e.target.closest("[data-grot],[data-gact]");
  if (g){ if (g.dataset.gact === "clear") selectOnly(null); else rotateSel(+g.dataset.grot); render(); return; }
  if (!selected) return; const it = S.items[selected]; if (!it) return;
  const b = e.target.closest("[data-rot]"); if (b){ it.rot = norm360(it.rot + +b.dataset.rot); render(); return; }
  const a = e.target.closest("[data-bact]"); if (!a) return; const act = a.dataset.bact;
  if (act === "reset"){ delete it.bl; selBoll = null; }
  else if (selBoll && selBoll.id === it.id){ const B = customBollards(it, size());
    if (act === "delete"){ B.splice(selBoll.i, 1); selBoll = null; } else if (B[selBoll.i]) B[selBoll.i].k = act; }
  render();
};
document.getElementById("inspector").onchange = e => {
  if (e.target.id === "grotdeg"){ rotateSel(+e.target.value || 0); render(); return; }
  if (e.target.id === "rotdeg" && S.items[selected]){ S.items[selected].rot = norm360(+e.target.value || 0); render(); return; }
  if (e.target.id !== "bcount" || !selected) return; const it = S.items[selected]; if (!RING[it.type]) return;
  const n = Math.max(0, Math.min(40, parseInt(e.target.value) || 0)); it.bl = bollardRingN(it, spec(it, size()), n); selBoll = null; render();
};

document.getElementById("file").onchange = e => loadImageFile(e.target.files[0]);
document.addEventListener("paste", e => {
  if (document.body.classList.contains("sk")) return;   // Aerial Site Sketch is open
  const items = [...(e.clipboardData?.items || [])], it = items.find(i => i.type.startsWith("image/")), tx = items.find(i => i.type === "text/plain");
  if (!it) return;
  e.preventDefault(); const f = it.getAsFile();
  // Aerial Site Sketch copies its PNG with a small JSON note (scale, north) beside it when it cannot message this page
  if (tx) tx.getAsString(t => { let m = null; try { m = JSON.parse(t); } catch(x){}
    if (m && m.type === "cd50-sketch-meta"){ const rd = new FileReader(); rd.onload = () => loadSketchResult({...m, png:rd.result}, "pasted"); rd.readAsDataURL(f); }
    else loadImageFile(f); });
  else loadImageFile(f);
});
function loadImageFile(f) {
  if (!f) return; const rd = new FileReader();
  rd.onload = () => { const im = new Image(); im.onload = () => {
    const k = Math.min(1, 1800 / Math.max(im.width, im.height)); const w = Math.round(im.width * k), h = Math.round(im.height * k);
    const c = document.createElement("canvas"); c.width = w; c.height = h; c.getContext("2d").drawImage(im, 0, 0, w, h);
    const src = c.toDataURL("image/jpeg", 0.88);
    S.img = {src, sketchSrc:makeSketch(im, w, h), w, h, ppf:w / 140, x:0, y:0, sample:false, scale:{how:"unscaled", by:"loaded image"}};
    S.sketch = true; syncInputs(); fit(); render(); setMode("crop");
  }; im.src = rd.result; }; rd.readAsDataURL(f);
}

// Sketch view shows the Aerial sketch result from the Site images slot when there is one, else the traced linework of the
// current image. A sketch sent from Aerial Site Sketch carries its scale and is centred on the site point (60, 50 ft) like the
// aerials; one uploaded by hand is fitted to the width of the current image. Check its fit before placing equipment on it.
function sketchLayer(){
  let v; try { v = PH.sketch; } catch(e){ return null; }
  if (!v || !v.src || !S.img) return null;
  if (S.img.fromSketch && v.bg) return null;   // the sketch is already the background
  if (!v.w){ if (!sketchLayer.busy){ sketchLayer.busy = true; const im = new Image();
      im.onload = () => { sketchLayer.busy = false; if (PH.sketch === v){ v.w = im.naturalWidth; v.h = im.naturalHeight; savePhotos(); render(); } }; im.src = v.src; }
    return null; }
  const I = S.img, iw = I.w / I.ppf, ih = I.h / I.ppf, ppf = v.ppf > 0 ? v.ppf : v.w / iw, W = v.w / ppf, H = v.h / ppf;
  const [cx, cy] = v.ppf > 0 ? SITE_PT : [I.x + iw / 2, I.y + ih / 2];
  return {href:v.src, x:cx - W / 2, y:cy - H / 2, width:W, height:H};
}

// ---------- Aerial Site Sketch result back in the layout area: sent by the sketch window (postMessage to the window that
// opened it) or pasted with its scale note. Loads as the plan background at the sketch's scale, and fills the sketch slot.
// A sketch traced for another address (the address changed while it was tracing, or it came from another site) is held
// back with a "Load it anyway" button, so another site's linework never becomes this site's background by accident.
function loadSketchResult(raw, how, force){
  const note = document.getElementById("photonote");
  let d; try { d = CD50.sketchResult(raw); } catch(e){ note.textContent = e.message; return false; }
  if (!force && !sameAddr(d.address, S.address)){
    note.replaceChildren(`This sketch was traced for ${d.address}, but the project address is ${S.address}, so it was not loaded. `);
    const b = document.createElement("button"); b.type = "button"; b.textContent = "Load it anyway";
    b.onclick = () => loadSketchResult(raw, how, true); note.appendChild(b);
    return false;
  }
  const im = new Image(); im.onload = () => {
    const k = Math.min(1, 1800 / Math.max(im.width, im.height)), w = Math.round(im.width * k), h = Math.round(im.height * k);
    const c = document.createElement("canvas"); c.width = w; c.height = h; const x = c.getContext("2d");
    x.fillStyle = "#fff"; x.fillRect(0, 0, w, h); x.drawImage(im, 0, 0, w, h);
    const src = c.toDataURL("image/png"), ppf = d.ppf ? d.ppf * k : w / 140, [ax, ay] = SITE_PT;
    S.img = {src, sketchSrc:src, w, h, ppf, x:ax - w / 2 / ppf, y:ay - h / 2 / ppf, sample:false, site:null, linework:true, north:d.north, fromSketch:true,
      scale:{how:d.scale, by:d.scale === "unscaled" ? "Aerial Site Sketch, not to scale" : `Aerial Site Sketch: ${d.scaleSource || "its scale"}`}};
    S.sketch = false; syncInputs(); fit(); render(); setMode(d.ppf ? "select" : "scale");
    PH.sketch = {name:d.name, src: src.length > 1500000 ? c.toDataURL("image/jpeg", 0.86) : src, w, h, ...(d.ppf ? {ppf} : {}), north:d.north, bg:true, addr:S.address || null,
      placement:d.ppf ? "sent at its scale" : "sent without a scale"}; savePhotos(); drawPhotos();
    document.getElementById("photonote").textContent = `Aerial Site Sketch ${how} into the layout area${d.ppf ? `, at its scale (${(1 / ppf).toFixed(2)} ft per pixel${d.scale === "estimated" ? ", estimated from 9 ft stalls" : ""})` : "; it had no scale, so set one with Set scale"}. Place equipment on it.`;
    try { document.getElementById("plan").scrollIntoView({block:"center"}); } catch(e){}
  }; im.src = d.png;
  return true;
}
// the standalone Aerial Site Sketch artifact can still send its result by message, but only from a claude.ai page (or a
// page opened as a local file), and only a valid sketch result (CD50.sketchResult) is loaded
window.addEventListener("message", e => {
  const d = e.data; if (!d || d.type !== "cd50-sketch" || e.source === window) return;
  // "null" is a page opened as a local file; accepted only when this page is a local file too
  if (!/^https:\/\/([a-z0-9-]+\.)*(claude\.ai|claudeusercontent\.com)$/.test(e.origin) && !(e.origin === "null" && location.protocol === "file:")) return;
  if (loadSketchResult(d, "came back")) try { e.source && e.source.postMessage({type:"cd50-sketch-ack"}, "*"); } catch(x){}
});


// ---------- site images: vicinity (wide), lot (with the install area boxed), and the Aerial Site Sketch result
// They belong to one project address: PH holds the current address's images (each stamped with addr), PHS keeps other
// addresses' images aside (names and IndexedDB keys only) until that address is entered again. So a lot photo from the last
// site never goes out with the next site's layout. Kept under their own localStorage key so a full store never stops the
// layout itself from saving; the image data goes to IndexedDB (keepImage), localStorage keeps the names, boxes and scale notes.
let PH = {}, PHS = {};
(() => { let raw = null; try { raw = JSON.parse(localStorage.getItem("cd50photos") || "null"); } catch(e){}
  if (raw && raw.v === 2){ PHS = raw.sites || {}; const k = addrKey(S.address); PH = PHS[k] || {}; delete PHS[k]; }
  else if (raw && typeof raw === "object"){ PH = raw; for (const v of Object.values(PH)) if (v && !v.addr) v.addr = S.address || null; }   // saved before v2
})();
const phKey = (k, v) => `ph-${addrKey(v && v.addr)}-${k}`;
const idbOf = src => typeof src === "string" && src.startsWith("idb:") ? src.slice(4) : null;
const phStore = set => { const o = {}; for (const [k, v] of Object.entries(set || {})) if (v) o[k] = {...v, src:keepImage(phKey(k, v), v.src)}; return o; };
function savePhotos(){
  const sites = {}; for (const [a, set] of Object.entries(PHS)) sites[a] = phStore(set);
  sites[addrKey(S.address)] = phStore(PH);
  try { localStorage.setItem("cd50photos", JSON.stringify({v:2, sites})); return true; }
  catch(e){ storeWarn("site images", e); return false; } }
function dropPhoto(k){ const v = PH[k]; delete PH[k]; if (!v) return;
  for (const key of [phKey(k, v), idbOf(v.src)]) if (key){ delete kept[key]; IDB.del(key).catch(() => {}); } }
// put the current address's images back from IndexedDB; true when one was missing
async function restorePhotos(){ const P = PH; let lost = false;
  for (const [k, v] of Object.entries(P)){ const key = idbOf(v?.src); if (!key) continue;
    const d = await IDB.get(key).catch(() => null); if (d){ kept[key] = d; v.src = d; } else { delete P[k]; lost = true; } }
  return lost; }
function switchPhotos(old, a){
  if (!old){ for (const v of Object.values(PH)) if (v && !v.addr) v.addr = a; savePhotos(); return; }
  const n = Object.keys(PH).length;
  if (n) PHS[addrKey(old)] = phStore(PH);
  const k = addrKey(a); PH = PHS[k] || {}; delete PHS[k];
  savePhotos(); drawPhotos();
  restorePhotos().then(lost => { if (lost) storeWarn("saved images", {name:"not found"}); drawPhotos(); render(); });
  const back = Object.keys(PH).length;
  document.getElementById("photonote").textContent = (n ? `The ${n} site image${n > 1 ? "s" : ""} for ${old} were set aside; they come back if you enter that address again. ` : "")
    + (back ? `Loaded the ${back} site image${back > 1 ? "s" : ""} saved for this address.` : "");
}
const photoIn = document.getElementById("photofile"), boxDlg = document.getElementById("boxdlg"), boxCv = document.getElementById("boxcv");
let photoSlot = null;
// only images stamped with this project's address go out; each carries that stamp so the plan set generator can check it
// the plan background (it fills layout.frame) goes out as the "background" slot, so cd50.py draws it on the plan sheets
function bgExport(){ const im = S.img;
  return im && !im.sample && /^data:image\//.test(im.src || "") ? {background:{name:im.site || (im.fromSketch ? "aerial sketch" : "plan background"), address:S.address || null, src:im.src}} : {}; }
const imagesExport = () => ({...photosExport(), ...bgExport()});
function photosExport(){ const o = {};
  for (const [k, v] of Object.entries(PH)) if (v && v.src && sameAddr(v.addr, S.address)) o[k] = {name:v.name || null, address:v.addr || S.address || null, src:v.src,
    ...(v.box ? {install_box:v.box.map(n => +n.toFixed(4)), box_units:"fraction of image width/height, [x0,y0,x1,y1] from top left"} : {})};
  return o; }
function drawPhotos(){
  document.querySelectorAll(".photo").forEach(el => {
    const k = el.dataset.slot, v = PH[k], pv = el.querySelector(".pv"), acts = el.querySelector(".acts");
    pv.replaceChildren(); acts.replaceChildren();
    if (!v){ pv.textContent = k === "sketch" ? "Upload the sketch PNG" : "Upload or drop"; return; }
    const im = new Image(); im.src = v.src; im.alt = ""; pv.appendChild(im);
    if (v.box) im.onload = () => { // place the box over the contained image
      const r = pv.getBoundingClientRect(), s = Math.min(r.width / im.naturalWidth, r.height / im.naturalHeight), w = im.naturalWidth * s, h = im.naturalHeight * s, ox = (r.width - w) / 2, oy = (r.height - h) / 2;
      const d = document.createElement("div"); d.className = "hl"; const [x0, y0, x1, y1] = v.box;
      Object.assign(d.style, {left:`${ox + x0 * w}px`, top:`${oy + y0 * h}px`, width:`${(x1 - x0) * w}px`, height:`${(y1 - y0) * h}px`}); pv.appendChild(d); };
    const btn = (t, f) => { const b = document.createElement("button"); b.type = "button"; b.textContent = t; b.onclick = f; acts.appendChild(b); };
    if (k === "lot") btn(v.box ? "Edit box" : "Box the install area", () => openBox());
    btn("Replace", () => pickPhoto(k));
    btn("Remove", () => { dropPhoto(k); savePhotos(); drawPhotos(); if (k === "sketch") render(); });
  });
}
function pickPhoto(k){ photoSlot = k; photoIn.value = ""; photoIn.click(); }
function takePhoto(k, f){
  if (!f || !f.type.startsWith("image/")) return;
  const rd = new FileReader(); rd.onload = () => { const im = new Image(); im.onload = () => {
    const sc = Math.min(1, 1800 / Math.max(im.width, im.height)), c = document.createElement("canvas"); c.width = Math.round(im.width * sc); c.height = Math.round(im.height * sc);
    c.getContext("2d").drawImage(im, 0, 0, c.width, c.height);
    let src = c.toDataURL(k === "sketch" ? "image/png" : "image/jpeg", 0.86);
    if (src.length > 1500000) src = c.toDataURL("image/jpeg", 0.86);   // a photo-like sketch PNG is too big to keep
    PH[k] = {name:f.name, src, w:c.width, h:c.height, addr:S.address || null}; savePhotos(); drawPhotos();
    if (k === "sketch"){ S.sketch = true; syncInputs(); render(); }   // Sketch view shows it
    if (k === "lot") openBox();
  }; im.src = rd.result; }; rd.readAsDataURL(f);
}
photoIn.onchange = e => photoSlot && takePhoto(photoSlot, e.target.files[0]);
document.querySelectorAll(".photo").forEach(el => {
  const k = el.dataset.slot, pv = el.querySelector(".pv");
  pv.onclick = () => (k === "lot" && PH.lot) ? openBox() : pickPhoto(k);
  pv.onkeydown = e => { if (e.key === "Enter" || e.key === " "){ e.preventDefault(); pv.onclick(); } };
  pv.ondragover = e => e.preventDefault();
  pv.ondrop = e => { e.preventDefault(); takePhoto(k, e.dataTransfer.files[0]); };
});
// the install-area box is drawn in a large dialog on the lot image
let boxImg = null, boxDraft = null, boxDrag = null;
function openBox(){ const v = PH.lot; if (!v) return; boxImg = new Image(); boxImg.onload = () => { boxCv.width = boxImg.naturalWidth; boxCv.height = boxImg.naturalHeight; boxDraft = v.box ? v.box.slice() : null; drawBox(); boxDlg.showModal(); }; boxImg.src = v.src; }
function drawBox(){ const x = boxCv.getContext("2d"), W = boxCv.width, H = boxCv.height; x.drawImage(boxImg, 0, 0);
  if (boxDraft){ const [x0, y0, x1, y1] = boxDraft; x.fillStyle = "rgba(179,38,30,.14)"; x.fillRect(x0*W, y0*H, (x1-x0)*W, (y1-y0)*H);
    x.lineWidth = Math.max(3, W / 300); x.strokeStyle = "#b3261e"; x.strokeRect(x0*W, y0*H, (x1-x0)*W, (y1-y0)*H); } }
const boxPt = e => { const r = boxCv.getBoundingClientRect(); return [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))]; };
boxCv.onpointerdown = e => { boxCv.setPointerCapture(e.pointerId); boxDrag = boxPt(e); };
boxCv.onpointermove = e => { if (!boxDrag) return; const p = boxPt(e); boxDraft = [Math.min(boxDrag[0], p[0]), Math.min(boxDrag[1], p[1]), Math.max(boxDrag[0], p[0]), Math.max(boxDrag[1], p[1])]; drawBox(); };
boxCv.onpointerup = () => { boxDrag = null; if (boxDraft && (boxDraft[2] - boxDraft[0] < 0.01 || boxDraft[3] - boxDraft[1] < 0.01)) boxDraft = null; drawBox(); };
document.getElementById("box-clear").onclick = () => { boxDraft = null; drawBox(); };
document.getElementById("box-done").onclick = () => { PH.lot.box = boxDraft; savePhotos(); boxDlg.close(); drawPhotos(); };
drawPhotos();
// Aerial Site Sketch is a second view of this page (its script is at the end). Step 0 switches to it with the address;
// its Send to the layout fires CD50.SKETCH (bridge.js), which loads the PNG here at its scale and switches back.
const skAuto = document.getElementById("sk-auto");
skAuto.checked = S.sketchAuto !== false; skAuto.onchange = () => { S.sketchAuto = skAuto.checked; save(); };
const skView = document.getElementById("sketchview");
function showSketch(on){
  document.body.classList.toggle("sk", on); skView.hidden = !on; window.scrollTo(0, 0);
  if (!on) render();
}
function openSketch(a){ showSketch(true); if (a) CD50.send(CD50.ADDRESS, a); }
CD50.on(CD50.LAYOUT, () => showSketch(false));
CD50.on(CD50.SKETCH, d => { showSketch(false); loadSketchResult(d, "came back"); });
document.getElementById("b-sketchapp").onclick = () => { const a = commitAddress() || S.address; if (a) S.sketchFor = a; openSketch(a); };

// ---------- Google Earth Pro import: a saved image plus a KML/KMZ placemark (and ideally a path) from the same view.
// The placemark is the pin. A path gives the exact scale from two clicks; without one, the scale is estimated from the
// placemark's saved view (LookAt range, Google Earth's ~60 degree horizontal field of view) and should be checked with Set scale.
const geIn = document.getElementById("gefile"), geNote = document.getElementById("genote");
let gePend = {};
const geSay = t => { geNote.hidden = !t; geNote.textContent = t || ""; };
// Files can come in one pick, one at a time or dropped on the plan. An image loads straight away; a KML/KMZ then scales
// and pins it (or the last Earth image, if it came first), with no clicks needed.
async function geFiles(files){
  for (const f of files){
    if (/\.(kmz|kml)$/i.test(f.name)) try { gePend.kml = parseKml(await readKmlText(f)); gePend.kmlName = f.name; } catch(err){ geSay(`Could not read ${f.name}: ${err.message}`); return; }
    else if (f.type.startsWith("image/")) gePend.img = f;
  }
  const {img, kml} = gePend;
  if (img && kml){ gePend = {}; return geImport(img, kml).catch(err => geSay(`Google Earth import failed: ${err.message}`)); }
  if (img){ gePend = {img}; await geImport(img, null).catch(err => geSay(`Google Earth import failed: ${err.message}`)); return; }
  if (kml) geSay(`${gePend.kmlName} read. Now pick or drop the image saved from the same view in Google Earth.`);
}
geIn.onchange = e => { const fs = [...e.target.files]; geIn.value = ""; geFiles(fs); };
const planEl = document.getElementById("plan");
planEl.addEventListener("dragover", e => e.preventDefault());
planEl.addEventListener("drop", e => { e.preventDefault(); const fs = [...(e.dataTransfer?.files || [])]; if (!fs.length) return;
  if (fs.some(f => /\.(kmz|kml)$/i.test(f.name)) || gePend.kml) geFiles(fs); else loadImageFile(fs.find(f => f.type.startsWith("image/"))); });
document.getElementById("b-gecal").onclick = () => { const g = S.img && S.img.ge; if (!g || !g.cal) return; scalePts = []; setMode("gecal"); render();
  geSay(`Click the first point of the path "${g.cal.name || "path"}" on the image, then its last point (the dashed line shows where the KML puts it). Esc cancels.`); };
async function readKmlText(f){
  const b = new Uint8Array(await f.arrayBuffer());
  if (!(b[0] === 0x50 && b[1] === 0x4b)) return new TextDecoder().decode(b);
  // KMZ is a zip: find the first .kml entry through the central directory and inflate it
  const dv = new DataView(b.buffer); let eocd = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50){ eocd = i; break; }
  if (eocd < 0) throw new Error("not a valid KMZ");
  let p = dv.getUint32(eocd + 16, true); const n = dv.getUint16(eocd + 10, true);
  for (let k = 0; k < n; k++){
    const meth = dv.getUint16(p + 10, true), csz = dv.getUint32(p + 20, true), nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
    const name = new TextDecoder().decode(b.subarray(p + 46, p + 46 + nl)); p += 46 + nl + xl + cl;
    if (!/\.kml$/i.test(name)) continue;
    const start = off + 30 + dv.getUint16(off + 26, true) + dv.getUint16(off + 28, true), data = b.subarray(start, start + csz);
    if (meth === 0) return new TextDecoder().decode(data);
    const out = await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).arrayBuffer();
    return new TextDecoder().decode(out);
  }
  throw new Error("no .kml inside the KMZ");
}
function parseKml(text){
  const doc = new DOMParser().parseFromString(text, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) throw new Error("not valid KML");
  const coords = el => (el && el.textContent || "").trim().split(/\s+/).map(t => t.split(",").map(Number)).filter(c => c.length >= 2 && isFinite(c[0]) && isFinite(c[1])).map(c => [c[0], c[1]]);
  const num = (n, tag) => { const e = n.getElementsByTagName(tag)[0]; return e ? parseFloat(e.textContent) : null; };
  const out = {points:[], shapes:[], look:null};
  for (const pm of doc.getElementsByTagName("Placemark")){
    const name = (pm.getElementsByTagName("name")[0]?.textContent || "").trim();
    for (const pt of pm.getElementsByTagName("Point")){ const c = coords(pt.getElementsByTagName("coordinates")[0]); if (c[0]) out.points.push({name, ll:c[0]}); }
    for (const ls of pm.getElementsByTagName("LineString")){ const c = coords(ls.getElementsByTagName("coordinates")[0]); if (c.length >= 2) out.shapes.push({name, ll:c, closed:false}); }
    for (const pg of pm.getElementsByTagName("Polygon")){ const r = pg.getElementsByTagName("outerBoundaryIs")[0] || pg; const c = coords(r.getElementsByTagName("coordinates")[0]); if (c.length >= 3) out.shapes.push({name, ll:c, closed:true}); }
  }
  const la = doc.getElementsByTagName("LookAt")[0];
  if (la) out.look = {lon:num(la, "longitude"), lat:num(la, "latitude"), range:num(la, "range"), heading:num(la, "heading") || 0, tilt:num(la, "tilt") || 0};
  if (!out.points.length && !out.shapes.length && !out.look) throw new Error("no placemark, path or saved view in it");
  return out;
}
// local east/north feet around (lon0, lat0); plenty for a 1,000 ft site
function enFt(lon0, lat0){ const f = lat0 * Math.PI / 180, mLat = 111132.92 - 559.82 * Math.cos(2*f) + 1.175 * Math.cos(4*f), mLon = 111412.84 * Math.cos(f) - 93.5 * Math.cos(3*f);
  return ([lon, lat]) => [(lon - lon0) * mLon / FTUS, (lat - lat0) * mLat / FTUS]; }
async function geImport(file, kml){
  const im = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("image did not load")); i.src = r.result; }; r.readAsDataURL(file); });
  const k = Math.min(1, 2400 / Math.max(im.width, im.height)), w = Math.round(im.width * k), h = Math.round(im.height * k);
  const c = document.createElement("canvas"); c.width = w; c.height = h; c.getContext("2d").drawImage(im, 0, 0, w, h);
  const gb = document.getElementById("b-gecal"); gb.hidden = true;
  if (!kml){   // image alone: show it now, scale and pin come with the KMZ
    S.img = {src:c.toDataURL("image/jpeg", 0.9), sketchSrc:makeSketch(im, w, h), w, h, ppf:w / 300, x:60 - 150, y:50 - h / w * 150, sample:false, site:null, geFile:true, scale:{how:"unscaled", by:"Google Earth image without its KMZ"}};
    S.sketch = false; syncInputs(); fit(); render(); setMode("select");
    geSay("Google Earth image loaded at a rough scale. Pick or drop the KMZ/KML saved from the same view to scale and pin it automatically, or use Set scale.");
    return;
  }
  const pin = kml.points[0], o = pin ? pin.ll : kml.look ? [kml.look.lon, kml.look.lat] : kml.shapes[0].ll[0], P = enFt(o[0], o[1]);
  const [ax, ay] = SITE_PT, toTool = q => { const [e, n] = P(q); return [+(ax + e).toFixed(2), +(ay - n).toFixed(2)]; };
  const shapes = kml.shapes.map(sh => ({name:sh.name, closed:sh.closed, pts:sh.ll.map(toTool)}));
  const cal = shapes.find(sh => !sh.closed) || shapes[0] || null;
  const warn = [];
  if (kml.look && Math.abs(kml.look.tilt) > 3) warn.push(`the saved view is tilted ${kml.look.tilt.toFixed(0)}° (press U in Earth for straight down)`);
  if (kml.look && Math.abs(((kml.look.heading + 540) % 360) - 180) > 2) warn.push(`the saved view is rotated ${kml.look.heading.toFixed(0)}° (press N in Earth for north up)`);
  // first guess from the saved view: ground width = 2 x range x tan(30 deg) for a straight-down view
  let ftpx = 0.5, ox = w / 2, oy = h / 2, how = "no saved view, so the scale is a placeholder";
  if (kml.look && kml.look.range > 0){ ftpx = 2 * kml.look.range * Math.tan(Math.PI / 6) / FTUS / w; const [e, n] = P([kml.look.lon, kml.look.lat]); ox = w / 2 - e / ftpx; oy = h / 2 + n / ftpx; how = "estimated from the saved view"; }
  const src = c.toDataURL("image/jpeg", 0.9), ppf = 1 / ftpx;
  S.img = {src, sketchSrc:makeSketch(im, w, h), w, h, ppf, x:ax - ox / ppf, y:ay - oy / ppf, sample:false, site:null, pin:[ax, ay], pinLabel:(pin && pin.name) || "Site",
    ge:{shapes, cal, how, source:"Google Earth Pro"}};
  if (pin && !S.geo) S.geo = {lon:+pin.ll[0].toFixed(7), lat:+pin.ll[1].toFixed(7), source:"Google Earth placemark"};
  S.sketch = false; syncInputs(); fit(); render();
  const msg = `Google Earth image loaded, ${ftpx.toFixed(2)} ft per pixel (${how})${warn.length ? "; check: " + warn.join("; ") : ""}.`;
  setMode("select");
  setScale(S.img, kml.look ? "estimated" : "unscaled", kml.look ? "Google Earth saved view, 60° field of view assumed" : "Google Earth KML without a saved view"); syncInputs();
  if (cal){ gb.hidden = false; geSay(`${msg} Place equipment now. For an exact scale, use Refine the scale with the Earth path (two clicks on its ends).`); }
  else geSay(`${msg} Place equipment now. For an exact scale, add a path along a long straight edge in Earth, or check it with Set scale.`);
}
function geCalibrate(cl){
  const I = S.img, sh = I && I.ge && I.ge.cal; if (!sh){ setMode("select"); return; }
  const K1 = sh.pts[0], K2 = sh.pts[sh.pts.length - 1];
  const px = q => [(q[0] - I.x) * I.ppf, (q[1] - I.y) * I.ppf], p1 = px(cl[0]), p2 = px(cl[1]);
  const dk = Math.hypot(K2[0] - K1[0], K2[1] - K1[1]), dp = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
  if (dk < 5 || dp < 5){ geSay("Those points are too close together. Click the first and last points of the path again."); scalePts = []; return; }
  const ftpx = dk / dp, rot = (Math.atan2(K2[1] - K1[1], K2[0] - K1[0]) - Math.atan2(p2[1] - p1[1], p2[0] - p1[0])) * 180 / Math.PI, r = ((rot + 540) % 360) - 180;
  const ppf = 1 / ftpx; I.ppf = ppf; I.x = K1[0] - p1[0] / ppf; I.y = K1[1] - p1[1] / ppf; I.ge.how = `scaled from the ${dk.toFixed(0)} ft path`; setScale(I, "measured", `the ${dk.toFixed(0)} ft Google Earth path`); syncInputs();
  setMode("select");
  geSay(`Scaled from the ${dk.toFixed(1)} ft Google Earth path: ${ftpx.toFixed(3)} ft per pixel, pin on the placemark.` + (Math.abs(r) > 2 ? ` The image looks rotated ${r.toFixed(1)}° from north: save it again in Earth after pressing N.` : " North is up."));
  fit(); render();
}

// ---------- address first: the project address unlocks the other steps and goes out with layout.json
const FTUS = 1200 / 3937;
const addrIn = document.getElementById("addr"), addrStatus = document.getElementById("addrstatus");
// a new address sets the last one's site images aside (switchPhotos), so they never go out with another site's layout
function setAddress(a, geo){ const old = S.address || ""; S.address = a; S.geo = geo || S.geo || null; addrIn.value = a;
  if (normAddr(old) !== normAddr(a)){ switchPhotos(old, a); syncFolder(); loadSaveDir(); undoReset(); } save(); gate(); }
function gate(){ const on = !S.address; document.querySelector(".app").classList.toggle("locked", on); document.getElementById("gate").hidden = !on;
  document.querySelectorAll(".side>section:not(#addrblock)").forEach(el => { el.inert = on; }); if (!on && !addrIn.value) addrIn.value = S.address; }
// the address unlocks the other steps: set on Enter, when the box loses focus, or with Open Aerial Site Sketch
function commitAddress(){ const a = addrIn.value.trim(); if (!a) return "";
  if (normAddr(a) !== normAddr(S.address || "")) setAddress(a);
  return a; }
document.getElementById("addrform").onsubmit = e => { e.preventDefault(); const a = commitAddress(); if (!a) return;
  if (skAuto.checked && normAddr(a) !== normAddr(S.sketchFor || "")){ S.sketchFor = a; openSketch(a); } };   // once per new address
addrIn.addEventListener("change", commitAddress);   // leaving the box unlocks the steps; the sketch opens on Enter or the button
delete S.aerialSite;   // left by the removed Find aerial step

// ---------- modes
const hints = {
  select:"Drag equipment, stalls or a single bollard to move them. Shift-click (or Multi-select) picks several to move as a group; Shift-drag on empty space boxes them. Click a conduit to add a bend point. Drag empty space to pan, scroll to zoom.",
  rotate:"Press on an item and drag around it to rotate it to any angle (a selected group turns about its centre). Hold Shift to snap to 15°. Esc or Select to finish.",
  crop:"Drag a box around the work area to crop the overhead view. Press on equipment, or Esc, to go back to Select.",
  scale:"Click the centres of two stall stripes (standard stalls are 9 ft wide; several stalls apart is more accurate), or both ends of any known length, then enter the stall count or the length. Esc or Select to skip.",
  gecal:"Click the first point of the Google Earth path on the image, then its last point.",
};
function setMode(m){ mode = m; scalePts = []; document.getElementById("scalebox").hidden = true;
  ["select","crop","scale","rotate"].forEach(k => document.getElementById("m-" + k).setAttribute("aria-pressed", k === m));
  svg.setAttribute("class", "mode-" + m); document.getElementById("hint").textContent = hints[m]; render(); }
document.getElementById("m-select").onclick = () => setMode("select");
document.getElementById("m-crop").onclick = () => setMode("crop");
document.getElementById("m-scale").onclick = () => setMode("scale");
document.getElementById("m-rotate").onclick = () => setMode(mode === "rotate" ? "select" : "rotate");   // a toggle
const multiBtn = document.getElementById("m-multi");
multiBtn.onclick = () => { multi = !multi; multiBtn.setAttribute("aria-pressed", multi); };
document.getElementById("z-in").onclick = () => zoom(0.8);
document.getElementById("z-out").onclick = () => zoom(1.25);
document.getElementById("z-fit").onclick = () => { fit(); render(); };

// ---------- pointer handling
let drag = null, scalePts = [];
svg.addEventListener("wheel", e => { e.preventDefault(); const [x, y] = toFt(e); zoom(e.deltaY > 0 ? 1.12 : 0.89, x, y); }, {passive:false});
svg.addEventListener("pointerdown", e => {
  const p = toFt(e); svg.setPointerCapture(e.pointerId);
  // in Crop view a press on equipment, a bollard, a parking item or a bend point leaves cropping and grabs it
  if (mode === "crop" && e.target.closest("[data-vtx],[data-item],[data-boll],[data-pk]")) setMode("select");
  if (mode === "crop"){ drag = {kind:"crop", a:p, b:p}; return; }
  if (mode === "scale"){ drag = {kind:"scale", b:p}; return; }
  if (mode === "gecal"){ drag = {kind:"gecal", b:p}; return; }
  const vtx = e.target.closest("[data-vtx]"), item = e.target.closest("[data-item]"), run = e.target.closest("[data-run]");
  const boll = e.target.closest("[data-boll]"), pk = !boll && !item && e.target.closest("[data-pk]");
  if (vtx){ const [id, i] = vtx.dataset.vtx.split("|"); drag = {kind:"vtx", id, i:+i}; return; }
  if (boll){ const [id, i] = boll.dataset.boll.split("|"); const it = S.items[id]; customBollards(it, size());
    selectOnly(id); selBoll = {id, i:+i}; drag = {kind:"boll", id, i:+i}; render(); return; }
  const hit = pk ? S.pk[pk.dataset.pk] : item ? S.items[item.dataset.item] : null;
  if (hit){
    if (multi || e.shiftKey || e.ctrlKey || e.metaKey){   // add to, or drop from, the selection
      if (isSel(hit.id)){ selSet.delete(hit.id); selected = selIds().pop() || null; selBoll = null; render(); return; }
      selSet.add(hit.id); selected = hit.id; selBoll = null;
    } else if (!isSel(hit.id)) selectOnly(hit.id);
    else { selected = hit.id; selBoll = null; }   // pressing one of the group grabs the whole group
    const ids = selIds(), snap = snapOf(ids);
    drag = mode === "rotate" ? {kind:"rot", ids, snap, c:ids.length > 1 ? selCentre(ids) : [hit.x, hit.y], a0:null, deg:0} : {kind:"move", ids, snap, p0:p};
    render(); return; }
  if (run){ // insert a bend point on the nearest segment
    const r = runs(size()).find(x => x.id === run.dataset.run); const pts = pathPts(r);
    let bi = 1, bd = Infinity;
    for (let i = 1; i < pts.length; i++){ const [ax,ay] = pts[i-1], [bx,by] = pts[i]; const L2 = (bx-ax)**2 + (by-ay)**2 || 1;
      const t = Math.max(0, Math.min(1, ((p[0]-ax)*(bx-ax) + (p[1]-ay)*(by-ay)) / L2)); const d = Math.hypot(p[0] - (ax + t*(bx-ax)), p[1] - (ay + t*(by-ay)));
      if (d < bd){ bd = d; bi = i; } }
    const mid = (S.routes[r.id] || []).slice(); mid.splice(bi - 1, 0, p); S.routes[r.id] = mid; drag = {kind:"vtx", id:r.id, i:bi - 1}; render(); return; }
  if (multi || e.shiftKey){ drag = {kind:"box", a:p, b:p}; return; }   // box several items into the selection
  selectOnly(null); drag = {kind:"pan", sx:e.clientX, sy:e.clientY, v:{...S.view}}; render();
});
svg.addEventListener("pointermove", e => {
  if (!drag) return; const p = toFt(e);
  if (drag.kind === "pan"){ const k = drag.v.w / svg.clientWidth; S.view = {...drag.v, x:drag.v.x - (e.clientX - drag.sx) * k, y:drag.v.y - (e.clientY - drag.sy) * k}; render(); }
  else if (drag.kind === "move"){ const dx = p[0] - drag.p0[0], dy = p[1] - drag.p0[1];
    for (const [id, s0] of Object.entries(drag.snap)){ const o = O(id); if (!o) continue; delete o.auto; o.x = +(s0.x + dx).toFixed(2); o.y = +(s0.y + dy).toFixed(2); } render(); }
  else if (drag.kind === "rot"){ const [cx, cy] = drag.c, unit = S.view.w / svg.clientWidth; drag.cur = p;
    if (drag.a0 === null){ if (Math.hypot(p[0] - cx, p[1] - cy) < unit*14){ render(); return; } drag.a0 = Math.atan2(p[1] - cy, p[0] - cx); }   // start once clear of the pivot
    let deg = (Math.atan2(p[1] - cy, p[0] - cx) - drag.a0) * 180 / Math.PI; deg = ((deg + 540) % 360) - 180;
    if (e.shiftKey) deg = Math.round(deg / 15) * 15;
    drag.deg = deg; rotateSnap(drag.snap, drag.c, deg); render(); }
  else if (drag.kind === "boll"){ const it = S.items[drag.id], b = it.bl[drag.i]; const c = Math.cos(it.rot * Math.PI / 180), sn = Math.sin(it.rot * Math.PI / 180);
    const dx = p[0] - it.x, dy = p[1] - it.y; b.x = +(dx*c + dy*sn).toFixed(3); b.y = +(-dx*sn + dy*c).toFixed(3); render(); }
  else if (drag.kind === "vtx"){ S.routes[drag.id][drag.i] = [+p[0].toFixed(2), +p[1].toFixed(2)]; render(); }
  else { drag.b = p; render(); }
});
svg.addEventListener("pointerup", async e => {
  if (!drag) return; const d = drag; drag = null;
  if (d.kind === "crop" && S.img){
    const x0 = Math.min(d.a[0], d.b[0]), y0 = Math.min(d.a[1], d.b[1]), x1 = Math.max(d.a[0], d.b[0]), y1 = Math.max(d.a[1], d.b[1]);
    const I = S.img; const sx = Math.max(0, Math.round((x0 - I.x) * I.ppf)), sy = Math.max(0, Math.round((y0 - I.y) * I.ppf));
    const ex = Math.min(I.w, Math.round((x1 - I.x) * I.ppf)), ey = Math.min(I.h, Math.round((y1 - I.y) * I.ppf));
    if (ex - sx > 20 && ey - sy > 20){
      const src = await cropImage(I.src, sx, sy, ex - sx, ey - sy); const sk = await cropImage(I.sketchSrc, sx, sy, ex - sx, ey - sy);
      S.img = {...I, src, sketchSrc:sk, w:ex - sx, h:ey - sy, x:I.x + sx / I.ppf, y:I.y + sy / I.ppf, sample:false};
      fit(); setMode(scaleHow(S.img) === "unscaled" ? "scale" : "select"); return;   // a scaled image keeps its scale through the crop
    }
    render(); return;
  }
  if (d.kind === "box"){ const x0 = Math.min(d.a[0], d.b[0]), y0 = Math.min(d.a[1], d.b[1]), x1 = Math.max(d.a[0], d.b[0]), y1 = Math.max(d.a[1], d.b[1]);
    for (const o of [...Object.values(S.items), ...Object.values(S.pk)]) if (o.x >= x0 && o.x <= x1 && o.y >= y0 && o.y <= y1){ selSet.add(o.id); selected = o.id; }
    selBoll = null; render(); return; }
  if (d.kind === "gecal"){ scalePts.push(d.b); if (scalePts.length === 2) geCalibrate(scalePts); render(); return; }
  if (d.kind === "scale"){ scalePts.push(d.b); if (scalePts.length === 2){ const L = Math.hypot(scalePts[1][0]-scalePts[0][0], scalePts[1][1]-scalePts[0][1]);
      document.getElementById("scalemeas").textContent = `Measured ${L.toFixed(1)} ft (about ${(L / CD50.STALL_FT).toFixed(1)} stalls at the current scale)`;
      // with a usable scale already, guess the stall count (9 ft each) so a stripe-to-stripe check is one click on Apply
      const ns = Math.round(L / CD50.STALL_FT); if (scaleHow(S.img) !== "unscaled" && ns >= 1 && ns <= 80){ scaleStalls.value = ns; scaleFt.value = ns * CD50.STALL_FT; } document.getElementById("scalebox").hidden = false; document.getElementById("scaleft").focus(); }
    render(); return; }
  render();
});
svg.addEventListener("dblclick", e => { const vtx = e.target.closest("[data-vtx]"); if (!vtx) return; const [id, i] = vtx.dataset.vtx.split("|"); S.routes[id].splice(+i, 1); render(); });
// Set scale takes a true length, or a stall count: standard stalls are about 9 ft wide (CD50.STALL_FT), so clicks on stripe
// centres N stalls apart give 9 x N ft. More stalls apart is more accurate.
const scaleFt = document.getElementById("scaleft"), scaleStalls = document.getElementById("scalestalls");
scaleStalls.oninput = () => { const n = parseInt(scaleStalls.value); if (n > 0) scaleFt.value = n * CD50.STALL_FT; };
scaleFt.oninput = () => { scaleStalls.value = ""; };
document.getElementById("scaleok").onclick = () => {
  const truth = parseFloat(scaleFt.value); if (!(truth > 0) || scalePts.length < 2 || !S.img) return;
  const L = Math.hypot(scalePts[1][0]-scalePts[0][0], scalePts[1][1]-scalePts[0][1]); const f = truth / L, n = parseInt(scaleStalls.value);
  const [ox, oy] = scalePts[0]; S.img.ppf = S.img.ppf / f; S.img.x = ox + (S.img.x - ox) * f; S.img.y = oy + (S.img.y - oy) * f; delete S.img.guess;
  // a stall count rests on the 9 ft assumption, not on a measurement, so it is "assumed" and the plan set flags it
  setScale(S.img, n > 0 ? "assumed" : "measured", n > 0 ? `${n} standard stall${n > 1 ? "s" : ""} at ${CD50.STALL_FT} ft` : `a ${truth} ft length`);
  if (S.img.ge) S.img.ge.how = S.img.scale.by;
  fit(); setMode("select"); syncInputs();
};
document.getElementById("scalecancel").onclick = () => setMode("select");
window.addEventListener("keydown", e => {
  if (document.body.classList.contains("sk")) return;   // keys belong to Aerial Site Sketch while it is open
  if (e.key === "Escape" && mode !== "select" && !e.target.matches("input,select,textarea")){ setMode("select"); return; }
  if (e.target.matches("input,select,textarea")) return;
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === "z" || e.key === "Z")){ e.preventDefault(); undo(); return; }
  if (e.key === "Escape" && selSet.size){ selectOnly(null); render(); return; }
  if (!selSet.size) return;
  if ((e.key === "Delete" || e.key === "Backspace") && !selBoll && selIds().some(id => S.pk[id])){ e.preventDefault();   // equipment comes from the sizing, so only parking and plants delete
    for (const id of selIds()) if (S.pk[id]){ delete S.pk[id]; selSet.delete(id); } selected = selIds().pop() || null; render(); return; }
  if ((e.key === "Delete" || e.key === "Backspace") && selBoll){ e.preventDefault(); S.items[selBoll.id].bl.splice(selBoll.i, 1); selBoll = null; render(); return; }
  if (e.key === "r" || e.key === "R"){ rotateSel(e.shiftKey ? -15 : 15); render(); return; }
  const k = {ArrowLeft:[-1, 0], ArrowRight:[1, 0], ArrowUp:[0, -1], ArrowDown:[0, 1]}[e.key];   // nudge 0.5 ft, Shift 5 ft
  if (k && !selBoll){ e.preventDefault(); const st = e.shiftKey ? 5 : 0.5;
    for (const id of selIds()){ const o = O(id); delete o.auto; o.x = +(o.x + k[0]*st).toFixed(2); o.y = +(o.y + k[1]*st).toFixed(2); } render(); }
});
window.addEventListener("resize", () => render());
document.getElementById("b-undo").onclick = () => undo();

// ---------- boot
if (S.img && S.img.guess && !S.img.scale){ S.img.scale = {how:"unscaled", by:"loaded image"}; delete S.img.guess; }   // saved before scale.how
if (!S.img) S.img = sampleLot();
buildItems(size());
if (!S.view) fit();
syncInputs(); syncPark(); setMode("select"); gate(); syncFolder();
restoreImages(); loadSaveDir(); undoBtn();
})();
