// BEGIN AERIAL SITE SKETCH script
(function () {
"use strict";
// Aerial Site Sketch lives in a shadow root so its styles and ids stay apart from the layout tool's
const HOST = document.getElementById("sketchview"), ROOT = HOST.attachShadow({ mode: "open" });
ROOT.appendChild(document.getElementById("sketch-tpl").content.cloneNode(true));
const $ = s => ROOT.querySelector(s);
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const NOTE = ["NOT FOR CONSTRUCTION.", "Sketch not from survey.", "Survey required before next revision."];
const DEV_BOARD = 18432059992, PROJ_BOARD = 7198560820;

const TOGGLES = [
  ["parking", "Parking lines and spaces"], ["curbs", "Curbs and islands"], ["aisles", "Drive lanes, directions and arrows"],
  ["landscape", "Landscaping (grass, beds, hedges)"], ["trees", "Trees (light outline under the lines)"],
  ["ada", "ADA spaces"], ["buildings", "Building outlines"], ["lights", "Parking lot lights"], ["stoplights", "Stoplights"],
  ["equipment", "Visible equipment"], ["north", "North arrow"], ["dims", "Dimensions"]
];
const TYPE_TOGGLE = { stall_row: "parking", stall_line: "parking", curb: "curbs", island: "curbs", aisle: "aisles", arrow: "aisles",
  drive_lane: "aisles", landscape: "landscape", hedge: "landscape", tree: "trees", paint_line: "parking", hatch_area: "parking", sidewalk: "curbs",
  ada_space: "ada", building: "buildings", light_pole: "lights", stoplight: "stoplights", equipment: "equipment", dimension: "dims", lot_edge: null };
const BASIC = new Set(["stall_row", "stall_line", "curb", "island", "aisle", "drive_lane", "arrow", "landscape", "hedge", "tree", "building", "lot_edge",
  "paint_line", "hatch_area", "sidewalk"]);
const TYPE_NAME = { stall_row: "stall rows", stall_line: "single stripes", curb: "curb lines", island: "islands", aisle: "drive aisles",
  drive_lane: "drive lanes", landscape: "landscaped areas", hedge: "hedges", tree: "trees",
  paint_line: "painted lines", hatch_area: "striped areas", sidewalk: "sidewalks",
  arrow: "traffic arrows", ada_space: "ADA spaces", building: "buildings", light_pole: "parking lot lights", stoplight: "stoplights",
  equipment: "equipment items", dimension: "dimensions", lot_edge: "lot borders" };

const caps = { sample: null, mcp: null, downloads: null, images: false };
const S = {
  file: null, imgEl: null, W: 0, H: 0, inputs: null, toggles: {}, rounds: [], view: -1,
  pxPerFt: null, scaleSource: "", project: null, picked: null, ctl: null, busy: false, example: true
};

/* ---------- boot ---------- */
const togBox = $("#toggles");
TOGGLES.forEach(([k, label]) => {
  const l = document.createElement("label");
  l.innerHTML = `<input type="checkbox" id="tg-${k}" checked> ${esc(label)}`;
  togBox.appendChild(l);
});

function use(name) {
  try { return (window.claude && window.claude.use) ? window.claude.use(name).catch(() => null) : Promise.resolve(null); }
  catch (e) { return Promise.resolve(null); }
}
async function boot() {
  const [sm, mc, dl] = await Promise.all([use("sample"), use("mcp"), use("downloads")]);
  caps.sample = sm; caps.mcp = mc; caps.downloads = dl;
  if (sm) { const lim = await sm.limits().catch(() => null); caps.images = !!(lim && lim.images); caps.maxImages = (lim && lim.images && lim.images.maxCount) || 1; }
  setChip("#st-sample", caps.images, "Claude tracing: ready", sm ? "Claude tracing: images unavailable here" : "Claude tracing: open this page in Claude");
  setChip("#st-mcp", !!mc, "monday + Drive: ready", "monday + Drive: unavailable, type the number");
  setChip("#st-dl", !!dl, "Downloads: ready", "Downloads: unavailable here");
}
function setChip(sel, ok, yes, no) { const c = $(sel); c.textContent = ok ? yes : no; c.className = "chip " + (ok ? "ok" : "no"); }

/* ---------- image input ---------- */
const drop = $("#drop"), fileIn = $("#file");
fileIn.addEventListener("change", () => fileIn.files[0] && takeFile(fileIn.files[0]));
drop.addEventListener("dragover", e => { e.preventDefault(); drop.classList.add("over"); });
drop.addEventListener("dragleave", () => drop.classList.remove("over"));
drop.addEventListener("drop", e => { e.preventDefault(); drop.classList.remove("over"); const f = e.dataTransfer.files[0]; if (f) takeFile(f); });
function takeFile(f) {
  if (!/^image\/(jpeg|png|webp)$/.test(f.type)) { $("#start-msg").textContent = "That file is not a JPEG, PNG or WebP image. Choose another."; return; }
  S.file = f;
  const url = URL.createObjectURL(f);
  const img = new Image();
  img.onload = () => { S.imgEl = img; S.W = img.naturalWidth; S.H = img.naturalHeight;
    const t = $("#thumb"); t.src = url; t.hidden = false;
    $("#drop-text").innerHTML = `<b>${esc(f.name)}</b><br><span class="hint">${S.W} × ${S.H} px. Click to choose a different image.</span>`; };
  img.onerror = () => { $("#start-msg").textContent = "That image could not be opened. Try saving it as a PNG or JPEG."; };
  img.src = url;
}

/* ---------- progress ---------- */
const STEPS = [["proj", "Project number"], ["scale", "Scale"], ["border", "Sketch border"], ["trace", "Claude traces the site"],
  ["review", "Internal review: 4 runs over the photo"], ["q", "Unclear areas"], ["opts", "Two options"]];
function resetProgress() {
  $("#progress").innerHTML = STEPS.map(([k, t]) => `<li><span class="st" id="pg-${k}">waiting</span><span>${esc(t)}</span><span class="hint" id="pgn-${k}"></span></li>`).join("");
}
function prog(k, state, note) {
  const el = $("#pg-" + k); if (!el) return;
  el.textContent = { run: "working", done: "done", need: "needs you", wait: "waiting", skip: "skipped", fail: "problem" }[state] || state;
  el.className = "st " + (state === "fail" ? "need" : state);
  if (note !== undefined) $("#pgn-" + k).textContent = note ? "· " + note : "";
  // mirror the current step in step 3, so the page never looks idle while work goes on
  const name = (STEPS.find(s => s[0] === k) || [k, k])[1], st = $("#opt-status");
  if (k === "opts" && state === "done") st.hidden = true;
  else if (state === "run" || state === "need" || state === "fail") {
    st.hidden = false; st.className = "msg" + (state === "fail" ? " warn" : "");
    st.textContent = (state === "need" ? "Waiting for you in step 2 · " : state === "fail" ? "Stopped · " : "Working · ") + name + (note ? ": " + note : "");
  }
}
/* Before the first round, swap the example sketches for a clear "in progress" panel. */
function showWaiting(msg) {
  if (S.rounds.length) return;
  ["A", "B"].forEach(L => { $("#sheet" + L).innerHTML = `<div class="sheet-wait"><div><b>Option ${L} · ${L === "A" ? "Basic" : "Full"}</b>${esc(msg)}</div></div>`; });
  $("#exA").hidden = $("#exB").hidden = true;
  $("#diff").innerHTML = ""; $("#checklist").innerHTML = "";
  $("#pickA").disabled = $("#pickB").disabled = true;
  $("#opt-hint").textContent = "Your two options appear here when Claude finishes tracing.";
}

/* ---------- start ---------- */
$("#start").addEventListener("click", () => { $("#err").hidden = true; start().catch(e => fail("starting", e)); });
/* Any error shows on the page and unlocks the buttons, instead of leaving the page frozen. */
function fail(where, e) {
  try { console.error(e); } catch (x) {}
  S.busy = false; setBusy(false);
  const m = $("#err"); $("#s-checks").hidden = false; m.hidden = false;
  const why = (e && (e.message || e.code)) || String(e || "unknown error");
  m.textContent = `Something went wrong while ${where}: ${why}. Click Start to try again. If it happens again, send Claude this message.`;
  const tr = $("#p-tracing"); if (tr) tr.hidden = true;
  showWaiting("Stopped. See the red message in step 2.");
}
/* Every async entry point of this page goes through guard(), so its own errors stop it cleanly. There is deliberately no
   window-wide error listener: the layout tool shares this window, and its errors must not stop a trace in progress. */
const guard = (where, fn) => (...a) => Promise.resolve().then(() => fn(...a)).catch(e => fail(where, e));
$("#stop").addEventListener("click", () => S.ctl && S.ctl.abort());

function readInputs() {
  return { address: $("#address").value.trim(), site: $("#site").value.trim(), customer: $("#customer").value.trim(),
    rev: Math.max(0, parseInt($("#rev").value, 10) || 0) };
}
function readToggles() { const t = {}; TOGGLES.forEach(([k]) => t[k] = $("#tg-" + k).checked); return t; }

async function start() {
  if (S.busy) return;
  const inp = readInputs(), missing = [];
  if (!S.file || !S.imgEl) missing.push("the aerial image");
  if (!inp.address) missing.push("site address");
  if (!inp.site) missing.push("site name");
  if (!inp.customer) missing.push("customer");
  if (missing.length) { $("#start-msg").textContent = "Still needed: " + missing.join(", ") + "."; return; }
  if (!caps.sample) { $("#start-msg").textContent = "Claude is not reachable from this view. Open the page from its claude.ai link."; return; }
  if (!caps.images) { $("#start-msg").textContent = "This view cannot send images to Claude. Open the page in claude.ai."; return; }
  S.inputs = inp; S.toggles = readToggles(); S.rounds = []; S.view = -1; S.picked = null; S.pxPerFt = null; S.scaleSource = ""; S.scaleEstimated = false; S.project = null; S.example = false;
  S.north = { found: false, angleDeg: 0 }; S.border = null; S.crop = null; S.cropBlob = null;
  S.review = $("#tg-review").checked;
  $("#start-msg").textContent = "";
  $("#s-checks").hidden = false; $("#s-download").hidden = true;
  resetProgress();
  showWaiting("Finish the scale and sketch border in step 2. Claude then traces the site, which takes one to two minutes.");
  lookupProject();
  S.busy = true; setBusy(true);
  // 1. scale (and north) from the whole image
  prog("scale", "run", "looking for a scale bar");
  let sc = null;
  try { sc = await callScale(); }
  catch (e) {
    if (e && ["cancelled", "not_granted", "sampling_disabled", "images_unavailable", "image_rejected", "session_expired"].includes(e.code)) {
      prog("scale", "fail", sampleMsg(e)); S.busy = false; setBusy(false); return;
    }
  }
  if (sc && sc.north && sc.north.found) S.north = { found: true, angleDeg: +sc.north.angleDeg || 0 };
  await settleScale({ scaleBar: (sc && sc.scaleBar) || { found: false } });
  // 2. the 4-corner sketch border
  await settleBorder();
  S.busy = false;
  // 3. trace inside the border
  await runRound("");
}
async function callScale() {
  S.ctl = new AbortController();
  const prompt = `Look at this aerial image of a site. Find two things only.
1. A scale bar printed on the image (a bar labeled with a distance such as "50 ft" or "20 m"). If there is one, give the two ends of its full labeled length on a 0-1000 grid (x from the left edge 0 to the right edge 1000, y from the top edge 0 to the bottom edge 1000), the length in feet (1 m = 3.2808 ft), and the label as printed.
2. A north arrow or compass printed on the image, and its angle clockwise from image-up to north.
Reply with only: {"scaleBar":{"found":false,"p1":[0,0],"p2":[0,0],"lengthFt":0,"reading":""},"north":{"found":false,"angleDeg":0}}`;
  return caps.sample.json(prompt, { images: [S.file], modelTier: "default", signal: S.ctl.signal });
}

/* ---------- sketch border (4 corners) ---------- */
function settleBorder() {
  prog("border", "need", "set 4 corners or use the whole image");
  $("#p-border").hidden = false;
  $("#p-border").scrollIntoView({ block: "start" });
  const cv = $("#border-canvas"), pts = [];
  const order = () => { if (pts.length < 3) return pts.slice(); const c = centroid(pts); return pts.slice().sort((a, b) => Math.atan2(a[1] - c[1], a[0] - c[0]) - Math.atan2(b[1] - c[1], b[0] - c[0])); };
  const draw = () => drawImageCanvas(cv, null, order(), pts.length === 4);
  draw(); ZOOM.border.fit();
  return new Promise(resolve => {
    const check = () => { $("#border-use").disabled = pts.length !== 4; $("#border-count").textContent = `${pts.length} of 4 corners`; };
    check();
    cv.onclick = e => { if (pts.length >= 4) return; pts.push(canvasNorm(cv, e)); draw(); check(); };
    $("#border-undo").onclick = () => { pts.pop(); draw(); check(); };
    const done = note => { cv.onclick = null; $("#p-border").hidden = true; prog("border", "done", note); resolve(); };
    $("#border-use").onclick = async () => {
      $("#border-use").disabled = true; $("#border-count").textContent = "Preparing the area…";
      try { await setBorder(order()); } catch (e) { S.crop = null; S.cropBlob = null; }
      done(S.crop ? "4 corners set; Claude traces only inside them" : "4 corners set; whole image sent, Claude told to trace only inside them");
    };
    $("#border-whole").onclick = async () => { await setBorder(null); done("whole image"); };
  });
}
/* Crops the image to the border (plus a small margin) so Claude sees the area in more detail. */
function setBorder(poly) {
  S.border = poly;
  if (!poly) { S.crop = null; S.cropBlob = null; return Promise.resolve(); }
  const xs = poly.map(p => p[0] / 1000 * S.W), ys = poly.map(p => p[1] / 1000 * S.H), m = 0.03 * Math.max(S.W, S.H);
  const x0 = Math.max(0, Math.min(...xs) - m), y0 = Math.max(0, Math.min(...ys) - m);
  const x1 = Math.min(S.W, Math.max(...xs) + m), y1 = Math.min(S.H, Math.max(...ys) + m);
  const crop = { x0, y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0) };
  // If the browser will not cut the image, keep the border and send the whole image instead.
  const noCrop = () => { S.crop = null; S.cropBlob = null; };
  return new Promise(res => {
    const timer = setTimeout(() => { noCrop(); res(); }, 8000);
    try {
      const c = document.createElement("canvas"), k = Math.min(1, 3000 / Math.max(crop.w, crop.h));
      c.width = Math.max(1, Math.round(crop.w * k)); c.height = Math.max(1, Math.round(crop.h * k));
      c.getContext("2d").drawImage(S.imgEl, x0, y0, crop.w, crop.h, 0, 0, c.width, c.height);
      c.toBlob(b => { clearTimeout(timer); if (b && b.size) { S.crop = crop; S.cropBlob = b; } else noCrop(); res(); }, "image/jpeg", 0.92);
    } catch (e) { clearTimeout(timer); noCrop(); res(); }
  });
}
/* Claude traces the cropped image; these move points between its grid and the whole-image grid. */
const toFull = p => S.crop ? [(S.crop.x0 + p[0] / 1000 * S.crop.w) / S.W * 1000, (S.crop.y0 + p[1] / 1000 * S.crop.h) / S.H * 1000] : p;
const toCropPt = p => S.crop ? [((p[0] / 1000 * S.W) - S.crop.x0) / S.crop.w * 1000, ((p[1] / 1000 * S.H) - S.crop.y0) / S.crop.h * 1000] : p;
function featToFull(f) {
  ["p1", "p2", "at"].forEach(k => { if (isPt(f[k])) f[k] = toFull(f[k]); });
  if (f.points) f.points = f.points.map(toFull);
  if (Array.isArray(f.depth)) f.depth = [f.depth[0] * S.crop.w / S.W, f.depth[1] * S.crop.h / S.H];
  if (f.r) f.r = f.r * S.crop.w / S.W;
  return f;
}
function traceToFull(t) {
  if (!S.crop) return;
  t.features.forEach(featToFull);
  t.unclear.forEach(u => {
    const a = toFull([u.bbox[0], u.bbox[1]]), b = toFull([u.bbox[2], u.bbox[3]]); u.bbox = [a[0], a[1], b[0], b[1]];
    u.choices.forEach(c => c.features.forEach(featToFull));
  });
}

/* ---------- a round: trace, scale, questions, options ---------- */
async function runRound(detail) {
  S.busy = true; setBusy(true);
  const t0 = Date.now(), mmss = ms => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`;
  prog("trace", "run", "0:00 so far; this usually takes one to two minutes");
  S.stageNote = "";
  const tick = setInterval(() => prog("trace", "run", `${mmss(Date.now() - t0)} so far; ${S.stageNote || "this usually takes two to four minutes"}`), 1000);
  showWaiting("Claude is tracing the area you chose" + (S.review ? ", then reviewing the sketch over the photo in 4 runs. This takes several minutes." : ". This takes a few minutes."));
  $("#tracing-title").textContent = "Area being traced";
  $("#tracing-hint").textContent = "Claude is tracing the area inside the yellow outline." + (S.review ? " Then it reviews the sketch over the photo in 4 runs before showing you options." : "");
  $("#p-tracing").hidden = false;
  try { drawImageCanvas($("#trace-canvas"), null, S.border, true); } catch (e) {}
  $("#s-checks").scrollIntoView({ block: "start" });
  let trace;
  try { trace = await callTrace(detail); }
  catch (e) {
    clearInterval(tick); $("#p-tracing").hidden = true;
    prog("trace", "fail", sampleMsg(e));
    showWaiting("Tracing stopped: " + sampleMsg(e));
    S.busy = false; setBusy(false); return;
  }
  clearInterval(tick);
  if (trace.quality && trace.quality.ok === false) {
    $("#p-tracing").hidden = true;
    prog("trace", "fail", "Claude cannot trace this image: " + (trace.quality.problem || "it is unclear") + ". Upload a sharper, straight-down image.");
    showWaiting("Claude could not trace this image. See step 2.");
    S.busy = false; setBusy(false); return;
  }
  normalizeTrace(trace);
  traceToFull(trace);
  let tidy = finalizeTrace(trace);
  // no known length: standard 9 ft stalls set the scale, from the trace as drawn and before the reviews, which then cannot
  // move it (aisleFix); it is not re-estimated from the reviewed rows
  if (!S.pxPerFt || S.scaleEstimated) stallScale(trace.features);
  if (trace.missing && trace.missing.length) prog("trace", "need", `${trace.features.length} items traced, but ${trace.missing.map(f => PASS_LABEL[f].replace(/^The /, "the ")).join(" and ")} did not finish. Use "Run it again" in step 3.`);
  else prog("trace", "done", `${trace.features.length} items traced`);
  // internal review: overlay the sketch on the photo, 4 runs, before Tony sees options
  trace.reviewNotes = [];
  if (S.review && trace.features.length) {
    try { trace.reviewNotes = await reviewTrace(trace); }
    catch (e) { $("#p-tracing").hidden = true; prog("review", "fail", sampleMsg(e)); showWaiting("Stopped: " + sampleMsg(e)); S.busy = false; setBusy(false); return; }
    tidy = finalizeTrace(trace);
  } else prog("review", "skip", S.review ? "nothing to review" : "turned off");
  $("#p-tracing").hidden = true;
  trace.laneNotes = (trace.passNotes || []).concat(tidy, aisleNotes(trace.features), trace.reviewNotes);

  const round = { n: S.rounds.length + 1, trace, answers: {}, detail, at: new Date() };
  if (trace.unclear.length) { prog("q", "need", `${trace.unclear.length} to answer`); await askUnclear(round); prog("q", "done"); }
  else prog("q", "done", "none");

  S.rounds.push(round); S.view = S.rounds.length - 1; S.picked = null;
  prog("opts", "done", "Round " + round.n);
  renderOptions();
  S.busy = false; setBusy(false);
  if (trace.declined && trace.declined.length) $("#regen-msg").textContent = "This sketch shows existing conditions only. Equipment is placed later in the CD50 App.";
  $("#s-options").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
}
function setBusy(b) {
  const none = S.example || !S.rounds.length;
  $("#start").disabled = b; $("#stop").hidden = !b; $("#regen").disabled = b || none; $("#reborder").disabled = b || none;
  $("#pass-retry-btn").disabled = b;   // the button is drawn while busy; this re-enables it once the round finishes
  $("#pickA").disabled = b || none; $("#pickB").disabled = b || none;
}

/* ---------- Claude trace ---------- */
function wantedTypes() {
  const t = S.toggles, out = ["lot_edge"];
  Object.keys(TYPE_TOGGLE).forEach(k => { const g = TYPE_TOGGLE[k]; if (g && t[g] && !out.includes(k)) out.push(k); });
  return out;
}
/* Background knowledge every trace and review gets (from Tony). */
const LOT_KNOWLEDGE = `PARKING LOT KNOWLEDGE
- Light or discolored bands running down drive aisles are usually wear, not markings: color faded by sun, tire wear from traffic, surface erosion, or a drainage channel (a water culvert or concrete valley gutter) carrying runoff. They are not painted lines, stall stripes, lane markings, islands or curbs; never trace them as any of those. Paint has crisp straight edges and a steady width; wear and drainage bands are soft-edged, uneven or follow the slope of the lot.
- Dark lines that wander or branch are cracks or crack sealant, not paint.`;
/* The trace runs as two passes at the same time: "paint" (stall rows and other markings) and "site" (everything else). */
const PAINT_TYPES = new Set(["stall_row", "stall_line", "paint_line", "hatch_area", "ada_space", "arrow"]);
const PAINT_RULES = [
  `Stall rows: trace each row of stalls along one side of an aisle. Count the stripes carefully along the whole row; stalls = stripes - 1. Stripes end at the curb or the shared center line: put q1 exactly there, never past a curb and never short of it. Stalls are only on pavement: never trace stripes on an island, median, landscaped bed or sidewalk. Judge the angle between the stripes and the aisle (90, 75, 60 or 45) and, for angled stalls, which end of the row the stripes' far ends point toward. Split a row where an island, a gap or a change of angle breaks it.`,
  `Herringbone and back-to-back rows: two rows of angled stalls often meet at a shared painted center line; neighboring aisles often alternate their lean. Trace each side as its own stall_row (q1 on the shared line) and the shared line itself as a "stall_line".`,
  `Worn paint: stripes may be faint on old or cracked pavement. Stripes are straight, evenly spaced and parallel; cracks and crack sealant are irregular and branch. Count faint stripes too, by their spacing. If a row is too faint to be sure, set "unsure": true.`,
  `Yellow and white lines: scan the whole area for long straight yellow lines (fire lane edges, lane center lines) and white lines that are not stall stripes (stop bars, edge lines). They are easy to miss; trace every one as "paint_line" with its color.`,
  `Striped areas: hatched no-parking zones, ADA access aisles and crosswalks are "hatch_area". ADA stalls are "ada_space".`
];
const SITE_RULES = [
  `Lot border: trace the full outer edge of the paved lot as one closed "lot_edge" outline, following the pavement edge or curb line, out through each driveway to the street edge.`,
  `Drive lanes: trace every drive lane and aisle centerline as a "drive_lane" with its flow. Where the stalls beside a lane are angled, the lane is one-way and traffic moves toward the end the stalls' far ends point to; order the points in the direction of travel. If you cannot tell, use "two-way".`,
  `Islands: trace every island on its own (end caps at row ends, medians between rows, corner and entrance islands) along the curb face, with its surface. Real islands are often hooks, J, L or boot shapes where the curb curls around a row end; trace that true outline point by point, never simplify it to an oval or rectangle. "rounded": true only means the corners are rounded.`,
  `Landscaping: grass, planting beds, mulch or rock beds are "landscape" outlines with a short label; hedge or shrub rows are "hedge" lines. Record each tree with its trunk position and canopy radius.`,
  `Light poles: look for the pole's shadow; place the pole at the base where the shadow starts. Trees, poles, signs, hydrants and equipment on islands are separate features.`,
  `Sidewalks along buildings and walkways are "sidewalk" outlines.`
];
const SHAPES = {
  stall_row: `- {"type":"stall_row","p1":[x,y],"p2":[x,y],"q1":[x,y],"count":N,"angle":60,"leanToward":"p2","unsure":false}
  p1 and p2: the aisle-side ends of the first and last stripe of the row. q1: the far end of the first stripe (it shows which side of the line the stalls are on and how deep they are). count: number of stalls. angle: 90, 75, 60 or 45, the angle between the stripes and the aisle. leanToward: for angled stalls, "p1" or "p2", the end of the row that the stripes' far ends point toward; "none" for 90.`,
  stall_line: `- {"type":"stall_line","points":[[x,y],[x,y]]}  a single stripe or a shared center line between back-to-back rows.`,
  lot_edge: `- {"type":"lot_edge","points":[[x,y],...],"closed":true}`,
  curb: `- {"type":"curb","points":[[x,y],...],"closed":false}`,
  island: `- {"type":"island","points":[[x,y],...],"closed":true,"rounded":true,"surface":"landscaped","label":""}  surface: "landscaped", "concrete", "mulch" or "rock". Use 6 or more points around each rounded nose.`,
  building: `- {"type":"building","points":[[x,y],...],"closed":true,"label":""}`,
  aisle: `- {"type":"aisle","points":[[x,y],...],"closed":true}  drive aisle pavement outline.`,
  ada_space: `- {"type":"ada_space","points":[[x,y],...],"closed":true}`,
  drive_lane: `- {"type":"drive_lane","points":[[x,y],...],"flow":"one-way" or "two-way"}  lane centerline.`,
  paint_line: `- {"type":"paint_line","points":[[x,y],...],"color":"yellow" or "white"}`,
  hatch_area: `- {"type":"hatch_area","points":[[x,y],...],"closed":true,"label":"ADA aisle"}`,
  sidewalk: `- {"type":"sidewalk","points":[[x,y],...],"closed":true}`,
  landscape: `- {"type":"landscape","points":[[x,y],...],"closed":true,"label":"grass"}`,
  hedge: `- {"type":"hedge","points":[[x,y],...]}`,
  tree: `- {"type":"tree","at":[x,y],"r":20}  trunk position and canopy radius on the x grid.`,
  arrow: `- {"type":"arrow","at":[x,y],"angleDeg":0}  painted traffic arrow; angle clockwise from image-up.`,
  light_pole: `- {"type":"light_pole","at":[x,y]}`,
  stoplight: `- {"type":"stoplight","at":[x,y]}`,
  equipment: `- {"type":"equipment","at":[x,y],"label":"transformer"}  (add "points" for a large pad outline)`,
  dimension: `- {"type":"dimension","p1":[x,y],"p2":[x,y],"what":"aisle width"}  key distances worth dimensioning. Do not convert to feet.`
};
const SITE_A = new Set(["lot_edge", "curb", "island", "sidewalk", "building", "aisle"]);
const PAINT_ROWS = new Set(["stall_row", "stall_line", "ada_space"]);
const PAINT_FOCUS = new Set(["paint", "paintRows", "paintMarks"]);
const HALVES = { site: ["siteA", "siteB"], paint: ["paintRows", "paintMarks"] };
/* Tony's answers from every round, newest first, one per area: an older answer whose box mostly overlaps a newer one is
   dropped (it would contradict it), and at most 20 are kept, so the prompt does not grow round after round. Skips count
   too: a skipped area is not asked about again. */
function earlierAnswers() {
  const all = [];
  S.rounds.forEach(r => r.trace.unclear.forEach(u => { const a = r.answers[u.id]; if (a && Array.isArray(u.bbox)) all.push({ u, a }); }));
  const area = b => Math.max(0, b[2] - b[0]) * Math.max(0, b[3] - b[1]);
  const overlap = (p, q) => { const w = Math.min(p[2], q[2]) - Math.max(p[0], q[0]), h = Math.min(p[3], q[3]) - Math.max(p[1], q[1]);
    return w > 0 && h > 0 ? w * h / Math.max(1e-9, Math.min(area(p), area(q))) : 0; };
  const kept = [];
  for (const x of all.reverse()) {
    if (kept.some(k => overlap(k.u.bbox, x.u.bbox) > 0.5)) continue;
    kept.push(x); if (kept.length >= 20) break;
  }
  return kept;
}
function buildPrompt(detail, focus) {
  focus = focus || "site";
  const prev = earlierAnswers().map(({ u, a }) => {
    const cb = [...toCropPt([u.bbox[0], u.bbox[1]]), ...toCropPt([u.bbox[2], u.bbox[3]])].map(Math.round);
    if (a.kind === "skip") return `- Area box ${JSON.stringify(cb)} ("${u.question}"): Tony skipped this. Draw what you see there and do not ask about it again.`;
    const said = a.kind === "choice" ? u.choices[a.idx].label : `${a.type}: ${a.label || "outlined by Tony"}`;
    return `- Area box ${JSON.stringify(cb)} ("${u.question}"): Tony answered "${said}". Draw it that way and do not ask again.`;
  });
  const last = S.rounds.length ? S.rounds[S.rounds.length - 1].trace : null;
  // "siteA"/"siteB" and "paintRows"/"paintMarks" split a pass in two smaller requests, used when it has to be re-run
  const isPaint = PAINT_FOCUS.has(focus);
  const types = wantedTypes().filter(t => isPaint
    ? PAINT_TYPES.has(t) && (focus === "paintRows" ? PAINT_ROWS.has(t) : focus === "paintMarks" ? !PAINT_ROWS.has(t) : true)
    : !PAINT_TYPES.has(t) && (focus === "siteA" ? SITE_A.has(t) : focus === "siteB" ? !SITE_A.has(t) : true));
  const rules = (isPaint ? PAINT_RULES : SITE_RULES).map((r, i) => `${i + 5}. ${r}`).join("\n");
  const shapes = types.map(t => SHAPES[t]).filter(Boolean).join("\n");
  return [
`You are tracing an aerial (overhead) photograph for an engineering sketch of EXISTING site conditions at an EV charging site.
${focus === "paint"
  ? "THIS PASS: pavement markings only (parking stall rows, single stripes, painted lines, striped areas, ADA spaces, painted arrows). A second pass traces curbs, islands, lanes, buildings and landscaping, so leave those out."
  : focus === "site"
  ? "THIS PASS: everything except pavement markings (lot border, curbs, islands, drive lanes, buildings, landscaping, trees, poles, equipment, sidewalks). A second pass traces the stall stripes and paint, so leave those out."
  : `THIS PASS: only these items: ${types.join(", ")}. Other passes trace everything else, so leave it out. Keep the answer compact.`}
Site: ${S.inputs.site}. Address: ${S.inputs.address}. Customer: ${S.inputs.customer}.

COORDINATES: a 0-1000 grid on each axis of the image. x runs from the left edge (0) to the right edge (1000); y from the top edge (0) to the bottom edge (1000). The image is ${Math.round(S.crop ? S.crop.w : S.W)} x ${Math.round(S.crop ? S.crop.h : S.H)} pixels; use the 0-1000 grid on both axes anyway. Use whole numbers for every coordinate. Place every point exactly on the painted line, curb face or edge you see, with only as many points as the shape needs. Keep "notes" to one short sentence.${S.border ? `
SKETCH BORDER: Tony set the area to sketch. Trace only inside this polygon (same 0-1000 grid): ${JSON.stringify(S.border.map(toCropPt).map(p => p.map(Math.round)))}. Ignore everything outside it; features crossing it may run to its edge.` : ""}

RULES
1. Trace only what exists in the photo. Never add proposed or new items (chargers, new stalls, new equipment, new striping). If the extra instructions ask for something that is not in the photo, do not draw it; put that request in "declined".
2. Trees: never let a canopy hide linework. Where a canopy hides lines or edges, continue them under the canopy using the spacing and angle of the visible ones.
3. If you cannot tell what is in an area, do not guess. Add it to "unclear" with a short plain-English question, its bounding box, and 2 to 4 choices, each with the features you would draw for that choice. At most 6 unclear areas. Put the most likely choice first.
4. Never draw a line where nothing is visible and no visible pattern continues.
${rules}

${LOT_KNOWLEDGE}
Trace only these types: ${types.join(", ")}.

FEATURE SHAPES (coordinates on the 0-1000 grid)
${shapes}

Reply with only one JSON object:
{"quality":{"ok":true,"problem":""},
 "features":[],
 "unclear":[{"id":"u1","bbox":[x1,y1,x2,y2],"question":"","choices":[{"label":"","features":[]}]}],
 "declined":[],
 "notes":""}
If the image is too blurry, dark or cut off to trace, set quality.ok to false and say why in quality.problem.`,
    prev.length ? "\nTONY'S EARLIER ANSWERS\n" + prev.join("\n") : "",
    last ? `\nThe previous round traced ${last.features.length} items. Re-trace from the photo; do not copy it blindly.` : "",
    detail ? `\nEXTRA INSTRUCTIONS FROM TONY (apply them, but only for things that exist in the photo)\n${detail}` : ""
  ].join("\n");
}
/* Errors a re-run cannot fix (the viewer said no, a limit was hit, the image was refused). */
const NO_RETRY = new Set(["cancelled", "not_granted", "sampling_disabled", "session_expired", "rate_limited", "images_unavailable",
  "image_rejected", "not_declared", "capability_disabled", "capability_removed"]);
function passCall(detail, focus) {
  return caps.sample.json(buildPrompt(detail, focus), { images: [S.cropBlob || S.file], modelTier: "complex", cache: false, signal: S.ctl.signal });
}
const okVal = v => !!(v && typeof v === "object" && Array.isArray(v.features));
/* An answer cut off part way is not wasted: every complete item in its "features" list is kept. */
function salvageFeatures(text) {
  if (!text) return null;
  const i = text.indexOf('"features"'); if (i < 0) return null;
  const j = text.indexOf("[", i); if (j < 0) return null;
  const out = []; let depth = 0, start = -1, inStr = false, escp = false;
  for (let k = j + 1; k < text.length; k++) {
    const ch = text[k];
    if (inStr) { if (escp) escp = false; else if (ch === "\\") escp = true; else if (ch === '"') inStr = false; continue; }
    if (ch === '"') inStr = true;
    else if (ch === "{") { if (depth === 0) start = k; depth++; }
    else if (ch === "}") { depth--; if (depth === 0 && start >= 0) { try { out.push(JSON.parse(text.slice(start, k + 1))); } catch (e) {} start = -1; } }
    else if (ch === "]" && depth === 0) break;
  }
  return out.length ? out : null;
}
function salvaged(e) {
  if (!e || e.code !== "invalid_json") return null;
  const f = salvageFeatures(e.text);
  return f ? { features: f, unclear: [], declined: [], notes: "" } : null;
}
/* Settles one pass: its answer; or the items recovered from a cut-off answer; or one automatic re-run,
   asking for less at a time (the site pass is split in two). Returns {value, note} or {error}. */
async function settlePass(first, detail, focus) {
  if (first.status === "fulfilled" && okVal(first.value)) return { value: first.value };
  const e1 = first.status === "rejected" ? first.reason : { code: "invalid_json" };
  if (e1 && e1.code === "cancelled") throw e1;
  // a cut-off answer still holds its complete items: kept as the fallback if the re-run also fails
  const rec = salvaged(e1);
  if (rec) rec.features.forEach(f => { if (f && typeof f === "object") f._salv = focus; });   // replaced by "Run it again"
  const fallback = err => rec ? { value: rec, note: `${PASS_LABEL[focus]} was cut short; ${rec.features.length} items were recovered from it, but some may be missing. Click "Run it again" to fill in the rest.`, partial: true } : { error: err };
  if (e1 && NO_RETRY.has(e1.code)) return fallback(e1);
  S.stageNote = `${PASS_LABEL[focus].replace(/^The /, "the ")} did not finish, re-running it automatically`;
  const subs = HALVES[focus] || [focus];
  const res = await Promise.allSettled(subs.map(p => passCall(detail, p)));
  S.stageNote = "";
  const got = { features: [], unclear: [], declined: [], notes: "" };
  let n = 0, lastErr = e1; const lost = [];   // halves that did not come back whole: offered by "Run it again"
  for (let i = 0; i < res.length; i++) {
    const r = res[i];
    if (r.status === "rejected" && r.reason && r.reason.code === "cancelled") throw r.reason;
    const whole = r.status === "fulfilled" && okVal(r.value), v = whole ? r.value : salvaged(r.reason);
    if (!whole) lost.push(subs[i]);
    if (v) { n++; if (!whole) v.features.forEach(f => { if (f && typeof f === "object") f._salv = subs[i]; }); mergePass(got, v, subs[i]); }
    else lastErr = r.status === "rejected" ? r.reason : { code: "invalid_json" };
  }
  if (!n) return fallback(lastErr);
  return { value: got, partial: lost.length > 0, missing: lost,
    note: `${PASS_LABEL[focus]} did not finish the first time and was re-run automatically${lost.length ? `; ${lost.map(s => PASS_LABEL[s].replace(/^The /, "the ")).join(" and ")} did not come back whole, so "Run it again" is offered for it` : ""}.` };
}
async function callTrace(detail) {
  S.ctl = new AbortController();
  const [site, paint] = await Promise.allSettled([passCall(detail, "site"), passCall(detail, "paint")]);
  const [sp, pp] = await Promise.all([settlePass(site, detail, "site"), settlePass(paint, detail, "paint")]);
  if (sp.error && pp.error) throw sp.error;
  const base = sp.value ? sp.value : { quality: { ok: true }, features: [], unclear: [], declined: [], notes: "" };
  base.unclear = base.unclear || []; base.declined = base.declined || [];
  if (!sp.note) base.unclear.forEach(u => { if (u) u.id = unclearId("site"); });   // a first answer keeps Claude's u1, u2: make them unique
  base.missing = []; base.passNotes = [];
  if (sp.note) base.passNotes.push(sp.note);
  if (sp.partial) base.missing.push(...(sp.missing && sp.missing.length ? sp.missing : ["site"]));
  if (pp.value) { mergePass(base, pp.value, "paint"); if (pp.note) base.passNotes.push(pp.note); if (pp.partial) base.missing.push(...(pp.missing && pp.missing.length ? pp.missing : ["paint"])); }
  else { base.missing.push("paint"); base.passNotes.push(passFailNote("paint", pp.error)); }
  if (sp.error) { base.missing.push("site"); base.passNotes.push(passFailNote("site", sp.error)); }
  return base;
}
const PASS_LABEL = { paint: "The parking markings pass", site: "The curbs, islands and lanes pass",
  siteA: "The lot border, curbs, islands and buildings pass", siteB: "The lanes, landscaping, poles and equipment pass",
  paintRows: "The stall rows pass", paintMarks: "The painted lines, striped areas and arrows pass" };
/* Every unclear-area id is unique for the life of the page (a counter), so answers stored by id never overwrite each other,
   however many passes and retries add questions to one round. */
let unclearSeq = 0;
const unclearId = focus => `${focus}-q${++unclearSeq}`;
function passFailNote(focus, e) {
  return `${PASS_LABEL[focus]} did not finish, even after an automatic re-run (${sampleMsg(e)}). Click "Run it again" in step 3 to add it.`;
}
function mergePass(base, pv, focus) {
  base.features = base.features.concat(pv.features || []);
  (pv.unclear || []).forEach(u => { if (u) { u.id = unclearId(focus); base.unclear.push(u); } });
  base.declined = base.declined.concat(pv.declined || []);
  if (pv.notes) base.notes = [base.notes, pv.notes].filter(Boolean).join(" ");
}
/* ---------- internal review: the sketch drawn over the photo, checked by Claude ---------- */
const OV_COL = { stripe: "#FF2BD6", lot_edge: "#00E5FF", curb: "#00E5FF", island: "#00E5FF", paint_yellow: "#FFE600", paint_white: "#FFFFFF",
  landscape: "#3DFF6E", hedge: "#3DFF6E", building: "#FF8A00", hatch: "#FFFFFF", sidewalk: "#C8C8C8", ada_space: "#4FC3FF", equipment: "#FF8A00" };
/* Draws the current sketch in bright colors over the photo (the same area Claude traced). */
const stallFocus = () => new Set(["stall_row", "stall_line", ...CURB_TYPES]);
const STALL_EDIT = new Set(["stall_row", "stall_line"]);
/* The three review runs: what each looks at, what it may change, and whether it works on the enhanced photo. */
const REVIEWS = [
  { title: "Internal review 1 of 4: existing stall lines, enhanced photo", what: "existing stall lines on the enhanced photo", enhance: true,
    see: () => stallFocus(), edit: () => STALL_EDIT },
  { title: "Internal review 2 of 4: spacing and the whole lot", what: "spacing and the whole lot", enhance: false, see: () => null, edit: () => null },
  { title: "Internal review 3 of 4: ADA and irregularities", what: "ADA and irregularities", enhance: false,
    see: () => new Set([...PAINT_TYPES, ...CURB_TYPES]), edit: () => PAINT_TYPES },
  { title: "Internal review 4 of 4: final check of everything", what: "final check of everything", enhance: false, see: () => null, edit: () => null }
];
/* The traced area of the photo on a canvas. Enhanced: pavement pushed dark and paint pushed bright (hue kept,
   so yellow stays yellow), which makes faded stall lines stand out. Falls back to the plain photo if the browser refuses. */
function photoCanvas(enhance) {
  const cr = S.crop || { x0: 0, y0: 0, w: S.W, h: S.H }, k = Math.min(1, 2000 / Math.max(cr.w, cr.h));
  const c = document.createElement("canvas"); c.width = Math.max(1, Math.round(cr.w * k)); c.height = Math.max(1, Math.round(cr.h * k));
  const x = c.getContext("2d");
  x.drawImage(S.imgEl, cr.x0, cr.y0, cr.w, cr.h, 0, 0, c.width, c.height);
  if (enhance) {
    try {
      const id = x.getImageData(0, 0, c.width, c.height), d = id.data, hist = new Uint32Array(256), n = c.width * c.height;
      for (let i = 0; i < d.length; i += 4) hist[(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) | 0]++;
      const pct = q => { let acc = 0; for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= q * n) return v; } return 255; };
      const lo = pct(0.45), hi = Math.max(lo + 25, pct(0.995));
      for (let i = 0; i < d.length; i += 4) {
        const L = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        const t = Math.max(0, Math.min(1, (L - lo) / (hi - lo))), f = L > 0 ? 255 * Math.pow(t, 1.6) / L : 0;
        d[i] = Math.min(255, d[i] * f); d[i + 1] = Math.min(255, d[i + 1] * f); d[i + 2] = Math.min(255, d[i + 2] * f);
      }
      x.putImageData(id, 0, 0); c.enhanced = true;
    } catch (e) { c.enhanced = false; }
  }
  c.cr = cr; c.k = k;
  return c;
}
const canvasBlob = c => new Promise((res, rej) => { try { c.toBlob(b => b ? res(b) : rej(new Error("image")), "image/jpeg", 0.9); } catch (e) { rej(e); } });
/* Draws the current sketch in bright colors over the photo (enhanced or plain). Returns {overlay, photo} blobs. */
async function overlayBlob(feats, only, enhance) {
  if (only) feats = feats.filter(f => only.has(f.type));
  const c = photoCanvas(enhance), cr = c.cr, k = c.k;
  const photo = enhance && c.enhanced ? await canvasBlob(c) : (S.cropBlob || S.file);
  drawOverlay(c.getContext("2d"), feats, p => [(p[0] - cr.x0) * k, (p[1] - cr.y0) * k], Math.max(2, c.width / 500));
  return { overlay: await canvasBlob(c), photo, enhanced: !!c.enhanced };
}
/* Draws features in the overlay colors on a 2D context; M maps image pixels to the context. */
function drawOverlay(x, feats, M, lw) {
  x.lineCap = "round"; x.lineJoin = "round";
  const line = (pts, closed) => { x.beginPath(); pts.map(M).forEach((q, i) => i ? x.lineTo(q[0], q[1]) : x.moveTo(q[0], q[1])); if (closed) x.closePath(); x.stroke(); };
  const head = (at, dir) => { const q = M(at), n = [-dir[1], dir[0]], s = lw * 5; x.beginPath(); x.moveTo(q[0] + dir[0] * s, q[1] + dir[1] * s); x.lineTo(q[0] - dir[0] * s + n[0] * s * .7, q[1] - dir[1] * s + n[1] * s * .7); x.lineTo(q[0] - dir[0] * s - n[0] * s * .7, q[1] - dir[1] * s - n[1] * s * .7); x.closePath(); x.fill(); };
  feats.forEach(f => parts(f).forEach(p => {
    if (p.k === "poly") {
      const col = p.cls === "paint" ? OV_COL["paint_" + p.color] : OV_COL[p.cls]; if (!col) return;
      x.strokeStyle = col; x.lineWidth = p.cls === "stripe" ? lw : lw * 1.4; line(p.pts, p.closed);
    } else if (p.k === "lane") {
      x.strokeStyle = x.fillStyle = "#2F7BFF"; x.lineWidth = lw * 1.2; line(p.pts, false);
      for (let i = 1; i < p.pts.length; i++) {
        const a = p.pts[i - 1], b = p.pts[i], d = unit(sub(b, a)), m = mul(add(a, b), .5);
        head(m, d); if (p.flow !== "one") head(add(m, mul(d, -len(sub(b, a)) * .2)), mul(d, -1));
      }
    } else if (p.k === "sym") {
      const q = M(p.at); x.strokeStyle = "#FF8A00"; x.lineWidth = lw; x.beginPath(); x.arc(q[0], q[1], lw * 3, 0, Math.PI * 2); x.stroke();
    }
  }));
}
/* One feature written the way Claude sees it: on the traced image's 0-1000 grid, whole numbers. */
function serialFeat(f) {
  const P = p => toCropPt(p).map(v => Math.round(v)), o = { type: f.type };
  if (f.type === "stall_row") {
    o.p1 = P(f.p1); o.p2 = P(f.p2); if (isPt(f.q1)) o.q1 = P(f.q1); o.count = f.count;
    if (f.angle != null || f.leanToward) { o.angle = f.angle; o.leanToward = f.leanToward; } else if (isPt(f.q2)) o.q2 = P(f.q2);
  } else {
    ["p1", "p2", "at"].forEach(k => { if (isPt(f[k])) o[k] = P(f[k]); });
    if (f.points) o.points = f.points.map(P);
    ["closed", "label", "flow", "color", "surface", "rounded", "what", "angleDeg"].forEach(k => { if (f[k] !== undefined && f[k] !== "") o[k] = f[k]; });
    if (f.r) o.r = Math.round(f.r * (S.crop ? S.W / S.crop.w : 1));
  }
  if (f._rv) o.changedBy = "review " + f._rv;   // the final review must give a why to undo it (applyReview)
  return JSON.stringify(o);
}
const REVIEW_FOCUS = [
`REVIEW 1 OF 4: EXISTING STALL LINES. Change only stall_row and stall_line features; leave every other feature exactly as it is.
The photo has been enhanced: pavement darkened and paint brightened, so faded stall lines show clearly. Use it to make sure every existing painted stall line is captured:
- add rows that are missing, including faint ones the enhancement now shows
- remove rows drawn where the enhanced photo shows no paint
- put each row on the paint: p1 and p2 on the aisle-side ends of the first and last painted stripe, q1 where the first stripe ends (at the curb or the shared center line)
- put each shared center line on the painted center line
- stalls are only on pavement, never on an island, median, landscaping or sidewalk
Leave fine spacing (the exact stall count) to review 2, unless a row is clearly short or long by several stalls.`,
`REVIEW 2 OF 4: SPACING AND THE WHOLE LOT.
Stall spacing first, row by row, comparing each magenta stripe with the painted stripe under it:
- spacing: the drawn stripes must land on the painted stripes all along the row. If they drift, the count is wrong: count the painted stripes again (stalls = stripes - 1) and fix "count".
- position, angle (90, 75, 60 or 45) and lean must match the paint.
- stripes end where the paint ends, at the curb or the shared center line: never past a curb, never short of it. Back-to-back rows end on the same center line.
- no stripes on medians, islands, landscaping or sidewalks.
Drive aisles must leave a reasonable space for vehicles to drive. Typical clear aisle widths (stall end to stall end) with 9 ft stalls: 90° stalls 22–26 ft two-way (24 ft is common); 75° stalls 20–22 ft one-way; 60° stalls 16–18 ft one-way; 45° stalls 12–15 ft one-way; any two-way aisle or fire lane at least 20–24 ft. A standard stall is about 9 ft wide and 18 ft deep.
{SCALE}
Measured from the current sketch:
{AISLES}
{AISLE_FIX}
Then verify the rest of the overlay against the photo, area by area:
- island, curb, lot border, sidewalk and building outlines follow the photo
- drive lanes point the right way; painted lines and striped areas are all there
- landscaping, trees, poles and equipment are present and in place`,
`REVIEW 3 OF 4: ADA AND IRREGULARITIES. Change only pavement markings (stall_row, stall_line, ada_space, hatch_area, paint_line, arrow); leave everything else as it is.
ADA, in detail: find every accessible stall. Look for blue paint, a wheelchair symbol, a hatched access aisle beside it, and signs; they are usually nearest the building entrances. Trace each accessible stall as "ada_space" over that stall (label "VAN" when it is van accessible: a wide aisle of about 8 ft or a van sign) and each access aisle as "hatch_area" with label "ADA aisle". Keep the stall row it sits in. In the summary, say how many ADA stalls and van stalls you found and where.
Irregularities: look closely for anything that breaks the regular pattern and trace it: end stalls of a different width or angle, partial rows, gaps where a row stops for an island, pole, hydrant or driveway, compact or motorcycle stalls, loading and no-parking zones, crosswalks, stop bars, painted arrows, and worn or missing paint. Split a stall row where its pattern changes. Mention the important ones in the summary.`,
`REVIEW 4 OF 4: FINAL CHECK OF EVERYTHING. This is the last look before the sketch goes to Tony. The first three reviews did this:
{PRIOR}
Check their work and the whole sketch against the photo, area by area:
- did any earlier change make something worse (a row moved off the paint, a count changed wrongly, a feature removed that exists)? Undo or correct it.
- stall rows: on the paint, right count, angle and lean; stripes end at the curb or shared center line; none on medians or islands
- drive aisles leave a reasonable space to drive (typical with 9 ft stalls: 90° 22–26 ft two-way, 75° 20–22 ft, 60° 16–18 ft, 45° 12–15 ft one-way). Measured now:
{AISLES}
{AISLE_FIX}
- ADA stalls, van stalls and access aisles: all present and on the right stalls
- islands, curbs, lot border, sidewalks and buildings follow the photo
- drive lanes and their direction, painted lines, striped areas, arrows
- landscaping, trees, poles and equipment
- anything missing, doubled, or drawn where nothing exists
Make only corrections you are sure of. In the summary, say what you corrected and anything Tony should still check by eye.`
];
/* With a measured scale, a narrow aisle points at rows drawn too deep, so the review may move them. With no scale, or one
   estimated from these same stalls, the aisle widths are measured with a ruler made from the rows under review: "fixing" the
   rows to typical widths would only make the sketch agree with itself, so then the widths are a report, never a reason to move rows. */
function aisleFix() {
  if (S.pxPerFt && !S.scaleEstimated) return "Where an aisle comes out narrower than typical, the rows beside it are probably drawn too deep or pushed into the aisle: check the photo and move or shorten those rows so their stall ends sit on the paint. Do not invent width the photo does not show; local codes vary, so these are sanity checks.";
  return "The scale here is not measured: it comes from the traced stalls themselves, so these aisle widths are not evidence. Do not move, shorten or recount any row to make an aisle width look typical. Move a row only where the photo shows its stall ends off the paint. If an aisle still looks wrong, say so in the summary for Tony.";
}
function reviewPrompt(t, k, two, prior) {
  const cfg = REVIEWS[k - 1], total = REVIEWS.length;
  const gridPerFt = S.pxPerFt ? S.pxPerFt / (S.crop ? S.crop.w : S.W) * 1000 : 0;
  const focus = REVIEW_FOCUS[k - 1]
    .replace("{PRIOR}", (prior && prior.length ? prior : ["(no notes from the earlier reviews)"]).map(n => "- " + n).join("\n"))
    .replace("{SCALE}", gridPerFt ? `Scale: 1 ft is about ${gridPerFt.toFixed(2)} units on the x grid (24 ft is about ${Math.round(24 * gridPerFt)} units)${S.scaleEstimated ? ", estimated from the traced stalls themselves" : ""}.` : "No scale was set; use the stall width (about 9 ft) as the ruler.")
    .split("{AISLES}").join(aisleLines(t.features))
    .split("{AISLE_FIX}").join(aisleFix());
  return `You are checking a traced engineering sketch of a parking lot against the aerial photo it was traced from. This is review ${k} of ${total}.
${two ? `Image 1 is the ${cfg.enhance ? "enhanced " : ""}photo. Image 2 is the same ${cfg.enhance ? "enhanced " : ""}photo with the current sketch drawn on top.` : `The image is the ${cfg.enhance ? "enhanced " : ""}photo with the current sketch drawn on top.`}
${!cfg.see()
  ? "Colors: magenta = stall stripes; cyan = lot border, curbs and islands; yellow = yellow painted lines; white = white painted lines and striped areas; blue = drive lane centerlines with direction arrows; green = landscaping and hedges; orange = buildings, equipment and poles; light blue = ADA spaces."
  : `The overlay shows only ${k === 1 ? "stall stripes and shared center lines (magenta)" : "pavement markings: stall stripes (magenta), ADA spaces (light blue), painted lines (yellow or white) and striped areas (white)"}, with curbs, islands, lot border, sidewalks and buildings (cyan/orange) for reference.`}
COORDINATES: a 0-1000 grid on each axis of the image (x from the left edge, y from the top edge). Whole numbers.

CURRENT FEATURES (index: feature)
${t.features.map((f, i) => i + ": " + serialFeat(f)).join("\n")}

${focus}
Fix what is clearly wrong and keep what is right.

${LOT_KNOWLEDGE}
Stall rows use: {"type":"stall_row","p1":[x,y],"p2":[x,y],"q1":[x,y],"count":N,"angle":60,"leanToward":"p2"} (p1, p2: aisle-side ends of the first and last stripe; q1: far end of the first stripe; leanToward: the end the stripes' far ends point to). ADA stalls: {"type":"ada_space","points":[[x,y],...],"closed":true,"label":"VAN" or ""}. Striped areas: {"type":"hatch_area","points":[[x,y],...],"closed":true,"label":"ADA aisle"}. Other features use the same shapes as above.
Trace only existing conditions.

Make at most ${REVIEW_CAP(t.features.length)} changes; the most important first.${k === total ? `
A feature marked "changedBy" was corrected by an earlier review. Remove or replace it only when the photo clearly shows that correction was wrong, and say why in "why"; a change to it without a "why" is ignored.` : ""}
Reply with only one JSON object:
{"remove":[{"i":index,"why":""}],"replace":[{"i":index,"feature":{...},"why":""}],"add":[{...}],"summary":"one short sentence on what you changed"}
If everything lines up: {"remove":[],"replace":[],"add":[],"summary":"No changes needed."}`;
}
/* Applies a review's corrections. With "only", changes to any other feature type are ignored. Indices refer to the list the
   review was shown (a snapshot), so removes and adds cannot shift each other. So that later reviews converge instead of
   undoing each other: each changed feature remembers which review changed it (_rv), the final review may only remove or
   replace such a feature when it gives a "why", and one review may make at most REVIEW_CAP(n) changes; the rest are held
   back and reported to Tony. */
const REVIEW_CAP = n => Math.max(6, Math.ceil(n * 0.3));
function applyReview(t, ed, only, k) {
  const conv = f => { const g = cleanFeature(f); if (g && S.crop) featToFull(g); if (g) g._rv = k; return g; };
  const okType = ty => !only || only.has(ty);
  const list = t.features.slice(), cap = REVIEW_CAP(list.length), last = k === REVIEWS.length;
  const idx = v => Number(v && typeof v === "object" ? v.i : v), why = v => v && typeof v === "object" && String(v.why || "").trim();
  // the final review undoing an earlier review's change needs a reason
  const guarded = (i, v) => last && list[i]._rv && list[i]._rv !== k && !why(v);
  let changed = 0, held = 0;
  const take = () => changed < cap ? (changed++, true) : (held++, false);
  const rem = new Set();
  (ed.remove || []).forEach(v => { const i = idx(v);
    if (!Number.isInteger(i) || !list[i] || !okType(list[i].type) || rem.has(i)) return;
    if (guarded(i, v)) { held++; return; }
    if (take()) rem.add(i); });
  (ed.replace || []).forEach(r => {
    const i = idx(r), g = r && conv(r.feature);
    if (!(g && Number.isInteger(i) && list[i] && !rem.has(i) && okType(list[i].type) && okType(g.type))) return;
    if (guarded(i, r)) { held++; return; }
    if (take()) list[i] = g; });
  const kept = list.filter((f, i) => !rem.has(i));
  (ed.add || []).forEach(a => { const g = conv(a); if (g && okType(g.type) && take()) kept.push(g); });
  t.features = kept;
  return { n: changed, held };
}
/* Overlay the sketch on the photo and let Claude correct it, four times (see REVIEWS); run 4 also sees the first three runs' notes.
   Never blocks the options: a review that fails is noted and skipped. */
async function reviewTrace(t, only) {
  const notes = [];
  for (let k = 1; k <= REVIEWS.length; k++) {
    if (only && !only.includes(k)) continue;
    const cfg = REVIEWS[k - 1];
    const t0 = Date.now(), mmss = ms => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`;
    const tick = setInterval(() => prog("review", "run", `review ${k} of ${REVIEWS.length} (${cfg.what}) · ${mmss(Date.now() - t0)}`), 1000);
    prog("review", "run", `review ${k} of ${REVIEWS.length} (${cfg.what})`);
    $("#tracing-title").textContent = cfg.title;
    $("#tracing-hint").textContent = (cfg.enhance ? "The photo is enhanced (pavement darkened, paint brightened) so faded stall lines stand out. " : "")
      + "Claude is comparing the bright lines (the sketch) with the photo underneath and fixing what does not line up. Your two options appear in step 3 after all four reviews.";
    try {
      const ob = await overlayBlob(t.features, cfg.see(), cfg.enhance);
      try { const cv = $("#trace-canvas"), img = new Image(), u = URL.createObjectURL(ob.overlay); img.onload = () => { cv.width = img.width; cv.height = img.height; cv.getContext("2d").drawImage(img, 0, 0); URL.revokeObjectURL(u); }; img.src = u; } catch (e) {}
      const two = (caps.maxImages || 1) >= 2;
      S.ctl = new AbortController();
      const ed = await caps.sample.json(reviewPrompt(t, k, two, notes), { images: two ? [ob.photo, ob.overlay] : [ob.overlay], modelTier: "complex", cache: false, signal: S.ctl.signal });
      clearInterval(tick);
      if (!ed || typeof ed !== "object") throw { code: "invalid_json" };
      const { n, held } = applyReview(t, ed, cfg.edit(), k);
      if (cfg.enhance && !ob.enhanced) notes.push(`Review ${k}: the photo could not be enhanced in this browser, so the plain photo was used.`);
      finalizeTrace(t);
      notes.push(`Review ${k}: ${n ? (ed.summary || `${n} changes`) : "no changes needed"}.`.replace(/\.\.$/, "."));
      if (held) notes.push(`Review ${k}: ${held} more change${held > 1 ? "s were" : " was"} held back (over the limit for one review, or undoing an earlier review without a reason); check those areas by eye.`);
    } catch (e) {
      clearInterval(tick);
      if (e && e.code === "cancelled") throw e;
      notes.push(`Review ${k} did not finish (${sampleMsg(e)}); the sketch is shown as traced.`);
    }
  }
  prog("review", "done", notes.map(n => n.replace(/^Review \d+: /, "")).join(" "));
  return notes;
}
/* Re-runs only the pass that did not finish and adds its items to the round on screen. A pass that has already been run
   again here once is asked for in two smaller halves (HALVES), since the usual cause is an answer cut off for length, so
   pressing "Run it again" does not repeat the same failing request. Only the final review runs over the result. */
async function retryMissing() {
  const r = S.rounds[S.view];
  if (!r || !r.trace.missing || !r.trace.missing.length || S.busy) return;
  const focus = r.trace.missing[0];
  const tries = r.trace.tries = r.trace.tries || {}; tries[focus] = (tries[focus] || 0) + 1;
  const parts = tries[focus] > 1 && HALVES[focus] ? HALVES[focus] : [focus];
  S.busy = true; setBusy(true); $("#pass-retry-btn").disabled = true;
  const t0 = Date.now(), mmss = ms => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`;
  const tick = setInterval(() => prog("trace", "run", `running ${PASS_LABEL[focus].replace(/^The /, "the ")} again${parts.length > 1 ? " in two halves" : ""} · ${mmss(Date.now() - t0)}`), 1000);
  try {
    S.ctl = new AbortController(); S.stageNote = "";
    const firsts = await Promise.allSettled(parts.map(p => passCall(r.detail, p)));
    const gots = await Promise.all(firsts.map((f, i) => settlePass(f, r.detail, parts[i])));
    if (gots.every(g => g.error)) throw gots[0].error;
    const part = { features: [], unclear: [], declined: [] }, still = [], notes = [];
    gots.forEach((g, i) => {
      if (g.error) { still.push(parts[i]); notes.push(passFailNote(parts[i], g.error)); return; }
      part.features.push(...g.value.features); part.unclear.push(...(g.value.unclear || [])); part.declined.push(...(g.value.declined || []));
      if (g.partial) { still.push(...(g.missing && g.missing.length ? g.missing : [parts[i]])); if (g.note) notes.push(g.note); }
    });
    normalizeTrace(part); traceToFull(part);
    part.unclear.forEach(u => { u.id = unclearId(focus); });
    clearInterval(tick);
    // a full answer replaces any items recovered from an earlier cut-off answer of this pass or its halves
    const covers = new Set([focus, ...(HALVES[focus] || [])]);
    r.trace.features = r.trace.features.filter(f => !covers.has(f._salv)).concat(part.features);
    r.trace.declined = (r.trace.declined || []).concat(part.declined);
    r.trace.missing = r.trace.missing.filter(x => x !== focus).concat(still.filter(x => x !== focus || parts.length === 1));
    r.trace.missing = [...new Set(r.trace.missing)];
    r.trace.passNotes = (r.trace.passNotes || []).filter(n => ![...covers].some(c => n.startsWith(PASS_LABEL[c]))).concat(notes);
    finalizeTrace(r.trace);
    prog("trace", r.trace.missing.length ? "need" : "done", `${part.features.length} more items added` + (r.trace.missing.length ? `; ${r.trace.missing.map(m => PASS_LABEL[m].replace(/^The /, "the ")).join(" and ")} still did not finish` : ""));
    if (S.review) {
      $("#p-tracing").hidden = false;
      try { r.trace.reviewNotes = (r.trace.reviewNotes || []).concat(await reviewTrace(r.trace, [REVIEWS.length])); } finally { $("#p-tracing").hidden = true; }
    }
    r.trace.laneNotes = r.trace.passNotes.concat(finalizeTrace(r.trace), aisleNotes(r.trace.features), r.trace.reviewNotes || []);
    if (part.unclear.length) {
      r.trace.unclear = r.trace.unclear.concat(part.unclear);
      prog("q", "need", `${part.unclear.length} to answer`);
      await askUnclear({ trace: { unclear: part.unclear }, answers: r.answers });
      prog("q", "done");
    }
  } catch (e) {
    clearInterval(tick);
    prog("trace", "fail", `${PASS_LABEL[focus]} did not finish again (${sampleMsg(e)}). Try again in a minute, or Regenerate.`);
  }
  S.busy = false; setBusy(false); renderOptions();
}
function sampleMsg(e) {
  switch (e && e.code) {
    case "cancelled": return "Stopped.";
    case "not_granted": return "Claude was not allowed for this page. Reload the page and choose Allow.";
    case "sampling_disabled": return "Claude is not available for this account.";
    case "rate_limited": return "Claude is busy or your usage limit was reached. Try again in a few minutes.";
    case "image_rejected": return "Claude could not read this image. Try a PNG or JPEG under 20 MB.";
    case "images_unavailable": return "This view cannot send images. Open the page in claude.ai.";
    case "invalid_json": return "Claude's answer came back in the wrong shape. Click Start (or Regenerate) to try again.";
    case "refused": return "Claude declined this request. Check the image and the extra detail, then try again.";
    case "session_expired": return "Your Claude session expired. Sign in again and reload.";
    default: return "Claude did not finish (" + ((e && e.code) || "error") + "). Try again.";
  }
}
const isPt = p => Array.isArray(p) && p.length >= 2 && isFinite(p[0]) && isFinite(p[1]);
function cleanFeature(f) {
  if (!f || typeof f !== "object" || !TYPE_NAME[f.type]) return null;
  if (f.points) f.points = f.points.filter(isPt);
  return f;
}
function normalizeTrace(t) {
  t.features = (t.features || []).map(cleanFeature).filter(Boolean);
  t.unclear = (t.unclear || []).filter(u => u && Array.isArray(u.bbox) && u.bbox.length === 4 && Array.isArray(u.choices) && u.choices.length).slice(0, 8);
  t.unclear.forEach((u, i) => { u.id = u.id || "u" + (i + 1); u.choices.forEach(c => c.features = (c.features || []).map(cleanFeature).filter(Boolean)); });
  t.declined = t.declined || [];
  t.north = t.north || { found: false, angleDeg: 0 };
  t.scaleBar = t.scaleBar || { found: false };
}

/* ---------- geometry ---------- */
const px = p => [p[0] / 1000 * S.W, p[1] / 1000 * S.H];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]], add = (a, b) => [a[0] + b[0], a[1] + b[1]], mul = (a, k) => [a[0] * k, a[1] * k];
const len = a => Math.hypot(a[0], a[1]);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
const unit = v => mul(v, 1 / (len(v) || 1));
function distToSeg(p, a, b) {
  const ab = sub(b, a), t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / (dot(ab, ab) || 1)));
  return len(sub(p, add(a, mul(ab, t))));
}
/* Stripe vector for a row given as count + angle + lean. q1 is used only for the side and the depth;
   a depth that makes no sense falls back to the standard (about twice the stall width). */
function rowGeom(f, a, b, n) {
  const along = sub(b, a), u = unit(along), nrm = [-u[1], u[0]];
  const ang = Math.max(30, Math.min(90, +f.angle || 90)), rad = ang * Math.PI / 180;
  const wPerp = len(along) / n * Math.sin(rad);
  const hint = isPt(f.q1) ? sub(px(f.q1), a) : null;
  const side = hint && dot(hint, nrm) < 0 ? -1 : 1;
  let D = hint ? Math.abs(dot(hint, nrm)) : 0, depthOk = D > 0.9 * wPerp && D < 4.5 * wPerp;
  if (f.depthPx > 0) { D = f.depthPx; depthOk = true; }   // set by snapCenterLines
  else if (!depthOk) D = 2 * wPerp;
  const lean = ang >= 89 ? 0 : (f.leanToward === "p2" ? 1 : f.leanToward === "p1" ? -1 : 0);
  return { v: add(mul(nrm, side * D), mul(u, lean * D / Math.tan(rad))), wPerp, depthOk };
}
/* With no scale bar or marked length, the traced stalls set the scale: a standard stall is about 9 ft wide (CD50.STALL_FT,
   perpendicular to its stripes), so the median stall width over rows of 3 or more stalls gives pixels per foot. Marked as
   an estimate on the sheet and in what goes to the layout tool. Needs at least 6 stalls; otherwise the sketch stays NTS. */
function stallScale(feats) {
  const w = [];
  feats.forEach(f => {
    if (f.type !== "stall_row" || !isPt(f.p1) || !isPt(f.p2) || f.unsure) return;
    const n = Math.round(f.count) || 0; if (n < 3) return;
    const g = rowGeom(f, px(f.p1), px(f.p2), n); if (g.wPerp > 0) for (let i = 0; i < n; i++) w.push(g.wPerp);   // weighted by stalls
  });
  if (w.length < 6) { if (S.scaleEstimated) { S.pxPerFt = null; S.scaleEstimated = false; S.scaleSource = ""; } return false; }
  w.sort((a, b) => a - b);
  S.pxPerFt = w[w.length >> 1] / CD50.STALL_FT; S.scaleEstimated = true;
  S.scaleSource = `Scale estimated from ${w.length} traced stalls, assuming standard ${CD50.STALL_FT} ft stalls. Check one known length before relying on it.`;
  prog("scale", "done", S.scaleSource);
  return true;
}
/* Stripes in one row are always parallel and about the same length. Repairs rows whose back ends were
   mixed up (stripes fanning or crossing) and dashes rows whose size still does not make sense. */
function fixRows(feats) {
  const toGrid = p => [p[0] / S.W * 1000, p[1] / S.H * 1000];
  let swapped = 0, bad = 0, faint = 0, countOff = 0, depthEst = 0;
  feats.forEach(f => {
    if (f.type !== "stall_row" || !isPt(f.p1) || !isPt(f.p2)) return;
    if (f.angle != null || f.leanToward) {
      // count + angle + lean rows are parallel by construction; only report what looks off
      const n = Math.max(1, Math.round(f.count) || 1), g = rowGeom(f, px(f.p1), px(f.p2), n);
      if (f.unsure) faint++;
      if (!g.depthOk) depthEst++;
      if (S.pxPerFt) { const ft = g.wPerp / S.pxPerFt; if (ft < 7 || ft > 12.5) countOff++; }
      return;
    }
    if (!isPt(f.q1) || !isPt(f.q2)) return;
    const a = px(f.p1), b = px(f.p2), qa = px(f.q1), qb = px(f.q2), u = unit(sub(b, a));
    let v1 = sub(qa, a), v2 = sub(qb, b);
    const s1 = sub(qb, a), s2 = sub(qa, b);
    if (len(sub(s1, s2)) < len(sub(v1, v2))) { v1 = s1; v2 = s2; swapped++; }
    let v = mul(add(v1, v2), .5);
    const n = Math.max(1, Math.round(f.count) || 1), w = len(sub(b, a)) / n || 1, L = len(v);
    const leanDeg = L ? Math.asin(Math.min(1, Math.abs(dot(v, u)) / L)) * 180 / Math.PI : 90;
    const sizeOk = L / w >= 1.2 && L / w <= 4.5;
    const ok = L > 0 && len(sub(v1, v2)) <= 0.5 * L && sizeOk && leanDeg <= 65;
    if (!ok) {
      bad++; f.unconfirmed = true;
      if (!sizeOk || leanDeg > 65) {
        // keep the side the stripes point to, square to the row, at a standard 2 x stall width
        const nrm = [-u[1], u[0]], side = dot(v, nrm) < 0 ? -1 : 1;
        v = mul(nrm, side * 2 * w);
      }
    }
    f.q1 = toGrid(add(a, v)); f.q2 = toGrid(add(b, v));
  });
  return { swapped, bad, faint, countOff, depthEst };
}
function fixAllRows(t) {
  const r = fixRows(t.features);
  t.unclear.forEach(u => u.choices.forEach(c => { const x = fixRows(c.features); Object.keys(r).forEach(k => r[k] += x[k]); }));
  const notes = [];
  const rows = n => `${n} stall row${n > 1 ? "s" : ""}`;
  if (r.faint) notes.push(`${rows(r.faint)} had faded paint; check ${r.faint > 1 ? "their" : "its"} stall count against the photo.`);
  if (r.countOff) notes.push(`${rows(r.countOff)} come${r.countOff > 1 ? "" : "s"} out narrower or wider than a normal stall (7 to 12.5 ft); the stall count may be off. Check against the photo.`);
  if (r.depthEst) notes.push(`${rows(r.depthEst)} had an unclear depth and ${r.depthEst > 1 ? "are" : "is"} drawn at a standard depth (about twice the stall width).`);
  if (r.swapped) notes.push(`${r.swapped} stall row${r.swapped > 1 ? "s" : ""} had stripes crossing; straightened so the stripes run parallel.`);
  if (r.bad) notes.push(`${r.bad} stall row${r.bad > 1 ? "s" : ""} did not add up (stripe length or angle) and ${r.bad > 1 ? "are" : "is"} drawn dashed. Check ${r.bad > 1 ? "them" : "it"} against the photo.`);
  return notes;
}
/* Back-to-back rows share a painted center line. Each row near a center line is set to end exactly on it,
   and the line is trimmed to run the length of those rows, so stripes and center line meet cleanly. */
function snapCenterLines(feats) {
  const cross = (p, q) => p[0] * q[1] - p[1] * q[0];
  const toGrid = p => [p[0] / S.W * 1000, p[1] / S.H * 1000];
  const rows = feats.filter(f => f.type === "stall_row" && isPt(f.p1) && isPt(f.p2) && (f.angle != null || f.leanToward));
  let snapped = 0;
  feats.filter(f => f.type === "stall_line" && f.points && f.points.length >= 2).forEach(L => {
    const P0 = px(L.points[0]), e = unit(sub(px(L.points[L.points.length - 1]), P0));
    const spans = [];
    rows.forEach(f => {
      const a = px(f.p1), b = px(f.p2), n = Math.max(1, Math.round(f.count) || 1);
      const u = unit(sub(b, a)); if (Math.abs(dot(u, e)) < 0.94) return;
      const g = rowGeom(Object.assign({}, f, { depthPx: 0 }), a, b, n), sdir = unit(g.v), m = mul(add(a, b), .5);
      const den = cross(sdir, e); if (Math.abs(den) < 1e-6) return;
      const t = cross(sub(P0, m), e) / den;                 // distance along the stripe to the center line
      const nrm = [-u[1], u[0]], Dold = Math.abs(dot(g.v, nrm)), Dnew = Math.abs(t * dot(sdir, nrm));
      if (!(t > 0 && Dnew > 0.6 * Dold && Dnew < 1.6 * Dold)) return;
      f.depthPx = Dnew; snapped++;
      const g2 = rowGeom(f, a, b, n);
      [add(a, g2.v), add(b, g2.v)].forEach(q => spans.push(dot(sub(q, P0), e)));
    });
    if (spans.length) L.points = [toGrid(add(P0, mul(e, Math.min(...spans)))), toGrid(add(P0, mul(e, Math.max(...spans))))];
  });
  return snapped;
}
/* Stall stripes never run past a curb, and never stop short of one: each stripe is run out to the first curb,
   island edge, lot edge, sidewalk or building edge it meets (between half and 1.35 times its length).
   Rows that end on a shared center line are only ever shortened. */
const CURB_TYPES = ["curb", "island", "lot_edge", "sidewalk", "building"];
function connectStripes(feats, curbFeats) {
  const cross = (p, q) => p[0] * q[1] - p[1] * q[0], toGrid = p => [p[0] / S.W * 1000, p[1] / S.H * 1000];
  const segs = [];
  curbFeats.forEach(f => {
    if (!CURB_TYPES.includes(f.type) || !f.points || f.points.length < 2) return;
    const p = f.points.map(px);
    for (let i = 1; i < p.length; i++) segs.push([p[i - 1], p[i]]);
    if (f.closed || ["island", "sidewalk", "building"].includes(f.type)) segs.push([p[p.length - 1], p[0]]);
  });
  // areas paint never crosses: islands and medians, landscaping, sidewalks, buildings
  const noPaint = curbFeats.filter(f => ["island", "landscape", "sidewalk", "building"].includes(f.type) && f.points && f.points.length > 2).map(f => f.points.map(px));
  const inPoly = (p, P) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { if ((P[i][1] > p[1]) !== (P[j][1] > p[1]) && p[0] < (P[j][0] - P[i][0]) * (p[1] - P[i][1]) / (P[j][1] - P[i][1]) + P[i][0]) c = !c; } return c; };
  // the longest part of s->e that stays off every no-paint area, as [t0, t1], or null
  const clipOff = (s, e) => {
    const d = sub(e, s), ts = [0, 1];
    noPaint.forEach(P => P.forEach((c1, i) => {
      const c2 = P[(i + 1) % P.length], cd = sub(c2, c1), den = cross(d, cd); if (Math.abs(den) < 1e-9) return;
      const w = sub(c1, s), t = cross(w, cd) / den, u = cross(w, d) / den;
      if (t > 0 && t < 1 && u >= 0 && u <= 1) ts.push(t);
    }));
    ts.sort((x, y) => x - y);
    let best = null;
    for (let k = 0; k + 1 < ts.length; k++) {
      const t0 = ts[k], t1 = ts[k + 1]; if (t1 - t0 < 1e-6) continue;
      const mid = add(s, mul(d, (t0 + t1) / 2));
      if (noPaint.some(P => inPoly(mid, P))) continue;
      if (best && Math.abs(best[1] - t0) < 1e-6) best[1] = t1;            // join touching pieces
      else if (!best || t1 - t0 > best[1] - best[0]) best = [t0, t1];
    }
    return best && best[1] - best[0] >= 0.25 ? best : null;
  };
  let rows = 0;
  feats.forEach(f => {
    if (f.type !== "stall_row") return;
    delete f.ends; delete f.segs;
    const pr = parts(f).find(x => x.k === "row"); if (!pr || (!segs.length && !noPaint.length)) return;
    const ends = []; let any = false;
    for (let i = 0; i <= pr.n; i++) {
      const s = add(pr.a, mul(sub(pr.b, pr.a), i / pr.n)), e = add(pr.qa, mul(sub(pr.qb, pr.qa), i / pr.n));
      const L = len(sub(e, s)), dir = unit(sub(e, s));
      let best = null;
      segs.forEach(([c1, c2]) => {
        const cd = sub(c2, c1), den = cross(dir, cd); if (Math.abs(den) < 1e-9) return;
        const w = sub(c1, s), t = cross(w, cd) / den, u = cross(w, dir) / den;
        if (u < 0 || u > 1 || t < 0.5 * L || t > (f.depthPx > 0 ? L : 1.35 * L)) return;
        if (best == null || t < best) best = t;
      });
      if (best != null) any = true;
      ends.push(toGrid(best != null ? add(s, mul(dir, best)) : e));
    }
    if (any) { f.ends = ends; rows++; }
    // cut each stripe off islands, medians, landscaping, sidewalks and buildings
    if (noPaint.length) {
      let touched = false;
      const sg = ends.map((eg, i) => {
        const s = add(pr.a, mul(sub(pr.b, pr.a), i / pr.n)), e = px(eg), keep = clipOff(s, e);
        if (!keep) { touched = true; offStats.removed++; return null; }
        if (keep[0] > 1e-6 || keep[1] < 1 - 1e-6) { touched = true; offStats.trimmed++; }
        const d = sub(e, s); return [toGrid(add(s, mul(d, keep[0]))), toGrid(add(s, mul(d, keep[1])))];
      });
      if (touched) f.segs = sg;
    }
  });
  return rows;
}
const offStats = { removed: 0, trimmed: 0 };
/* Drive aisle widths. Typical clear aisle widths with 9 ft stalls (one-way for angled stalls, two-way at 90 degrees).
   Local codes vary; these are sanity checks, not requirements. */
const AISLE_STD = { 90: [22, 26], 75: [20, 22], 60: [16, 18], 45: [12, 15] };
function aisleStd(angle) { const a = angle >= 82 ? 90 : angle >= 67 ? 75 : angle >= 52 ? 60 : 45; return { a, lo: AISLE_STD[a][0], hi: AISLE_STD[a][1] }; }
/* Measures the clear width between facing stall rows (stall end to stall end across each aisle). */
function aisleReport(feats) {
  const rows = [];
  feats.forEach((f, idx) => {
    if (f.type !== "stall_row") return;
    const pr = parts(f).find(p => p.k === "row"); if (!pr) return;
    const ang = f.angle != null ? Math.max(30, Math.min(90, +f.angle)) : 90 - Math.abs(pr.leanDeg);
    rows.push({ idx, pr, ang, count: Math.round(f.count) || pr.n, m: mul(add(pr.a, pr.b), .5), s: unit(sub(pr.qa, pr.a)),
      wPerp: len(sub(pr.b, pr.a)) / pr.n * Math.sin(ang * Math.PI / 180) });
  });
  const out = [], seen = new Set();
  rows.forEach((A, ia) => {
    let best = null;
    rows.forEach((B, ib) => {
      if (ia === ib || Math.abs(dot(A.pr.u, B.pr.u)) < 0.95) return;
      const dAB = sub(B.m, A.m);
      if (dot(dAB, A.s) >= 0 || dot(mul(dAB, -1), B.s) >= 0) return;          // the rows must face each other across an aisle
      const ext = r => { const t1 = dot(sub(r.pr.a, A.pr.a), A.pr.u), t2 = dot(sub(r.pr.b, A.pr.a), A.pr.u); return [Math.min(t1, t2), Math.max(t1, t2)]; };
      const ea = ext(A), eb = ext(B); if (Math.min(ea[1], eb[1]) - Math.max(ea[0], eb[0]) <= 0) return;   // and overlap along it
      const w = Math.abs(dot(dAB, [-A.pr.u[1], A.pr.u[0]]));
      if (!best || w < best.w) best = { B, w };
    });
    if (!best) return;
    const key = [A.idx, best.B.idx].sort((x, y) => x - y).join("-"); if (seen.has(key)) return; seen.add(key);
    const est = !S.pxPerFt, ft = est ? best.w / (A.wPerp || 1) * 9 : best.w / S.pxPerFt;
    const std = aisleStd(Math.min(A.ang, best.B.ang));
    out.push({ a: A.idx, b: best.B.idx, ca: A.count, cb: best.B.count, ft, est, std, narrow: ft < std.lo - 1 });
  });
  return out;
}
function aisleLines(feats) {
  const rep = aisleReport(feats);
  if (!rep.length) return "(no facing stall rows found to measure)";
  return rep.map(r => `- aisle between features ${r.a} and ${r.b} (${r.std.a}° stalls): about ${Math.round(r.ft)} ft${r.est ? " (estimated from stall width)" : ""}; typical ${r.std.lo}–${r.std.hi} ft${r.narrow ? "  <-- NARROW" : ""}`).join("\n");
}
function aisleNotes(feats) {
  return aisleReport(feats).filter(r => r.narrow).map(r =>
    `Drive aisle between the ${r.ca}-stall and ${r.cb}-stall rows comes out about ${Math.round(r.ft)} ft${r.est ? " (estimated)" : ""}, narrower than the typical ${r.std.lo}–${r.std.hi} ft for ${r.std.a}° stalls. Check the rows beside it against the photo.`);
}
/* The tidy-up run after every trace, review and retry. Returns notes for Tony. */
function finalizeTrace(t) {
  snapCenterLines(t.features);
  t.unclear.forEach(u => u.choices.forEach(c => snapCenterLines(c.features)));
  const notes = fixAllRows(t);
  offStats.removed = offStats.trimmed = 0;
  const n = connectStripes(t.features, t.features);
  if (offStats.removed || offStats.trimmed) notes.push(`Stripes kept off islands, medians and sidewalks: ${offStats.removed} removed, ${offStats.trimmed} cut back to the curb.`);
  t.unclear.forEach(u => u.choices.forEach(c => connectStripes(c.features, t.features.concat(c.features))));
  if (n) notes.push(`${n} stall row${n > 1 ? "s" : ""} run to the curb: stripes end exactly on the curb line.`);
  return notes.concat(inferLanes(t));
}
/* Angled pull-in stalls show which way traffic goes: the stall's back end leans in the direction of travel.
   Lanes beside angled rows are set one-way that way; returns notes for Tony. */
function inferLanes(t) {
  const rows = t.features.filter(f => f.type === "stall_row").map(f => parts(f).find(p => p.k === "row")).filter(r => r && Math.abs(r.leanDeg) >= 8);
  if (!rows.length) return [];
  let changed = 0, flipped = 0, mixed = 0;
  t.features.filter(f => f.type === "drive_lane" && f.points && f.points.length > 1).forEach(f => {
    const pts = f.points.map(px); let plus = 0, minus = 0;
    rows.forEach(r => {
      const mid = mul(add(r.a, r.b), .5), stripe = len(sub(r.qa, r.a));
      let best = null;
      for (let i = 1; i < pts.length; i++) { const d = distToSeg(mid, pts[i - 1], pts[i]); if (!best || d < best.d) best = { d, t: unit(sub(pts[i], pts[i - 1])) }; }
      if (!best || best.d > Math.max(stripe * 1.6, 0.04 * S.W) || Math.abs(dot(r.u, best.t)) < 0.7) return;
      dot(mul(r.u, Math.sign(r.leanDeg)), best.t) > 0 ? plus++ : minus++;
    });
    if (!plus && !minus) return;
    if (plus && minus) { mixed++; return; }
    const wasOne = f.flow === "one-way"; f.flow = "one-way"; if (!wasOne) changed++;
    if (minus) { f.points = f.points.slice().reverse(); if (wasOne) flipped++; }
  });
  const notes = [];
  if (changed) notes.push(`${changed} drive lane${changed > 1 ? "s" : ""} set to one-way to match the angled pull-in stalls beside ${changed > 1 ? "them" : "it"}.`);
  if (flipped) notes.push(`${flipped} one-way lane${flipped > 1 ? "s" : ""} turned around to match the stall angles.`);
  if (mixed) notes.push(`${mixed} lane${mixed > 1 ? "s have" : " has"} stalls angled both ways beside ${mixed > 1 ? "them" : "it"}; check the direction.`);
  return notes;
}
const centroid = pts => mul(pts.reduce((s, p) => add(s, p), [0, 0]), 1 / pts.length);

/* Turns one traced feature into drawable parts in image pixels. */
function parts(f) {
  const out = [], dashed = !!f.unconfirmed;
  const poly = (pts, closed, cls, label, extra) => out.push(Object.assign({ k: "poly", pts, closed, cls, label, dashed }, extra || {}));
  switch (f.type) {
    case "stall_row": {
      if (!isPt(f.p1) || !isPt(f.p2)) break;
      const a = px(f.p1), b = px(f.p2);
      const n = Math.max(1, Math.min(200, Math.round(f.count) || 1));
      const along = sub(b, a), u = mul(along, 1 / (len(along) || 1));
      // back ends of the first and last stripe: from count + angle + lean (preferred), given directly (q1, q2), or from depth + angle
      let qa, qb;
      if (f.angle != null || f.leanToward) {
        const g = rowGeom(f, a, b, n);
        qa = add(a, g.v); qb = add(b, g.v);
      }
      else if (isPt(f.q1) && isPt(f.q2)) { qa = px(f.q1); qb = px(f.q2); }
      else if (Array.isArray(f.depth)) {
        const d = [f.depth[0] / 1000 * S.W, f.depth[1] / 1000 * S.H], lean = mul(u, len(d) * Math.tan(((f.angleDeg || 0) * Math.PI) / 180));
        qa = add(add(a, d), lean); qb = add(add(b, d), lean);
      } else break;
      // stripe ends set by connectStripes (run to the curb) when present, else the straight row geometry
      const ends = Array.isArray(f.ends) && f.ends.length === n + 1 && f.ends.every(isPt) ? f.ends.map(px) : null;
      const segs = Array.isArray(f.segs) && f.segs.length === n + 1 ? f.segs : null;   // stripes clipped off islands (null = removed)
      for (let i = 0; i <= n; i++) {
        if (segs) { if (segs[i] && isPt(segs[i][0]) && isPt(segs[i][1])) poly([px(segs[i][0]), px(segs[i][1])], false, "stripe"); continue; }
        poly([add(a, mul(along, i / n)), ends ? ends[i] : add(qa, mul(sub(qb, qa), i / n))], false, "stripe");
      }
      const v = sub(qa, a), leanSin = Math.max(-1, Math.min(1, dot(v, u) / (len(v) || 1)));
      out.push({ k: "row", a, b, qa, qb, n, u, leanDeg: Math.asin(leanSin) * 180 / Math.PI, dashed });
      break;
    }
    case "stall_line": if (f.points && f.points.length > 1) poly(f.points.map(px), false, "stripe"); break;
    case "lot_edge": case "curb":
      if (f.points && f.points.length > 1) poly(f.points.map(px), !!f.closed, f.type); break;
    case "island":
      if (f.points && f.points.length > 2) poly(f.points.map(px), true, "island", f.label || "", { rounded: !!f.rounded, cornerR: +f.cornerR || 0, surface: String(f.surface || "") });
      break;
    case "building": case "aisle": case "ada_space":
      if (f.points && f.points.length > 2) poly(f.points.map(px), true, f.type, f.label || (f.type === "aisle" ? "DRIVE AISLE" : f.type === "ada_space" ? "ADA" : f.label)); break;
    case "drive_lane": if (f.points && f.points.length > 1) out.push({ k: "lane", pts: f.points.map(px), flow: f.flow === "one-way" ? "one" : "two", dashed }); break;
    case "landscape": if (f.points && f.points.length > 2) poly(f.points.map(px), true, "landscape", f.label === "" ? "" : (f.label || "LANDSCAPE")); break;
    case "hedge": if (f.points && f.points.length > 1) poly(f.points.map(px), false, "hedge"); break;
    case "paint_line": if (f.points && f.points.length > 1) poly(f.points.map(px), false, "paint", "", { color: f.color === "white" ? "white" : "yellow" }); break;
    case "hatch_area": if (f.points && f.points.length > 2) poly(f.points.map(px), true, "hatch", f.label || ""); break;
    case "sidewalk": if (f.points && f.points.length > 2) poly(f.points.map(px), true, "sidewalk"); break;
    case "tree": if (isPt(f.at)) out.push({ k: "tree", at: px(f.at), r: Math.max(4, (+f.r || 15)) / 1000 * S.W, dashed }); break;
    case "arrow": if (isPt(f.at)) out.push({ k: "arrow", at: px(f.at), ang: f.angleDeg || 0, dashed }); break;
    case "light_pole": case "stoplight": if (isPt(f.at)) out.push({ k: "sym", at: px(f.at), sym: f.type, dashed }); break;
    case "equipment":
      if (f.points && f.points.length > 2) poly(f.points.map(px), true, "equipment", f.label || "EQUIP.");
      else if (isPt(f.at)) out.push({ k: "sym", at: px(f.at), sym: "equipment", label: f.label || "EQUIP.", dashed });
      break;
    case "dimension": if (isPt(f.p1) && isPt(f.p2)) out.push({ k: "dim", a: px(f.p1), b: px(f.p2), what: f.what || "", dashed }); break;
  }
  return out;
}

/* All features of a round, with Tony's answers applied. */
function roundFeatures(r) {
  const feats = r.trace.features.slice(), checks = [];
  r.trace.unclear.forEach((u, i) => {
    const a = r.answers[u.id];
    if (a && a.kind === "choice") feats.push(...u.choices[a.idx].features);
    else if (a && a.kind === "traced") feats.push({ type: a.type, points: a.points, closed: a.type !== "lot_edge" && a.type !== "curb", label: a.label, at: centroidNorm(a.points) });
    else { feats.push(...u.choices[0].features.map(f => Object.assign({}, f, { unconfirmed: true })));
      checks.push(`Area ${i + 1}: ${u.question} Drawn dashed as "${u.choices[0].label}" (unconfirmed).`); }
  });
  return { feats, checks };
}
function centroidNorm(pts) { return centroid(pts); }

function levelFeatures(feats, level) {
  return feats.filter(f => {
    const g = TYPE_TOGGLE[f.type];
    if (g && !S.toggles[g]) return false;
    if (level === "A" && !BASIC.has(f.type)) return false;
    return true;
  });
}

/* ---------- sheet (SVG) ---------- */
const SHEET = { w: 3600, h: 2400, dx0: 60, dy0: 60, dw: 3000, dh: 2280, tx: 3090, tw: 450 };
function wrapText(s, n) {
  const words = String(s || "").split(/\s+/), lines = []; let cur = "";
  words.forEach(w => { if ((cur + " " + w).trim().length > n) { if (cur) lines.push(cur); cur = w; } else cur = (cur + " " + w).trim(); });
  if (cur) lines.push(cur); return lines;
}
function niceScale(pxPerFtSheet) {
  const opts = [5, 10, 20, 25, 50, 100, 200, 250, 500, 1000];
  for (const L of opts) if (L * pxPerFtSheet >= 260) return L;
  return 1000;
}
function fmtFt(ft) { return (Math.round(ft * 10) / 10).toFixed(1) + "'"; }

/* Radians to turn the drawing so the longest edge of Tony's border is level (0 when no border or nearly level). */
function sheetRotation() {
  if (!S.border) return 0;
  const bp = S.border.map(p => [p[0] / 1000 * S.W, p[1] / 1000 * S.H]);
  let best = null;
  bp.forEach((p, i) => { const q = bp[(i + 1) % bp.length], L = len(sub(q, p)); if (!best || L > best.L) best = { L, a: Math.atan2(q[1] - p[1], q[0] - p[0]) }; });
  let a = best.a;
  while (a > Math.PI / 2) a -= Math.PI;
  while (a <= -Math.PI / 2) a += Math.PI;
  return Math.abs(a) < 3 * Math.PI / 180 ? 0 : -a;
}
function renderSheet(r, level, ctx) {
  const W = S.W, H = S.H;
  // fit the sheet to Tony's 4-corner border when he set one, else to the whole image
  const bpx = S.border ? S.border.map(p => [p[0] / 1000 * W, p[1] / 1000 * H]) : null;
  // turn the drawing so the border's longest edge sits level on the sheet
  const rot = sheetRotation(), cs = Math.cos(rot), sn = Math.sin(rot), rotDeg = rot * 180 / Math.PI;
  const rc = bpx ? centroid(bpx) : [W / 2, H / 2];
  const R = p => rot ? [rc[0] + (p[0] - rc[0]) * cs - (p[1] - rc[1]) * sn, rc[1] + (p[0] - rc[0]) * sn + (p[1] - rc[1]) * cs] : p;
  const rb = bpx ? bpx.map(R) : null;
  const ext = rb ? [Math.min(...rb.map(p => p[0])), Math.min(...rb.map(p => p[1])), Math.max(...rb.map(p => p[0])), Math.max(...rb.map(p => p[1]))] : [0, 0, W, H];
  const bw = Math.max(1, ext[2] - ext[0]), bh = Math.max(1, ext[3] - ext[1]);
  const s = Math.min(SHEET.dw / bw, SHEET.dh / bh) * (bpx ? 0.96 : 1);
  const ox = SHEET.dx0 + (SHEET.dw - bw * s) / 2 - ext[0] * s, oy = SHEET.dy0 + (SHEET.dh - bh * s) / 2 - ext[1] * s;
  const T = p => { const q = R(p); return [ox + q[0] * s, oy + q[1] * s]; };
  // bare: just the sketch (no title block or frame), cropped to the drawing with room for the north arrow and scale
  const bare = !!ctx.bare;
  const CB = bare ? { x: ox + ext[0] * s - 50, y: oy + ext[1] * s - 170, w: bw * s + 100, h: bh * s + 300 } : { x: SHEET.dx0, y: SHEET.dy0, w: SHEET.dw, h: SHEET.dh };
  const P = p => T(p).map(v => v.toFixed(1)).join(",");
  const { feats, checks } = ctx.featsChecks;
  const list = levelFeatures(feats, level);
  // Drawing layers, bottom to top: pavement, landscaping, islands/buildings, trees, linework, lanes, symbols, dimensions, labels.
  const Ly = { pave: [], land: [], base: [], tree: [], lines: [], lane: [], sym: [], dim: [], label: [] };
  const g = Ly.sym;
  const STY = {
    lot_edge: 'stroke="#000" stroke-width="5.5" fill="none"', curb: 'stroke="#000" stroke-width="3.2" fill="none"',
    island: 'stroke="#000" stroke-width="3" fill="#FAFAF7"', building: 'stroke="#000" stroke-width="5.5" fill="url(#bldg)"',
    aisle: 'stroke="none" fill="#F8F9FA"', ada_space: 'stroke="#000" stroke-width="2" fill="url(#ada)"',
    equipment: 'stroke="#000" stroke-width="2.5" fill="#FFFFFF"', stripe: 'stroke="#000" stroke-width="2" fill="none"',
    landscape: 'stroke="#5F8752" stroke-width="2.2" fill="url(#grass)"',
    hatch: 'stroke="#000" stroke-width="1.6" fill="url(#hatchw)"', sidewalk: 'stroke="#000" stroke-width="2" fill="url(#conc)"',
    paint_yellow: 'stroke="#C99A1E" stroke-width="4" fill="none"', paint_white: 'stroke="#000" stroke-width="2" fill="none"'
  };
  const LAYER = { lot_edge: "lines", curb: "lines", stripe: "lines", hedge: "lines", island: "base", building: "base", aisle: "base",
    ada_space: "base", landscape: "land", equipment: "sym", hatch: "base", sidewalk: "land", paint: "lines" };
  const dash = d => d ? ' stroke-dasharray="16 10" opacity="0.75"' : "";
  const labels = [], dims = [];
  const pathOf = (pts, closed) => "M" + pts.map(P).join(" L") + (closed ? " Z" : "");
  // closed outline with corners rounded up to rad sheet units (curb noses on islands)
  const roundedPath = (sp, rad) => {
    const n = sp.length, f2 = q => q[0].toFixed(1) + "," + q[1].toFixed(1); let d = "";
    for (let i = 0; i < n; i++) {
      const p0 = sp[(i - 1 + n) % n], p1 = sp[i], p2 = sp[(i + 1) % n];
      const a = add(p1, mul(unit(sub(p0, p1)), Math.min(rad, len(sub(p1, p0)) / 2))), b = add(p1, mul(unit(sub(p2, p1)), Math.min(rad, len(sub(p2, p1)) / 2)));
      d += (i ? " L" : "M") + f2(a) + " Q" + f2(p1) + " " + f2(b);
    }
    return d + " Z";
  };
  const arrowGlyph = (c, u, L, col, w) => {
    const tip = add(c, mul(u, L)), tail = add(c, mul(u, -L)), nrm = [-u[1], u[0]];
    return `<path d="M${tail.join(",")} L${add(tip, mul(u, -12)).join(",")}" stroke="${col}" stroke-width="${w}" fill="none" stroke-linecap="round"/>`
      + `<path d="M${tip.join(",")} L${add(tip, add(mul(u, -18), mul(nrm, 9))).join(",")} L${add(tip, add(mul(u, -18), mul(nrm, -9))).join(",")} Z" fill="${col}"/>`;
  };
  const canopy = (cx, cy, r) => {
    const n = Math.max(7, Math.min(28, Math.round(r / 7))), ch = 2 * r * Math.sin(Math.PI / n), ar = (ch * 0.56).toFixed(1);
    let d = "";
    for (let i = 0; i <= n; i++) { const a = i / n * Math.PI * 2, x = (cx + r * Math.cos(a)).toFixed(1), y = (cy + r * Math.sin(a)).toFixed(1); d += i ? ` A${ar} ${ar} 0 0 1 ${x} ${y}` : `M${x} ${y}`; }
    return d + " Z";
  };
  list.forEach(f => parts(f).forEach(p => {
    if (p.k === "poly" && p.cls === "island") {
      // island: surface fill, rounded noses, and a double curb line
      // rounding never exceeds half the shortest side: a thin 4-corner island becomes a stadium, not an oval,
      // and a finely traced hook or L keeps its shape
      const sp = p.pts.map(T), minEdge = Math.min(...sp.map((q, i) => len(sub(sp[(i + 1) % sp.length], q))));
      const rad = p.cornerR ? p.cornerR / 1000 * S.W * s : (p.rounded ? minEdge / 2 : 6);
      const dd = roundedPath(sp, rad), sf = (p.surface + " " + (p.label || "")).toLowerCase();
      const fill = /mulch|rock|gravel/.test(sf) ? "url(#mulch)" : /landscap|grass|plant|turf|shrub/.test(sf) ? "url(#grass)" : "url(#conc)";
      Ly.base.push(`<path d="${dd}" fill="${fill}" stroke="none"/>`);
      Ly.lines.push(`<path d="${dd}" stroke="#000" stroke-width="7.5" fill="none" stroke-linejoin="round"${dash(p.dashed)}/><path d="${dd}" stroke="#fff" stroke-width="3.2" fill="none" stroke-linejoin="round"/>`);
      if (p.label) labels.push([T(centroid(p.pts)), p.label, 14, "#3E5F33"]);
      return;
    }
    if (p.k === "poly") {
      const d = pathOf(p.pts, p.closed);
      if (p.cls === "lot_edge" && p.closed && p.pts.length > 2) Ly.pave.push(`<path d="${d}" fill="#EEF0F2" stroke="none"/>`);
      if (p.cls === "hedge") {
        Ly.lines.push(`<path d="${d}" stroke="#A9C49B" stroke-width="16" fill="none" stroke-linecap="round" stroke-linejoin="round"${dash(p.dashed)}/>`
          + `<path d="${d}" stroke="#5F8752" stroke-width="7" stroke-dasharray="0.1 11" fill="none" stroke-linecap="round"/>`);
      } else Ly[LAYER[p.cls] || "lines"].push(`<path d="${d}" ${STY[p.cls === "paint" ? "paint_" + p.color : p.cls] || STY.curb}${dash(p.dashed)} stroke-linejoin="round" stroke-linecap="round"/>`);
      if (p.label && p.closed && p.cls !== "ada_space") {
        const lab = String(p.label), short = lab.length > 18 ? lab.slice(0, 17).trim() + "…" : lab;
        labels.push([T(centroid(p.pts)), short, p.cls === "aisle" ? 19 : 15, p.cls === "landscape" ? "#3E5F33" : "#222"]);
      }
      if (p.cls === "ada_space") labels.push([T(centroid(p.pts)), /van/i.test(p.label || "") ? "ADA VAN" : "ADA", 16, "#1F4E9A"]);
    } else if (p.k === "lane") {
      const pts = p.pts.map(T), col = "#3C3C3C";
      Ly.lane.push(`<path d="M${pts.map(q => q.map(v => v.toFixed(1)).join(",")).join(" L")}" stroke="#7A7A7A" stroke-width="1.8" stroke-dasharray="38 10 6 10" fill="none"${p.dashed ? ' opacity="0.6"' : ""}/>`);
      // direction marks every 260 sheet units along the centerline
      const segs = []; let total = 0;
      for (let i = 1; i < pts.length; i++) { const L = len(sub(pts[i], pts[i - 1])); segs.push([pts[i - 1], pts[i], total, L]); total += L; }
      for (let at = Math.min(130, total / 2); at < total; at += 260) {
        const sg = segs.find(s => at >= s[2] && at <= s[2] + s[3]); if (!sg || !sg[3]) continue;
        const u = mul(sub(sg[1], sg[0]), 1 / sg[3]), c = add(sg[0], mul(u, at - sg[2])), n = [-u[1], u[0]];
        if (p.flow === "one") Ly.lane.push(arrowGlyph(c, u, 26, col, 3));
        else { Ly.lane.push(arrowGlyph(add(c, mul(n, 20)), u, 22, col, 2.6)); Ly.lane.push(arrowGlyph(add(c, mul(n, -20)), mul(u, -1), 22, col, 2.6)); }
      }
    } else if (p.k === "tree") {
      const [x, y] = T(p.at), r = p.r * s;
      Ly.tree.push(`<g${p.dashed ? ' opacity="0.6"' : ""}><path d="${canopy(x, y, r)}" fill="#6F9460" fill-opacity="0.10" stroke="#6F9460" stroke-width="1.8" stroke-linejoin="round"/><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.5" fill="#6F9460"/></g>`);
    } else if (p.k === "arrow") {
      const c = T(p.at), a = (p.ang + rotDeg) * Math.PI / 180, u = [Math.sin(a), -Math.cos(a)];
      g.push(`<g${dash(p.dashed)}>${arrowGlyph(c, u, 34, "#000", 3.2)}</g>`);
    } else if (p.k === "sym") {
      const [x, y] = T(p.at);
      if (p.sym === "light_pole") g.push(`<g${dash(p.dashed)}><circle cx="${x}" cy="${y}" r="11" stroke="#000" stroke-width="2.4" fill="#fff"/><path d="M${x - 16},${y} L${x + 16},${y} M${x},${y - 16} L${x},${y + 16}" stroke="#000" stroke-width="1.6"/></g>`);
      else if (p.sym === "stoplight") g.push(`<g${dash(p.dashed)}><rect x="${x - 8}" y="${y - 19}" width="16" height="38" stroke="#000" stroke-width="2.2" fill="#fff"/><circle cx="${x}" cy="${y - 10}" r="4" fill="#000"/><circle cx="${x}" cy="${y}" r="4" fill="#000"/><circle cx="${x}" cy="${y + 10}" r="4" fill="#000"/></g>`);
      else { g.push(`<rect x="${x - 16}" y="${y - 12}" width="32" height="24" stroke="#000" stroke-width="2.4" fill="#fff"${dash(p.dashed)}/><path d="M${x - 16},${y - 12} L${x + 16},${y + 12}" stroke="#000" stroke-width="1.4"/>`);
        labels.push([[x, y + 34], p.label || "EQUIP.", 15]); }
    } else if (p.k === "dim" && ctx.dims) dims.push({ a: p.a, b: p.b, text: p.what });
    else if (p.k === "row" && level === "B") {
      const w0 = mul(sub(p.b, p.a), 1 / p.n), back1 = add(p.qa, mul(sub(p.qb, p.qa), 1 / p.n));
      if (ctx.dims) {
        dims.push({ a: p.a, b: add(p.a, w0), text: "", off: -1 });
        dims.push({ a: add(p.a, w0), b: back1, text: "", off: 1 });
      }
      // stall angle to the aisle, for angled rows (90 degrees means straight in)
      if (S.toggles.dims && Math.abs(p.leanDeg) >= 8) {
        const m = mul(add(add(p.a, w0), back1), .5);
        labels.push([add(T(m), [0, -2]), `${Math.round(90 - Math.abs(p.leanDeg))}°`, 15, "#222"]);
      }
    }
  }));
  // dimensions (Full only, needs scale)
  if (level === "B" && ctx.dims) dims.forEach(dm => {
    const a = T(dm.a), b = T(dm.b), v = sub(b, a), L = len(v); if (L < 8) return;
    const u = mul(v, 1 / L), n = mul([-u[1], u[0]], 22 * (dm.off || 1));
    const a2 = add(a, n), b2 = add(b, n), mid = mul(add(a2, b2), .5);
    const ft = len(sub(dm.b, dm.a)) / S.pxPerFt;
    let ang = Math.atan2(v[1], v[0]) * 180 / Math.PI; if (ang > 90) ang -= 180; if (ang < -90) ang += 180;
    Ly.dim.push(`<path d="M${a.join(",")} L${a2.join(",")} M${b.join(",")} L${b2.join(",")} M${a2.join(",")} L${b2.join(",")}" stroke="#333" stroke-width="1.1" fill="none"/>`
      + `<path d="M${add(a2, add(mul(u, 6), mul(n, .3))).join(",")} L${add(a2, add(mul(u, -6), mul(n, -.3))).join(",")} M${add(b2, add(mul(u, 6), mul(n, .3))).join(",")} L${add(b2, add(mul(u, -6), mul(n, -.3))).join(",")}" stroke="#333" stroke-width="2.2"/>`
      + `<text x="${mid[0]}" y="${mid[1] - 6}" transform="rotate(${ang.toFixed(1)} ${mid[0]} ${mid[1]})" font-size="15" text-anchor="middle" fill="#333">${esc(fmtFt(ft))} approx.${dm.text ? " " + esc(dm.text) : ""}</text>`);
  });
  labels.forEach(([c, t, fs, col]) => Ly.label.push(`<text x="${c[0].toFixed(1)}" y="${c[1].toFixed(1)}" font-size="${fs}" text-anchor="middle" dominant-baseline="middle" fill="${col || "#222"}" font-weight="bold" letter-spacing="1" stroke="#fff" stroke-width="5" stroke-linejoin="round" paint-order="stroke">${esc(String(t).toUpperCase())}</text>`));

  // north arrow
  let northNote = "";
  if (S.toggles.north) {
    const nt = S.north || r.trace.north;
    const ang = (nt.found ? (nt.angleDeg || 0) : 0) + rotDeg;
    if (!nt.found) northNote = "North assumed to be the top of the image.";
    const cx = CB.x + CB.w - (bare ? 70 : 90), cy = CB.y + (bare ? 80 : 100);
    g.push(`<g transform="rotate(${ang} ${cx} ${cy})"><circle cx="${cx}" cy="${cy}" r="46" stroke="#000" stroke-width="2.5" fill="#fff"/><path d="M${cx},${cy - 40} L${cx + 16},${cy + 22} L${cx},${cy + 10} L${cx - 16},${cy + 22} Z" fill="#000"/><text x="${cx}" y="${cy - 52}" font-size="26" font-weight="bold" text-anchor="middle">N</text></g>`);
  }
  // graphic scale
  let scaleText = "NOT TO SCALE";
  if (S.pxPerFt) {
    const sheetPerFt = S.pxPerFt * s, L = niceScale(sheetPerFt), w = L * sheetPerFt;
    const x0 = CB.x + 40, y0 = CB.y + CB.h - 60;
    g.push(`<g><rect x="${x0}" y="${y0}" width="${w / 2}" height="12" fill="#000"/><rect x="${x0 + w / 2}" y="${y0}" width="${w / 2}" height="12" fill="#fff" stroke="#000" stroke-width="2"/>`
      + `<text x="${x0}" y="${y0 - 10}" font-size="17">0</text><text x="${x0 + w / 2}" y="${y0 - 10}" font-size="17" text-anchor="middle">${L / 2}'</text><text x="${x0 + w}" y="${y0 - 10}" font-size="17" text-anchor="middle">${L}'</text>`
      + `<text x="${x0}" y="${y0 + 40}" font-size="17" font-weight="bold">GRAPHIC SCALE (APPROX.)</text></g>`);
    scaleText = "GRAPHIC, APPROX.";
  }

  const defs = `<defs><pattern id="bldg" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="14" height="14" fill="#fff"/><line x1="0" y1="0" x2="0" y2="14" stroke="#9A9A9A" stroke-width="2"/></pattern>`
    + `<pattern id="ada" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)"><rect width="10" height="10" fill="#fff"/><line x1="0" y1="0" x2="0" y2="10" stroke="#555" stroke-width="2"/></pattern>`
    + `<pattern id="hatchw" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="12" height="12" fill="#FFFFFF"/><line x1="0" y1="0" x2="0" y2="12" stroke="#333" stroke-width="2.4"/></pattern>`
    + `<pattern id="conc" width="18" height="18" patternUnits="userSpaceOnUse"><rect width="18" height="18" fill="#F3F3F0"/><circle cx="4" cy="5" r="1.1" fill="#B5B5AF"/><circle cx="13" cy="11" r="0.9" fill="#B5B5AF"/><circle cx="8" cy="15.5" r="0.7" fill="#C6C6C0"/></pattern>`
    + `<pattern id="mulch" width="16" height="16" patternUnits="userSpaceOnUse"><rect width="16" height="16" fill="#EFE7DB"/><circle cx="3" cy="4" r="1.3" fill="#B39A78"/><circle cx="11" cy="9" r="1.1" fill="#A88E6B"/><circle cx="6" cy="13" r="0.9" fill="#B39A78"/></pattern>`
    + `<pattern id="grass" width="24" height="24" patternUnits="userSpaceOnUse"><rect width="24" height="24" fill="#E6EFDF"/><path d="M4,9 l2,-4 l2,4 M15,20 l2,-4 l2,4 M16,7 l1.5,-3 l1.5,3 M5,21 l1.5,-3 l1.5,3" stroke="#7FA36B" stroke-width="1.2" fill="none"/></pattern></defs>`;
  const drawing = (bpx ? `<clipPath id="sketch-limit"><path d="${pathOf(bpx, true)}"/></clipPath>` : "")
    + `<g${bpx ? ' clip-path="url(#sketch-limit)"' : ""}>` + ["pave", "land", "base", "tree", "lines", "lane", "dim", "label"].map(k => Ly[k].join("")).join("") + `</g>`;
  if (bare) {
    const nt0 = S.north || r.trace.north;
    ctx.meta = { ppf: S.pxPerFt ? S.pxPerFt * s : 0, north: (nt0 && nt0.found ? (nt0.angleDeg || 0) : 0) + rotDeg };
    const vb = [CB.x, CB.y, CB.w, CB.h].map(v => v.toFixed(1)).join(" ");
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" width="${Math.round(CB.w)}" height="${Math.round(CB.h)}" font-family="Arial, Helvetica, sans-serif">`
      + defs + `<rect x="${CB.x}" y="${CB.y}" width="${CB.w}" height="${CB.h}" fill="#fff"/>` + drawing + Ly.sym.join("") + `</svg>`;
  }

  // title block
  const tx = SHEET.tx, tw = SHEET.tw, X = tx + 22;
  const tb = [];
  const hr = y => tb.push(`<line x1="${tx}" y1="${y}" x2="${tx + tw}" y2="${y}" stroke="#000" stroke-width="2"/>`);
  const lab = (y, t) => tb.push(`<text x="${X}" y="${y}" font-size="14" letter-spacing="1.5" fill="#444">${esc(t)}</text>`);
  const val = (y, t, fs) => tb.push(`<text x="${X}" y="${y}" font-size="${fs || 22}" font-weight="bold">${esc(t)}</text>`);
  tb.push(`<rect x="${tx}" y="60" width="${tw}" height="2280" fill="#fff" stroke="#000" stroke-width="3"/>`);
  tb.push(`<text x="${X}" y="140" font-size="64" font-weight="bold" letter-spacing="2">HiON</text>`);
  hr(175);
  val(222, "AERIAL SITE SKETCH", 28); val(256, "EXISTING CONDITIONS", 20);
  hr(285);
  let y = 322;
  const proj = ctx.project || "NOT SET";
  lab(y, "PROJECT NO."); val(y + 30, proj, 24); y += 70;
  lab(y, "SITE"); wrapText(ctx.site, 26).slice(0, 2).forEach((l, i) => val(y + 30 + i * 28, l)); y += 96;
  lab(y, "CUSTOMER"); wrapText(ctx.customer, 26).slice(0, 2).forEach((l, i) => val(y + 30 + i * 28, l)); y += 96;
  lab(y, "ADDRESS"); wrapText(ctx.address, 30).slice(0, 3).forEach((l, i) => val(y + 28 + i * 26, l, 19)); y += 116;
  hr(y - 20);
  lab(y + 10, "OPTION"); val(y + 40, level === "A" ? "A · BASIC" : "B · FULL", 24);
  lab(y + 80, "ROUND"); val(y + 108, String(ctx.round));
  tb.push(`<text x="${X + 200}" y="${y + 90}" font-size="14" letter-spacing="1.5" fill="#444">SCALE</text><text x="${X + 200}" y="${y + 118}" font-size="18" font-weight="bold">${esc(scaleText)}</text>`);
  y += 145; hr(y);
  // legend
  y += 34; lab(y, "LEGEND"); y += 18;
  const leg = (t, svg) => { tb.push(svg(X + 20, y + 16) + `<text x="${X + 60}" y="${y + 22}" font-size="16">${esc(t)}</text>`); y += 33; };
  leg("Lot border", (x, yy) => `<rect x="${x - 18}" y="${yy - 9}" width="36" height="18" fill="#EEF0F2" stroke="#000" stroke-width="4"/>`);
  leg("Parking stripe", (x, yy) => `<line x1="${x - 18}" y1="${yy}" x2="${x + 18}" y2="${yy}" stroke="#000" stroke-width="2"/>`);
  leg("Curb", (x, yy) => `<line x1="${x - 18}" y1="${yy}" x2="${x + 18}" y2="${yy}" stroke="#000" stroke-width="3.2"/>`);
  if (S.toggles.parking) {
    leg("Painted line (yellow)", (x, yy) => `<line x1="${x - 18}" y1="${yy}" x2="${x + 18}" y2="${yy}" stroke="#C99A1E" stroke-width="4"/>`);
    leg("Striped area / crosswalk", (x, yy) => `<rect x="${x - 18}" y="${yy - 9}" width="36" height="18" fill="url(#hatchw)" stroke="#000" stroke-width="1.6"/>`);
  }
  if (S.toggles.curbs) leg("Sidewalk", (x, yy) => `<rect x="${x - 18}" y="${yy - 7}" width="36" height="14" fill="url(#conc)" stroke="#000" stroke-width="2"/>`);
  if (S.toggles.curbs) leg("Island (curbed)", (x, yy) => `<rect x="${x - 18}" y="${yy - 9}" width="36" height="18" rx="9" fill="url(#grass)" stroke="#000" stroke-width="6"/><rect x="${x - 18}" y="${yy - 9}" width="36" height="18" rx="9" fill="none" stroke="#fff" stroke-width="2.4"/>`);
  if (S.toggles.aisles) {
    leg("Drive lane, one-way", (x, yy) => `<line x1="${x - 20}" y1="${yy}" x2="${x + 20}" y2="${yy}" stroke="#7A7A7A" stroke-width="1.6" stroke-dasharray="12 4 3 4"/><path d="M${x + 8},${yy - 7} L${x + 20},${yy} L${x + 8},${yy + 7} Z" fill="#3C3C3C"/>`);
    leg("Drive lane, two-way", (x, yy) => `<line x1="${x - 20}" y1="${yy}" x2="${x + 20}" y2="${yy}" stroke="#7A7A7A" stroke-width="1.6" stroke-dasharray="12 4 3 4"/><path d="M${x + 6},${yy - 13} L${x + 18},${yy - 8} L${x + 6},${yy - 3} Z M${x - 6},${yy + 3} L${x - 18},${yy + 8} L${x - 6},${yy + 13} Z" fill="#3C3C3C"/>`);
  }
  if (S.toggles.landscape) leg("Landscaping", (x, yy) => `<rect x="${x - 18}" y="${yy - 10}" width="36" height="20" fill="url(#grass)" stroke="#5F8752" stroke-width="2"/>`);
  if (S.toggles.trees) leg("Tree (outline only)", (x, yy) => `<circle cx="${x}" cy="${yy}" r="12" fill="#6F9460" fill-opacity="0.12" stroke="#6F9460" stroke-width="1.8"/><circle cx="${x}" cy="${yy}" r="2.5" fill="#6F9460"/>`);
  leg("Unconfirmed (dashed)", (x, yy) => `<line x1="${x - 18}" y1="${yy}" x2="${x + 18}" y2="${yy}" stroke="#000" stroke-width="3" stroke-dasharray="10 6"/>`);
  if (level === "B") {
    leg("Parking lot light", (x, yy) => `<circle cx="${x}" cy="${yy}" r="9" stroke="#000" stroke-width="2" fill="#fff"/><path d="M${x - 13},${yy} L${x + 13},${yy} M${x},${yy - 13} L${x},${yy + 13}" stroke="#000" stroke-width="1.4"/>`);
    leg("Stoplight", (x, yy) => `<rect x="${x - 6}" y="${yy - 14}" width="12" height="28" stroke="#000" stroke-width="2" fill="#fff"/>`);
    leg("Equipment", (x, yy) => `<rect x="${x - 13}" y="${yy - 10}" width="26" height="20" stroke="#000" stroke-width="2" fill="#fff"/><path d="M${x - 13},${yy - 10} L${x + 13},${yy + 10}" stroke="#000" stroke-width="1.2"/>`);
    leg("ADA space", (x, yy) => `<rect x="${x - 15}" y="${yy - 11}" width="30" height="22" stroke="#000" stroke-width="2" fill="url(#ada)"/>`);
  }
  hr(y + 6);
  // notes
  y += 40; lab(y, "NOTES"); y += 8;
  const notes = ["Existing conditions only, traced from an aerial image.",
    (S.toggles.trees ? "Trees shown as light outlines only; " : "Trees left out; ") + "lines under trees continued from visible pattern."];
  if (S.pxPerFt) notes.push("All dimensions approximate. " + (S.scaleSource || ""));
  if (northNote) notes.push(northNote);
  if (rot) notes.push(`Drawing turned ${Math.abs(Math.round(rotDeg))}° to sit square on the sheet; the north arrow is turned to match.`);
  (r.trace.laneNotes || []).forEach(n => notes.push(n));
  checks.forEach(c => notes.push(c));
  let ni = 1;
  for (const n of notes) {
    const ls = wrapText(n, 44); if (y + 22 * ls.length > 1880) { tb.push(`<text x="${X}" y="${y + 24}" font-size="15">More notes in the page's "Check these" list.</text>`); break; }
    ls.forEach((l, i) => tb.push(`<text x="${X + (i ? 22 : 0)}" y="${y + 24 + i * 21}" font-size="15">${i ? "" : ni + ". "}${esc(l)}</text>`));
    y += 22 * ls.length + 6; ni++;
  }
  // disclaimer
  tb.push(`<rect x="${tx + 12}" y="1900" width="${tw - 24}" height="200" fill="#fff" stroke="#000" stroke-width="4"/>`);
  tb.push(`<text x="${tx + tw / 2}" y="1955" font-size="30" font-weight="bold" text-anchor="middle">${NOTE[0]}</text>`);
  tb.push(`<text x="${tx + tw / 2}" y="2005" font-size="21" text-anchor="middle">${NOTE[1]}</text>`);
  tb.push(`<text x="${tx + tw / 2}" y="2040" font-size="21" text-anchor="middle">${NOTE[2]}</text>`);
  hr(2120);
  lab(2152, "DATE"); val(2182, ctx.date);
  tb.push(`<text x="${X + 200}" y="2152" font-size="14" letter-spacing="1.5" fill="#444">REV</text><text x="${X + 200}" y="2182" font-size="22" font-weight="bold">${esc(String(ctx.rev))}</text>`);
  hr(2210);
  lab(2240, "SHEET"); tb.push(`<text x="${X}" y="2310" font-size="60" font-weight="bold">SK-1</text>`);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SHEET.w} ${SHEET.h}" width="${SHEET.w}" height="${SHEET.h}" font-family="Arial, Helvetica, sans-serif">`
    + defs
    + `<rect width="${SHEET.w}" height="${SHEET.h}" fill="#fff"/>`
    + `<rect x="30" y="30" width="${SHEET.w - 60}" height="${SHEET.h - 60}" fill="none" stroke="#000" stroke-width="4"/>`
    + `<rect x="${SHEET.dx0}" y="${SHEET.dy0}" width="${SHEET.dw}" height="${SHEET.dh}" fill="none" stroke="#000" stroke-width="1.5"/>`
    + drawing
    + (bpx ? `<path d="${pathOf(bpx, true)}" fill="none" stroke="#555" stroke-width="2.2" stroke-dasharray="44 12 8 12"/>`
      + `<text x="${T(bpx[0])[0].toFixed(1)}" y="${(T(bpx[0])[1] - 12).toFixed(1)}" font-size="16" font-weight="bold" letter-spacing="2" fill="#555" stroke="#fff" stroke-width="5" paint-order="stroke">LIMIT OF SKETCH</text>` : "")
    + Ly.sym.join("")
    + tb.join("") + `</svg>`;
}

/* ---------- options view ---------- */
function sheetCtx(r) {
  const d = new Date();
  return {
    featsChecks: roundFeatures(r), round: r.n, dims: !!(S.toggles.dims && S.pxPerFt),
    project: S.project ? S.project.number : "", site: S.inputs.site, customer: S.inputs.customer, address: S.inputs.address,
    rev: S.inputs.rev, date: `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}/${d.getFullYear()}`
  };
}
function renderOptions() {
  const r = S.rounds[S.view]; if (!r) return;
  const ctx = sheetCtx(r);
  $("#sheetA").innerHTML = renderSheet(r, "A", ctx);
  $("#sheetB").innerHTML = renderSheet(r, "B", ctx);
  $("#exA").hidden = $("#exB").hidden = !S.example;
  ["A", "B"].forEach(L => $("#opt" + L).classList.toggle("chosen", S.picked === L && !S.example));
  // differences
  const a = levelFeatures(ctx.featsChecks.feats, "A"), b = levelFeatures(ctx.featsChecks.feats, "B"), cnt = {};
  b.forEach(f => { if (!BASIC.has(f.type)) cnt[f.type] = (cnt[f.type] || 0) + 1; });
  const extra = Object.keys(cnt).map(k => `${cnt[k]} ${TYPE_NAME[k]}`);
  const vans = b.filter(f => f.type === "ada_space" && /van/i.test(f.label || "")).length;
  if (vans) extra.push(`${vans} of the ADA spaces van accessible`);
  if (ctx.dims) extra.push("stall width and depth on every row");
  const stalls = a.filter(f => f.type === "stall_row").reduce((s, f) => s + (Math.round(f.count) || 0), 0);
  const has = t => a.some(f => f.type === t);
  const both = [`${stalls} stalls in ${a.filter(f => f.type === "stall_row").length} rows`, has("lot_edge") && "the lot border", (has("drive_lane") || has("aisle")) && "drive lanes with direction",
    (has("landscape") || has("hedge")) && "landscaping", has("tree") && "tree outlines", (has("curb") || has("island")) && "curbs and islands", has("building") && "buildings"].filter(Boolean);
  $("#diff").innerHTML = [`Both: ${both.join(", ")}.`,
    extra.length ? "Option B adds: " + extra.join(", ") + "." : "Option B adds nothing more for this site with the items you turned on."]
    .map(t => `<li>${esc(t)}</li>`).join("");
  const checks = ctx.featsChecks.checks.slice();
  (r.trace.laneNotes || []).forEach(n => checks.push(n));
  if (S.toggles.north && !(S.north || r.trace.north).found) checks.push("North is assumed to be the top of the image.");
  if (!S.pxPerFt) checks.push("No scale: the sketch is marked Not To Scale and has no dimensions.");
  if (!S.example && !S.project) checks.push("No project number yet. Pick or type one in step 2.");
  if (r.trace.declined && r.trace.declined.length) checks.push("Left out (not in the photo): " + r.trace.declined.join("; "));
  if (r.trace.notes) checks.push("Claude's note: " + r.trace.notes);
  $("#checklist").innerHTML = (checks.length ? checks : ["Nothing to check."]).map(t => `<li>${esc(t)}</li>`).join("");
  // a pass that did not finish
  const miss = (!S.example && r.trace.missing) ? r.trace.missing : [];
  $("#pass-retry").hidden = !miss.length;
  if (miss.length) {
    $("#pass-retry-msg").textContent = `${miss.map(f => PASS_LABEL[f]).join(" and ")} did not finish, so ${miss.includes("site") ? "curbs, islands, lanes and landscaping" : "stall rows and paint"} ${miss.length > 1 ? "and more " : ""}are missing from these options. Run it again to add ${miss.length > 1 ? "them" : "it"}.`;
    $("#pass-retry-btn").disabled = S.busy;
  }
  // rounds
  $("#rounds-row").hidden = S.rounds.length < 2 || S.example;
  $("#rounds").innerHTML = S.rounds.map((x, i) => `<button type="button" data-i="${i}" aria-pressed="${i === S.view}">Round ${x.n}</button>`).join("");
  $("#pickA").textContent = S.picked === "A" && !S.example ? "Picked A" : "Pick A";
  $("#pickB").textContent = S.picked === "B" && !S.example ? "Picked B" : "Pick B";
  $("#pickA").disabled = $("#pickB").disabled = S.example || S.busy;
  $("#regen").disabled = $("#reborder").disabled = S.example || S.busy || !S.rounds.length;
  $("#opt-hint").textContent = S.example ? "This example shows what you get: Option A is Basic, Option B is Full. Start with your own image in step 1."
    : "Option A is Basic and Option B is Full. Click a sketch to see it larger. Pick one, or add detail and regenerate.";
}
$("#rounds").addEventListener("click", e => { const b = e.target.closest("button[data-i]"); if (!b) return; S.view = +b.dataset.i; S.picked = null; $("#s-download").hidden = true; renderOptions(); });
$("#pickA").addEventListener("click", () => pick("A"));
$("#pickB").addEventListener("click", () => pick("B"));
function pick(L) {
  S.picked = L; renderOptions();
  $("#s-download").hidden = false; $("#dl-name").textContent = "Files will be named " + baseName() + ".";
  $("#dl-msg").className = "msg";
  $("#s-download").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  edShow();
}
$("#regen").addEventListener("click", guard("regenerating", async () => {
  if (S.busy || !S.rounds.length) return;
  $("#regen-msg").textContent = ""; $("#s-download").hidden = true;
  const detail = $("#detail").value.trim();
  if (!detail) { $("#regen-msg").textContent = "Add some detail first, so the new options can differ."; return; }
  await runRound(detail);
}));
$("#pass-retry-btn").addEventListener("click", guard("running the pass again", () => retryMissing()));
$("#reborder").addEventListener("click", guard("redrawing the border", async () => {
  if (S.busy || !S.rounds.length) return;
  $("#regen-msg").textContent = ""; $("#s-download").hidden = true;
  S.busy = true; setBusy(true);
  $("#p-border").scrollIntoView({ block: "center" });
  await settleBorder();
  S.busy = false;
  await runRound($("#detail").value.trim());
}));

/* ---------- scale ---------- */
function boxAround(a, b, pad) { return [Math.min(a[0], b[0]) - pad, Math.min(a[1], b[1]) - pad, Math.max(a[0], b[0]) + pad, Math.max(a[1], b[1]) + pad]; }
function settleScale(trace) {
  const sb = trace.scaleBar;
  const bar = (sb && sb.found && isPt(sb.p1) && isPt(sb.p2) && sb.lengthFt > 0 && len(sub(px(sb.p1), px(sb.p2))) > 4) ? sb : null;
  if (!bar && !S.toggles.dims) { prog("scale", "skip", "no scale bar; dimensions are off"); return Promise.resolve(); }
  prog("scale", "need", bar ? "check the scale bar" : "no scale bar found");
  $("#p-scale").hidden = false;
  $("#p-scale").scrollIntoView({ block: "start" });
  const cv = $("#scale-canvas"), zm = ZOOM.scale;
  return new Promise(resolve => {
    let mode = bar ? "bar" : "mark";
    const pts = [], ftIn = $("#scale-ft"); ftIn.value = "";
    const barText = bar ? (bar.reading || bar.lengthFt + " ft") : "";
    const label = () => mode === "bar" ? barText + " (scale bar)" : (parseFloat(ftIn.value) > 0 ? ftIn.value + " ft" : "? ft");
    const draw = () => drawImageCanvas(cv, null, mode === "bar" ? [bar.p1, bar.p2] : pts, false, (mode === "bar" || pts.length === 2) ? label() : "");
    const check = () => { $("#scale-use").disabled = !(pts.length === 2 && parseFloat(ftIn.value) > 0); };
    const setMode = m => {
      mode = m;
      $("#scale-bar-row").hidden = m !== "bar"; $("#scale-mark").hidden = m !== "mark";
      $("#scale-msg").textContent = m === "bar"
        ? `Claude found a scale bar that reads ${barText}. It is marked in yellow with its length. Zoom in and check that the mark lines up with the bar.`
        : "Click two points that you know the real distance between, for example both ends of a stall stripe row, then type that distance. Zoom in to place the points exactly. The length you type shows on the image.";
      draw();
      if (m === "bar") zm.focus(boxAround(bar.p1, bar.p2, 60)); else zm.fit();
    };
    setMode(mode);
    cv.onclick = e => { if (mode !== "mark") return; if (pts.length >= 2) pts.length = 0; pts.push(canvasNorm(cv, e)); draw(); check(); };
    ftIn.oninput = () => { draw(); check(); };
    const done = (note, state) => { $("#p-scale").hidden = true; cv.onclick = null; prog("scale", state || "done", note); resolve(); };
    $("#scale-bar-use").onclick = () => {
      S.pxPerFt = len(sub(px(bar.p1), px(bar.p2))) / bar.lengthFt;
      S.scaleSource = `Scale from the image's scale bar (${barText}).`; done(S.scaleSource);
    };
    $("#scale-bar-own").onclick = () => setMode("mark");
    $("#scale-clear").onclick = () => { pts.length = 0; draw(); check(); };
    $("#scale-use").onclick = () => {
      const d = len(sub(px(pts[0]), px(pts[1]))), ft = parseFloat(ftIn.value);
      if (!(d > 4 && ft > 0)) return;
      S.pxPerFt = d / ft; S.scaleSource = `Scale from a ${ft} ft length Tony marked on the image.`; done(S.scaleSource);
    };
    $("#scale-skip").onclick = () => { S.pxPerFt = null; done(`no known length: estimated from ${CD50.STALL_FT} ft stalls after tracing`, "skip"); };
  });
}

/* ---------- canvases and zoom ---------- */
function canvasNorm(cv, e) {
  const r = cv.getBoundingClientRect();
  return [Math.max(0, Math.min(1000, (e.clientX - r.left) / r.width * 1000)), Math.max(0, Math.min(1000, (e.clientY - r.top) / r.height * 1000))];
}
/* Zoom for a scrolling box: the inner element grows wider, the box scrolls. */
function makeZoom(box, inner, aspect) {
  let z = 1;
  const apply = (nz, fx, fy) => {
    z = Math.max(1, Math.min(10, nz)); inner.style.width = (z * 100) + "%";
    requestAnimationFrame(() => { box.scrollLeft = fx * inner.clientWidth - box.clientWidth / 2; box.scrollTop = fy * inner.clientHeight - box.clientHeight / 2; });
  };
  const center = () => [(box.scrollLeft + box.clientWidth / 2) / (inner.clientWidth || 1), (box.scrollTop + box.clientHeight / 2) / (inner.clientHeight || 1)];
  box.addEventListener("wheel", e => {
    if (!e.ctrlKey && !e.metaKey) return; e.preventDefault();
    const r = inner.getBoundingClientRect(); apply(z * (e.deltaY < 0 ? 1.25 : 0.8), (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
  }, { passive: false });
  return {
    zin() { const c = center(); apply(z * 1.6, c[0], c[1]); }, zout() { const c = center(); apply(z / 1.6, c[0], c[1]); }, fit() { apply(1, .5, .5); },
    focus(b) { // b: box on the 0-1000 grid
      const w = Math.max(10, b[2] - b[0]) / 1000, h = Math.max(10, b[3] - b[1]) / 1000, ar = aspect ? aspect() : 1;
      const nz = Math.min(box.clientWidth / (w * box.clientWidth), (box.clientHeight || 400) / (h * box.clientWidth / ar));
      apply(Math.min(8, nz * 0.85), (b[0] + b[2]) / 2000, (b[1] + b[3]) / 2000);
    }
  };
}
const imgAspect = () => (S.W && S.H) ? S.W / S.H : 1;
const ZOOM = { scale: makeZoom($("#scale-box"), $("#scale-canvas"), imgAspect), q: makeZoom($("#q-box"), $("#q-canvas"), imgAspect),
  border: makeZoom($("#border-box"), $("#border-canvas"), imgAspect),
  viewer: makeZoom($("#viewer-box"), $("#viewer-inner"), () => SHEET.w / SHEET.h) };
/* larger view of an option */
["A", "B"].forEach(L => $("#sheet" + L).addEventListener("click", () => {
  const dlg = $("#viewer");
  $("#viewer-title").textContent = (L === "A" ? "Option A · Basic" : "Option B · Full") + (S.example ? " (example)" : "");
  $("#viewer-inner").innerHTML = $("#sheet" + L).innerHTML;
  try { dlg.showModal(); } catch (e) { dlg.setAttribute("open", ""); }
  ZOOM.viewer.fit();
}));
$("#viewer-close").addEventListener("click", () => { const d = $("#viewer"); try { d.close(); } catch (e) { d.removeAttribute("open"); } });
ROOT.querySelectorAll(".zoombar").forEach(bar => bar.addEventListener("click", e => {
  const b = e.target.closest("button[data-z]"); if (!b) return;
  const zm = ZOOM[bar.dataset.for]; if (!zm) return;
  ({ in: () => zm.zin(), out: () => zm.zout(), fit: () => zm.fit(), area: () => zm.area && zm.area() })[b.dataset.z]();
}));
function drawImageCanvas(cv, bbox, pts, closed, dimLabel) {
  const maxW = 3000, k = Math.min(1, maxW / S.W);
  cv.width = Math.round(S.W * k); cv.height = Math.round(S.H * k);
  const c = cv.getContext("2d");
  c.drawImage(S.imgEl, 0, 0, cv.width, cv.height);
  const N = p => [p[0] / 1000 * cv.width, p[1] / 1000 * cv.height];
  const lw = Math.max(2, cv.width / 400);
  if (bbox) {
    const [x1, y1] = N([bbox[0], bbox[1]]), [x2, y2] = N([bbox[2], bbox[3]]);
    c.fillStyle = "rgba(0,0,0,0.45)";
    c.beginPath(); c.rect(0, 0, cv.width, cv.height); c.rect(x1, y1, x2 - x1, y2 - y1); c.fill("evenodd");
    c.strokeStyle = "#F0B21C"; c.lineWidth = lw * 1.5; c.strokeRect(x1, y1, x2 - x1, y2 - y1);
  }
  if (pts && pts.length) {
    c.strokeStyle = "#F0B21C"; c.fillStyle = "#F0B21C"; c.lineWidth = lw;
    c.beginPath(); pts.map(N).forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]));
    if (closed && pts.length > 2) c.closePath(); c.stroke();
    pts.map(N).forEach(p => { c.beginPath(); c.arc(p[0], p[1], lw * 2.2, 0, Math.PI * 2); c.fill(); });
  }
  if (dimLabel && pts && pts.length === 2) {
    // mark the length as a dimension: end ticks plus a label at the middle
    const a = N(pts[0]), b = N(pts[1]), v = sub(b, a), L = len(v) || 1, u = mul(v, 1 / L), n = [-u[1], u[0]], t = lw * 6;
    c.strokeStyle = "#F0B21C"; c.lineWidth = lw;
    c.beginPath(); [a, b].forEach(p => { c.moveTo(p[0] + n[0] * t, p[1] + n[1] * t); c.lineTo(p[0] - n[0] * t, p[1] - n[1] * t); }); c.stroke();
    const mid = mul(add(a, b), .5), fs = Math.max(14, Math.round(cv.width / 70));
    c.font = `bold ${fs}px Arial, sans-serif`;
    const tw = c.measureText(dimLabel).width, pad = fs * .35, ly = mid[1] - fs * 1.3;
    c.fillStyle = "rgba(16,22,27,0.88)"; c.fillRect(mid[0] - tw / 2 - pad, ly - fs * .8, tw + pad * 2, fs * 1.4);
    c.fillStyle = "#F0B21C"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText(dimLabel, mid[0], ly - fs * .1);
  }
}

/* ---------- unclear areas ---------- */
async function askUnclear(round) {
  const list = round.trace.unclear;
  $("#p-question").hidden = false;
  $("#p-question").scrollIntoView({ block: "start" });
  for (let i = 0; i < list.length; i++) {
    round.answers[list[i].id] = await askOne(list[i], i, list.length);
    prog("q", "need", `${list.length - i - 1} left`);
  }
  $("#p-question").hidden = true;
}
function askOne(u, i, n) {
  return new Promise(resolve => {
    $("#q-title").textContent = `Unclear area ${i + 1} of ${n}`;
    $("#q-text").textContent = u.question || "What is in the highlighted area?";
    const cv = $("#q-canvas"), pts = [];
    let tracing = false;
    const draw = () => drawImageCanvas(cv, u.bbox, tracing ? pts : null, true);
    draw();
    ZOOM.q.area = () => ZOOM.q.focus(u.bbox.map((v, j) => v + (j < 2 ? -40 : 40)));
    ZOOM.q.area();
    const box = $("#q-choices");
    box.innerHTML = u.choices.map((c, k) => `<button type="button" data-k="${k}">${esc(c.label || "Choice " + (k + 1))}</button>`).join("")
      + `<button type="button" data-act="trace">Trace it myself</button><button type="button" data-act="skip">Skip (draw dashed)</button>`;
    box.hidden = false; $("#q-trace").hidden = true; $("#q-trace-done").disabled = true;
    const finish = a => { box.onclick = null; cv.onclick = null; resolve(a); };
    box.onclick = e => {
      const b = e.target.closest("button"); if (!b) return;
      if (b.dataset.k != null) finish({ kind: "choice", idx: +b.dataset.k });
      else if (b.dataset.act === "skip") finish({ kind: "skip" });
      else if (b.dataset.act === "trace") { tracing = true; box.hidden = true; $("#q-trace").hidden = false; $("#q-label").value = ""; draw(); }
    };
    cv.onclick = e => { if (!tracing) return; pts.push(canvasNorm(cv, e)); draw(); $("#q-trace-done").disabled = pts.length < 2; };
    $("#q-trace-undo").onclick = () => { pts.pop(); draw(); $("#q-trace-done").disabled = pts.length < 2; };
    $("#q-trace-cancel").onclick = () => { tracing = false; pts.length = 0; box.hidden = false; $("#q-trace").hidden = true; draw(); };
    $("#q-trace-done").onclick = () => {
      if (pts.length < 2) return;
      finish({ kind: "traced", type: $("#q-type").value, label: $("#q-label").value.trim(), points: pts.slice() });
    };
  });
}

/* ---------- change the picked sketch. Tony selects an area (4 to 8 points) or keeps the whole sketch, and says or types the
   change. Claude sees the photo, the sketch drawn over it and the feature list, and answers with remove / replace / add, as
   in a review; only features in the area may change, and anything new must sit inside it. Each change makes a new round,
   so Undo last change (or the Rounds row) goes back to the sketch before it. */
const ED_MIN = 4, ED_MAX = 8, ED = { poly: null, draft: null, from: [], busy: false };   // poly, draft: the area on the image's 0-1000 grid
ZOOM.ed = makeZoom($("#ed-box"), $("#ed-canvas"), imgAspect);
function ptInPoly(p, P) {
  let c = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) if ((P[i][1] > p[1]) !== (P[j][1] > p[1]) && p[0] < (P[j][0] - P[i][0]) * (p[1] - P[i][1]) / (P[j][1] - P[i][1]) + P[i][0]) c = !c;
  return c;
}
const featPts = f => [f.p1, f.p2, f.q1, f.q2, f.at].filter(isPt).concat((f.points || []).filter(isPt));
const featTouches = f => !ED.poly || featPts(f).some(p => ptInPoly(p, ED.poly));   // may change: any of its points in the area
const featInside = f => { const p = featPts(f); return !ED.poly || (p.length > 0 && ptInPoly(centroid(p), ED.poly)); };   // a new one: centred in it
function edDraw() {
  const r = S.rounds[S.view], cv = $("#ed-canvas"); if (!r || !S.imgEl) return;
  drawImageCanvas(cv, null, null);
  const k = cv.width / S.W, x = cv.getContext("2d"), lw = Math.max(2, cv.width / 500);
  drawOverlay(x, levelFeatures(roundFeatures(r).feats, S.picked || "B"), p => [p[0] * k, p[1] * k], lw);
  const pts = ED.draft || ED.poly; if (!pts || !pts.length) return;
  const N = p => [p[0] / 1000 * cv.width, p[1] / 1000 * cv.height];
  x.strokeStyle = x.fillStyle = "#F0B21C"; x.lineWidth = lw * 1.5; x.setLineDash(ED.draft ? [] : [lw * 4, lw * 3]);
  x.beginPath(); pts.map(N).forEach((q, i) => i ? x.lineTo(q[0], q[1]) : x.moveTo(q[0], q[1])); if (!ED.draft) x.closePath(); x.stroke(); x.setLineDash([]);
  pts.map(N).forEach((q, i) => { x.beginPath(); x.arc(q[0], q[1], lw * (i ? 2.2 : 3.4), 0, Math.PI * 2); x.fill(); });
}
function edScope() {
  const r = S.rounds[S.view], n = r && ED.poly ? roundFeatures(r).feats.filter(featTouches).length : 0;
  $("#ed-select").setAttribute("aria-pressed", !!ED.draft); $("#ed-whole").setAttribute("aria-pressed", !ED.poly && !ED.draft);
  $("#ed-undo-pt").hidden = !ED.draft; $("#ed-canvas").style.cursor = ED.draft ? "crosshair" : "default";
  $("#ed-undo").hidden = !ED.from.some(x => S.rounds.includes(x));
  $("#ed-scope").textContent = ED.draft ? `Click ${ED_MIN} to ${ED_MAX} points around the part to change (${ED.draft.length} so far). Click the first point again to close the area.`
    : ED.poly ? `Change applies to: the selected area (${ED.poly.length} points, ${n} item${n === 1 ? "" : "s"} in it)` : "Change applies to: the whole sketch";
}
function edShow() {
  ED.draft = null; edScope(); edDraw();
  const b = S.border && S.border.length > 2 ? S.border : S.crop ? [[S.crop.x0 / S.W * 1000, S.crop.y0 / S.H * 1000], [(S.crop.x0 + S.crop.w) / S.W * 1000, (S.crop.y0 + S.crop.h) / S.H * 1000]] : null;
  requestAnimationFrame(() => b ? ZOOM.ed.focus([Math.min(...b.map(p => p[0])) - 20, Math.min(...b.map(p => p[1])) - 20, Math.max(...b.map(p => p[0])) + 20, Math.max(...b.map(p => p[1])) + 20]) : ZOOM.ed.fit());
}
function edClose() {
  if (!ED.draft || ED.draft.length < ED_MIN) { $("#ed-msg").textContent = `Click at least ${ED_MIN} points.`; return; }
  ED.poly = ED.draft; ED.draft = null; $("#ed-msg").textContent = ""; edScope(); edDraw(); $("#ed-text").focus();
}
$("#ed-select").addEventListener("click", () => { ED.draft = ED.draft ? null : []; ED.poly = null; edScope(); edDraw(); });
$("#ed-whole").addEventListener("click", () => { ED.poly = ED.draft = null; edScope(); edDraw(); });
$("#ed-undo-pt").addEventListener("click", () => { if (ED.draft) { ED.draft.pop(); edScope(); edDraw(); } });
$("#ed-canvas").addEventListener("click", e => {
  if (!ED.draft) return;
  const cv = $("#ed-canvas"), p = canvasNorm(cv, e), b = cv.getBoundingClientRect(), d0 = ED.draft[0];
  if (ED.draft.length >= ED_MIN && Math.hypot((p[0] - d0[0]) / 1000 * b.width, (p[1] - d0[1]) / 1000 * b.height) < 12) { edClose(); return; }   // back on the first point
  ED.draft.push(p.map(v => Math.round(v * 10) / 10));
  if (ED.draft.length >= ED_MAX) { edClose(); return; }
  edScope(); edDraw();
});
$("#ed-undo").addEventListener("click", () => {
  let r; while (ED.from.length && !S.rounds.includes(r = ED.from.pop())) r = null;
  if (!r) { edScope(); return; }
  S.view = S.rounds.indexOf(r); renderOptions(); edScope(); edDraw(); $("#ed-msg").textContent = `Back to round ${r.n}.`;
});
// Dictation: the browser's speech recognition where this view lets the page use the microphone; otherwise the system's own
// dictation (Windows: Win+H, Mac: Fn twice, phones: the keyboard's mic) types into the box just the same.
const SREC = window.SpeechRecognition || window.webkitSpeechRecognition;
const DICTATE_TIP = /Mac/.test(navigator.platform) ? "press Fn twice (Mac dictation)" : /Win/.test(navigator.platform) ? "press Win+H (Windows dictation)" : "use your keyboard's mic";
let edRec = null, edAuto = !!SREC;
function edListen(on) {
  const mic = $("#ed-mic"), msg = $("#ed-msg"), box = $("#ed-text");
  if (!on) { if (edRec) edRec.stop(); return; }
  if (!SREC) { msg.textContent = `Speech is not available in this browser: click in the box and ${DICTATE_TIP}.`; return; }
  if (edRec) return;
  const r = new SREC(), base = box.value.trim(); r.lang = navigator.language || "en-US"; r.continuous = true; r.interimResults = true;
  edRec = r; mic.setAttribute("aria-pressed", "true"); mic.classList.add("rec"); mic.textContent = "■ Stop"; msg.textContent = "Listening…";
  r.onresult = ev => { let t = ""; for (let i = 0; i < ev.results.length; i++) t += ev.results[i][0].transcript; box.value = [base, t.trim()].filter(Boolean).join(" "); };
  r.onerror = ev => { if (ev.error === "not-allowed" || ev.error === "service-not-allowed") edAuto = false;
    msg.textContent = edAuto ? `Dictation stopped (${ev.error}).` : `The microphone is blocked here: click in the box and ${DICTATE_TIP} instead.`; };
  r.onend = () => { edRec = null; mic.setAttribute("aria-pressed", "false"); mic.classList.remove("rec"); mic.textContent = "🎤 Dictate"; if (msg.textContent === "Listening…") msg.textContent = ""; };
  try { r.start(); } catch (e) { r.onend(); edAuto = false; msg.textContent = `Dictation could not start: click in the box and ${DICTATE_TIP}.`; }
}
$("#ed-mic").addEventListener("click", () => edListen(!edRec));
$("#ed-text").addEventListener("focus", () => { if (edAuto && !edRec && !$("#ed-text").value.trim()) edListen(true); });   // click in and speak
function editPrompt(ask, feats) {
  const gridPerFt = S.pxPerFt ? S.pxPerFt / (S.crop ? S.crop.w : S.W) * 1000 : 0;
  return `You are editing a traced engineering sketch of EXISTING site conditions (a parking lot at an EV charging site). Tony, the engineer, asked for this change:
"""${ask}"""
Image 1 is the aerial photo. Image 2 is the same photo with the current sketch drawn on top. Colors: magenta = stall stripes; cyan = lot border, curbs and islands; yellow = yellow painted lines; white = white painted lines and striped areas; blue = drive lane centerlines with direction arrows; green = landscaping and hedges; orange = buildings, equipment and poles; light blue = ADA spaces.
COORDINATES: a 0-1000 grid on each axis of the image (x from the left edge, y from the top edge). Whole numbers.
${gridPerFt ? `Scale: 1 ft is about ${gridPerFt.toFixed(2)} units on the x grid.` : "No scale is set; a standard stall is about 9 ft wide."}
${ED.poly ? `AREA: Tony selected this polygon: ${JSON.stringify(ED.poly.map(toCropPt).map(p => p.map(Math.round)))}. Change, remove or add only features in it (a feature crossing its edge may change; anything new must be centred inside it). Leave everything outside it exactly as it is.` : "AREA: the whole sketch. Change only what the request is about."}

CURRENT FEATURES (index: feature)
${feats.map((f, i) => i + ": " + serialFeat(f)).join("\n")}

RULES
1. Tony knows the site: make the change he asks for, even where the photo is unclear.
2. The sketch shows existing conditions only. Leave out proposed work (new chargers, equipment, or stalls and striping for the project) and say so in "skipped".
3. Keep every other feature as it is. Do not re-trace or tidy anything he did not ask about.

${LOT_KNOWLEDGE}
FEATURE SHAPES (coordinates on the 0-1000 grid)
${Object.values(SHAPES).join("\n")}
Stall rows use: {"type":"stall_row","p1":[x,y],"p2":[x,y],"q1":[x,y],"count":N,"angle":60,"leanToward":"p2"} (p1, p2: aisle-side ends of the first and last stripe; q1: far end of the first stripe; leanToward: the end the stripes' far ends point to).

Reply with only one JSON object:
{"remove":[{"i":index}],"replace":[{"i":index,"feature":{...}}],"add":[{...}],"summary":"one short sentence on what you changed","skipped":"what you could not do and why, or empty"}`;
}
/* Applies Claude's change to t.features (indices refer to the list Claude was shown); anything outside the area is skipped. */
function applyEdit(t, ed) {
  const conv = f => { const g = cleanFeature(f); if (g && S.crop) featToFull(g); return g; };
  const list = t.features.slice(), idx = v => Number(v && typeof v === "object" ? v.i : v), rem = new Set();
  let n = 0, out = 0;
  (ed.remove || []).forEach(v => { const i = idx(v);
    if (!Number.isInteger(i) || !list[i] || rem.has(i)) return;
    if (!featTouches(list[i])) { out++; return; }
    rem.add(i); n++; });
  (ed.replace || []).forEach(v => { const i = idx(v), g = v && conv(v.feature);
    if (!g || !Number.isInteger(i) || !list[i] || rem.has(i)) return;
    if (!featTouches(list[i]) || !featInside(g)) { out++; return; }
    list[i] = g; n++; });
  const kept = list.filter((f, i) => !rem.has(i));
  (ed.add || []).forEach(a => { const g = conv(a); if (!g) return; if (!featInside(g)) { out++; return; } kept.push(g); n++; });
  t.features = kept;
  return { n, out };
}
$("#ed-go").addEventListener("click", async () => {
  const go = $("#ed-go"), msg = $("#ed-msg"), ask = $("#ed-text").value.trim(), r = S.rounds[S.view];
  if (ED.busy) { if (S.ctl) S.ctl.abort(); return; }   // pressed again while Claude works: cancel
  if (!ask) { msg.textContent = "Say or type the change first."; $("#ed-text").focus(); return; }
  if (ED.draft) { msg.textContent = "Finish the area first: click its first point again."; return; }
  if (!r || S.busy) return;
  if (!caps.sample) { msg.textContent = "Claude is not available in this view. Open the page in claude.ai."; return; }
  edListen(false);
  const feats = JSON.parse(JSON.stringify(roundFeatures(r).feats)), t = { features: feats };
  ED.busy = S.busy = true; setBusy(true); S.ctl = new AbortController(); go.textContent = "Cancel"; msg.textContent = "Claude is making the change…";
  try {
    const ov = await overlayBlob(feats, null, false);
    const ed = await caps.sample.json(editPrompt(ask, feats), { images: [ov.photo, ov.overlay], modelTier: "complex", cache: false, signal: S.ctl.signal });
    const res = applyEdit(t, ed || {}), skipped = ed && ed.skipped ? ` Not done: ${String(ed.skipped).slice(0, 300)}` : "";
    if (!res.n) msg.textContent = "No change made" + (res.out ? `: Claude's ${res.out} edit${res.out > 1 ? "s were" : " was"} outside the selected area` : "") + "." + skipped;
    else {
      const summary = String((ed && ed.summary) || "sketch changed").slice(0, 300);
      const trace = Object.assign({}, r.trace, { features: t.features, unclear: [] });
      finalizeTrace(trace);
      trace.laneNotes = (r.trace.laneNotes || []).concat(`Changed at Tony's request ("${ask.slice(0, 160)}"): ${summary}`);
      S.rounds.push({ n: S.rounds.length + 1, trace, answers: {}, detail: "Change: " + ask, at: new Date() });
      ED.from.push(r); S.view = S.rounds.length - 1;
      renderOptions(); $("#dl-name").textContent = "Files will be named " + baseName() + ".";
      const hiddenB = S.picked === "A" && t.features.some(f => !BASIC.has(f.type) && !feats.includes(f)) ? " Some of it shows only in Option B (Full)." : "";
      msg.textContent = `Done: ${summary}${res.out ? ` (${res.out} edit${res.out > 1 ? "s" : ""} outside the area skipped)` : ""}. Undo last change goes back.${hiddenB}${skipped}`;
      $("#ed-text").value = "";
    }
    edScope(); edDraw();
  } catch (e) {
    msg.textContent = e && e.code === "cancelled" ? "Cancelled." : "Not changed: " + sampleMsg(e);
  } finally {
    ED.busy = S.busy = false; setBusy(false); go.textContent = "Apply change";
  }
});

/* ---------- project number ---------- */
$("#proj-retry").addEventListener("click", () => lookupProject());
$("#proj-use").addEventListener("click", () => {
  const v = $("#proj-manual").value.trim(); if (!v) return;
  setProject({ number: v, source: "typed by Tony" });
});
function words(s) { return String(s || "").toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length >= 3); }
function longestWord(s) { return words(s).sort((a, b) => b.length - a.length)[0] || String(s || "").trim(); }
function mcpMsg(e, server) {
  switch (e && e.code) {
    case "needs_reauth": return `Reconnect ${server} in claude.ai Settings → Connectors, then click Look up again.`;
    case "server_not_connected": return `Add ${server} in claude.ai Settings → Connectors, then click Look up again.`;
    case "selection_required": return `Choose which ${server} connection to use when Claude asks, then click Look up again.`;
    case "not_in_manifest": case "approval_required": case "consent_required": return `${server} is not allowed for this page yet. Click Look up again and choose Allow.`;
    case "blocked_by_policy": return `Your organization blocks this ${server} lookup. Type the number instead.`;
    case "server_unavailable": return `${server} did not answer in time. Click Look up again in a minute.`;
    default: return `${server} lookup did not work (${(e && e.code) || "error"}). Type the number instead.`;
  }
}
async function mondayItems(boardId, cols, site) {
  const base = { boardId, includeColumns: true, columnIds: cols, includeGroup: false, limit: 200 };
  const kw = longestWord(site);
  let res;
  try { res = await caps.mcp.callTool("monday.com", "get_board_items_page", Object.assign({}, base, { filters: [{ columnId: "name", operator: "contains_text", compareValue: kw }] })); }
  catch (e) { if (e && e.code === "tool_error") res = await caps.mcp.callTool("monday.com", "get_board_items_page", Object.assign({}, base, { searchTerm: site })); else throw e; }
  const p = res && res.payload; return (p && Array.isArray(p.items)) ? p.items : [];
}
function scoreSite(name, site) { const w = words(site); if (!w.length) return 0; const n = String(name).toLowerCase(); return w.filter(x => n.includes(x)).length / w.length; }
function custHit(text, customer) { const w = words(customer); if (!w.length) return false; const t = String(text || "").toLowerCase(); return w.some(x => t.includes(x)); }

async function lookupProject() {
  $("#p-project").hidden = false;
  const cands = $("#cands"), site = S.inputs.site, customer = S.inputs.customer;
  if (!caps.mcp) { prog("proj", "need", "monday is not reachable here; type the number"); cands.innerHTML = `<p class="msg warn">monday and Drive are not reachable from this view. Type the project number.</p>`; return; }
  prog("proj", "run", "searching monday");
  cands.innerHTML = `<p class="hint">Searching HiON PROJECTS and HFG Dev Projects for “${esc(site)}”…</p>`;
  const found = [], errs = [];
  await Promise.all([
    mondayItems(PROJ_BOARD, ["dropdown__1"], site).then(items => items.forEach(it => {
      const m = String(it.name).match(/\b(HP-?\d{3,6}|HN\d{4,6})\b/i);
      const client = it.column_values && it.column_values.dropdown__1;
      found.push({ board: "HiON PROJECTS", number: m ? m[1].toUpperCase() : "", name: it.name, url: it.url,
        cust: client || "", site: scoreSite(it.name, site), custOk: custHit(client, customer) || custHit(it.name, customer) });
    })).catch(e => errs.push(mcpMsg(e, "monday.com"))),
    mondayItems(DEV_BOARD, ["text_mm7f5340", "connect_boards"], site).then(items => items.forEach(it => {
      const cv = it.column_values || {}, fr = Array.isArray(cv.connect_boards) ? cv.connect_boards.map(x => x.name).join(", ") : "";
      const num = cv.text_mm7f5340 || ((String(it.name).match(/\bP-\d{5}\.\d{3}\b/) || [])[0] || "");
      found.push({ board: "HFG Dev Projects", number: num, name: it.name, url: it.url, cust: fr,
        site: scoreSite(it.name, site), custOk: custHit(fr, customer) || custHit(it.name, customer) });
    })).catch(e => errs.push(mcpMsg(e, "monday.com")))
  ]);
  const list = found.filter(c => c.site >= 0.5 || (c.site > 0 && c.custOk)).sort((a, b) => (b.site + (b.custOk ? 1 : 0)) - (a.site + (a.custOk ? 1 : 0)));
  const strong = list.filter(c => c.site === 1 && c.custOk && c.number);
  if (errs.length && !found.length) { prog("proj", "fail", "monday lookup failed"); cands.innerHTML = `<p class="msg warn">${esc([...new Set(errs)].join(" "))}</p>`; driveCheck(""); return; }
  if (!list.length) { prog("proj", "need", "no match; type the number or find the Drive folder"); cands.innerHTML = `<p class="msg warn">No monday item matches “${esc(site)}” and “${esc(customer)}”. Type the number below, or find the project's Drive folder.</p>`; driveCheck(""); return; }
  cands.innerHTML = list.slice(0, 8).map((c, i) => `<div class="cand"><input type="radio" name="cand" id="cand-${i}" value="${i}"><label for="cand-${i}" style="flex:1;min-width:0">
      <span class="num">${esc(c.number || "no number in monday")}</span> · ${esc(c.name)}
      <small>${esc(c.board)} · customer: ${esc(c.cust || "not set")}${c.custOk ? "" : " (does not match “" + esc(customer) + "”)"} · <a href="${esc(c.url)}" target="_blank" rel="noopener">open in monday</a></small></label></div>`).join("");
  cands.onchange = e => { const c = list[+e.target.value]; if (c && c.number) setProject({ number: c.number, source: c.board, url: c.url, name: c.name }); };
  if (strong.length === 1) { $("#cand-" + list.indexOf(strong[0])).checked = true; setProject({ number: strong[0].number, source: strong[0].board, url: strong[0].url, name: strong[0].name }); }
  else prog("proj", "need", list.length + " possible matches; pick one");
}
function setProject(p, check) {
  S.project = p;
  prog("proj", "done", p.number + (p.source ? " from " + p.source : ""));
  if (check !== false) driveCheck(p.number);
  if (S.rounds.length) renderOptions();
  if (S.picked) $("#dl-name").textContent = "Files will be named " + baseName() + ".";
}
const DRIVE_FOLDER = "mimeType = 'application/vnd.google-apps.folder'";
const NUM_RE = /\b(HP-?\d{3,6}|HN\d{4,6}|P-\d{5}\.\d{3})\b/i;
const normNum = s => String(s || "").toUpperCase().replace(/^HP-?/, "HP");
const dq = s => String(s).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
const DRIVE_H3 = `<h3 style="margin:0;font:700 1.05rem var(--font-display);text-transform:uppercase;letter-spacing:.05em">Drive check</h3>`;
function driveFiles(query, pageSize) {
  return caps.mcp.callTool("Google Drive", "search_files", { query, pageSize, excludeContentSnippets: true })
    .then(r => (r.payload && Array.isArray(r.payload.files)) ? r.payload.files : []);
}
function folderRow(f, tag) {
  const m = String(f.title).match(NUM_RE), num = m ? m[1].toUpperCase() : "";
  return `<div class="cand"><span style="flex:1;min-width:0"><b>${esc(f.title)}</b><small>${esc(tag)} · ${num ? "number " + esc(num) : "no project number in the folder name"}</small></span>`
    + `<span class="row" style="gap:6px"><a class="btnlink" href="${esc(f.viewUrl)}" target="_blank" rel="noopener">Open in Drive</a>`
    + `<button type="button" data-use="1" data-num="${esc(num)}" data-title="${esc(f.title)}" data-url="${esc(f.viewUrl)}">Use this folder</button></span></div>`;
}
const driveBox = $("#drive-box");
driveBox.addEventListener("click", e => {
  const b = e.target.closest("button"); if (!b) return;
  if (b.dataset.use) useFolder(b.dataset);
  else if (b.id === "drive-find") findFolder();
  else if (b.id === "drive-change") driveCheck(S.project ? S.project.number : "");
});
driveBox.addEventListener("keydown", e => { if (e.target.id === "drive-q" && e.key === "Enter") { e.preventDefault(); findFolder(); } });
/* Tony's folder pick is final: it sets the number without starting another Drive check. */
function useFolder(d) {
  const num = d.num || (S.project && S.project.number) || "";
  if (!num) { const m = $("#drive-found") || driveBox; m.insertAdjacentHTML("beforeend", `<p class="msg warn">“${esc(d.title)}” has no project number in its name. Type the number under Project number, then pick the folder again.</p>`); return; }
  setProject({ number: num, source: "Drive folder you picked", url: d.url, folder: d.title }, false);
  ROOT.querySelectorAll('input[name="cand"]').forEach(r => r.checked = false);
  driveBox.innerHTML = DRIVE_H3
    + `<p class="msg ok">Using ${esc(num)}, from the Drive folder <a href="${esc(d.url)}" target="_blank" rel="noopener">${esc(d.title)}</a>. The title block and file names now use it.</p>`
    + `<div class="row"><button type="button" id="drive-change">Choose a different folder</button></div>`;
}
async function findFolder() {
  const out = $("#drive-found"), raw = ($("#drive-q").value || "").trim();
  if (!out) return;
  if (!raw) { out.innerHTML = `<p class="hint">Type part of the folder name or the project number.</p>`; return; }
  if (/^https?:\/\//i.test(raw)) { out.innerHTML = `<p class="msg warn">Type the folder name or project number instead of a link. Links cannot be searched.</p>`; return; }
  const ws = raw.split(/\s+/).filter(w => w.length >= 2).slice(0, 5);
  out.innerHTML = `<p class="hint">Searching Drive folders…</p>`;
  try {
    const files = await driveFiles(`${DRIVE_FOLDER} and ${ws.map(w => `title contains '${dq(w)}'`).join(" and ")}`, 15);
    out.innerHTML = files.length ? files.map(f => folderRow(f, "Search result")).join("") : `<p class="msg warn">No Drive folder name contains “${esc(raw)}”. Try fewer words or just the number.</p>`;
  } catch (e) { out.innerHTML = `<p class="msg warn">${esc(mcpMsg(e, "Google Drive"))}</p>`; }
}
async function driveCheck(number) {
  const box = driveBox;
  box.innerHTML = DRIVE_H3;
  if (!caps.mcp) { box.innerHTML += `<p class="msg warn">Drive is not reachable from this view.</p>`; return; }
  const finder = `<div style="display:grid;gap:8px"><p class="hint" style="margin:0">Pick the folder you want, or find another one:</p>`
    + `<div class="row"><input type="text" id="drive-q" autocomplete="off" placeholder="Folder name or number, e.g. P-00134.001 or Westminster" style="flex:1;min-width:180px"><button type="button" id="drive-find">Find folder</button></div><div id="drive-found" class="cands"></div></div>`;
  if (!number) { box.innerHTML += finder; return; }
  const hp = number.match(/^HP-?(\d+)$/i);
  const variants = hp ? ["HP-" + hp[1], "HP" + hp[1]] : [number];
  box.insertAdjacentHTML("beforeend", `<p class="hint" id="drive-wait">Checking Drive folders…</p>`);
  try {
    const [fa, fb] = await Promise.all([
      driveFiles(`${DRIVE_FOLDER} and (${variants.map(v => `title contains '${dq(v)}'`).join(" or ")})`, 10),
      driveFiles(`${DRIVE_FOLDER} and title contains '${dq(longestWord(S.inputs.site))}'`, 20)
    ]);
    const other = fb.filter(f => { const m = String(f.title).match(NUM_RE); return m && normNum(m[1]) !== normNum(number) && scoreSite(f.title, S.inputs.site) >= 0.5; });
    let h = DRIVE_H3;
    h += fa.length ? `<p class="msg ok">Drive agrees: ${fa.length === 1 ? "this folder carries" : "these folders carry"} ${esc(number)}.</p>` + `<div class="cands">${fa.slice(0, 4).map(f => folderRow(f, "Matches " + number)).join("")}</div>`
      : `<p class="msg warn">No Drive folder carries ${esc(number)}. Check the number before you download.</p>`;
    if (other.length) h += `<p class="msg warn">Drive and monday disagree. These folders look like this site but carry a different number:</p>`
      + `<div class="cands">${other.slice(0, 4).map(f => folderRow(f, "Different number")).join("")}</div>`;
    box.innerHTML = h + finder;
  } catch (e) { const w = $("#drive-wait"); if (w) w.remove(); box.innerHTML += `<p class="msg warn">${esc(mcpMsg(e, "Google Drive"))}</p>` + finder; }
}

/* ---------- files ---------- */
function baseName() {
  const d = new Date(), mmddyy = String(d.getMonth() + 1).padStart(2, "0") + String(d.getDate()).padStart(2, "0") + String(d.getFullYear()).slice(2);
  const num = S.project ? S.project.number.replace(/^HP-/i, "HP") : "NO-NUMBER";
  const clean = s => String(s).trim().replace(/[\s,]+/g, "_").replace(/[^A-Za-z0-9_.-]/g, "");
  return `${clean(num)}_${clean(S.inputs.site)}_SKETCH_Rev_${S.inputs.rev}_${mmddyy}`;
}
function pickedSvg(bare) { const r = S.rounds[S.view]; return renderSheet(r, S.picked, Object.assign(sheetCtx(r), { bare: !!bare })); }
function svgToPng(svg) {
  const m = svg.match(/^<svg[^>]* width="([\d.]+)" height="([\d.]+)"/), w = m ? Math.round(+m[1]) : SHEET.w, h = m ? Math.round(+m[2]) : SHEET.h;
  return new Promise((resolve, reject) => {
    const img = new Image(), url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    img.onload = () => { const c = document.createElement("canvas"); c.width = w; c.height = h;
      const x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0);
      URL.revokeObjectURL(url); c.toBlob(b => b ? resolve(b) : reject(new Error("png")), "image/png"); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("svg")); };
    img.src = url;
  });
}
function blobToDataURL(b) { return new Promise(r => { const f = new FileReader(); f.onload = () => r(f.result); f.readAsDataURL(b); }); }
async function makePdf(png) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: "landscape", unit: "in", format: [36, 24] });
  doc.addImage(await blobToDataURL(png), "PNG", 0, 0, 36, 24);
  doc.setProperties({ title: baseName(), subject: NOTE.join(" ") });
  return doc.output("blob");
}
function makeDxf() {
  const r = S.rounds[S.view], { feats } = roundFeatures(r), list = levelFeatures(feats, S.picked);
  const ft = !!S.pxPerFt, k = ft ? 1 / S.pxPerFt : 1, H = S.H;
  const X = p => (p[0] * k).toFixed(3), Y = p => ((H - p[1]) * k).toFixed(3);
  const o = ["0", "SECTION", "2", "ENTITIES"];
  const line = (a, b, layer) => o.push("0", "LINE", "8", layer, "10", X(a), "20", Y(a), "30", "0", "11", X(b), "21", Y(b), "31", "0");
  const text = (p, h, t, layer) => o.push("0", "TEXT", "8", layer, "10", X(p), "20", Y(p), "30", "0", "40", (h * (ft ? 1 : 1)).toFixed(2), "1", String(t).replace(/[\r\n]/g, " "));
  const circle = (p, rr, layer) => o.push("0", "CIRCLE", "8", layer, "10", X(p), "20", Y(p), "30", "0", "40", rr.toFixed(3));
  const L = { stripe: "STRIPE", lot_edge: "LOT-BORDER", curb: "CURB", island: "ISLAND", building: "BUILDING", aisle: "AISLE", ada_space: "ADA",
    equipment: "EQUIPMENT", landscape: "LANDSCAPE", hedge: "HEDGE", paint: "PAINT-LINE", hatch: "STRIPED-AREA", sidewalk: "SIDEWALK" };
  const txtH = ft ? 1.5 : 12, symR = ft ? 1 : 8;
  list.forEach(f => parts(f).forEach(p => {
    const lay = n => p.dashed ? "UNCONFIRMED" : n;
    if (p.k === "poly") { for (let i = 1; i < p.pts.length; i++) line(p.pts[i - 1], p.pts[i], lay(L[p.cls] || "CURB"));
      if (p.closed && p.pts.length > 2) line(p.pts[p.pts.length - 1], p.pts[0], lay(L[p.cls] || "CURB"));
      if (p.label) text(centroid(p.pts), txtH, p.label, lay("TEXT")); }
    else if (p.k === "sym") { circle(p.at, symR, lay(p.sym === "light_pole" ? "LIGHT" : p.sym === "stoplight" ? "STOPLIGHT" : "EQUIPMENT")); if (p.label) text(p.at, txtH, p.label, lay("TEXT")); }
    else if (p.k === "arrow") { const a = p.ang * Math.PI / 180, u = [Math.sin(a), -Math.cos(a)], Lp = ft ? 6 * S.pxPerFt : 30; line(add(p.at, mul(u, -Lp / 2)), add(p.at, mul(u, Lp / 2)), lay("ARROW")); }
    else if (p.k === "lane") { for (let i = 1; i < p.pts.length; i++) line(p.pts[i - 1], p.pts[i], lay(p.flow === "one" ? "DRIVE-LANE-ONE-WAY" : "DRIVE-LANE-TWO-WAY")); }
    else if (p.k === "tree") circle(p.at, p.r * k, lay("TREE"));
  }));
  if (S.border) { const bp = S.border.map(px); bp.forEach((p, i) => line(p, bp[(i + 1) % bp.length], "SKETCH-LIMIT")); }
  const origin = [0, H];
  text(add(origin, [0, ft ? 6 * S.pxPerFt : 40]), txtH * 1.6, NOTE.join(" "), "NOTES");
  text(add(origin, [0, ft ? 10 * S.pxPerFt : 70]), txtH, `${S.project ? S.project.number : "NO NUMBER"} ${S.inputs.site}. Units: ${ft ? "feet, approximate" : "image pixels, not to scale"}. Existing conditions traced from an aerial image.`, "NOTES");
  o.push("0", "ENDSEC", "0", "EOF");
  return o.join("\r\n") + "\r\n";
}
async function save(filename, data) {
  const m = $("#dl-msg");
  if (!caps.downloads) { m.className = "msg warn"; m.textContent = "Downloads are not available in this view. Open the page in claude.ai."; return; }
  try { await caps.downloads.save({ filename, data }); m.className = "msg ok"; m.textContent = `Saved ${filename}. Move it into Reference Data and Files\\CD50 Design and Data\\Projects\\${S.inputs.site}\\.`; }
  catch (e) {
    m.className = "msg warn";
    m.textContent = { declined: "Download cancelled.", rate_limited: "Another download prompt is open. Finish it, then try again.", too_large: "That file is too large for this view." }[e && e.code] || "The download did not work (" + ((e && e.code) || "error") + ").";
  }
}
async function withBusy(btn, fn) { const t = btn.textContent; btn.disabled = true; btn.textContent = "Preparing…"; try { await fn(); } catch (e) { $("#dl-msg").className = "msg warn"; $("#dl-msg").textContent = "Could not build the file. Try again."; } finally { btn.disabled = false; btn.textContent = t; } }
$("#dl-svg").addEventListener("click", e => withBusy(e.target, async () => save(baseName() + ".svg", new Blob([pickedSvg()], { type: "image/svg+xml" }))));
$("#dl-png").addEventListener("click", e => withBusy(e.target, async () => save(baseName() + ".png", await svgToPng(pickedSvg(true)))));
$("#dl-pdf").addEventListener("click", e => withBusy(e.target, async () => save(baseName() + ".pdf", await makePdf(await svgToPng(pickedSvg())))));
$("#dl-zip").addEventListener("click", e => withBusy(e.target, async () => {
  const svg = pickedSvg(), pdf = await makePdf(await svgToPng(svg)), png = await svgToPng(pickedSvg(true)), b = baseName();
  const z = new JSZip(); z.file(b + ".svg", svg); z.file(b + ".png", png); z.file(b + ".pdf", pdf); z.file(b + ".dxf", makeDxf());
  await save(b + ".zip", await z.generateAsync({ type: "blob" }));
}));

/* ---------- example (shown before the first real run) ---------- */
function loadExample() {
  S.W = 1500; S.H = 1000; S.pxPerFt = 5; S.scaleSource = "Example scale.";
  S.north = { found: false, angleDeg: 0 }; S.border = null; S.crop = null;
  S.inputs = { site: "EXAMPLE SITE", customer: "Example customer", address: "Example only. Not a real project.", rev: 0 };
  S.toggles = readToggles(); S.example = true;
  const row = (p1, p2, depth, count) => ({ type: "stall_row", p1, p2, depth, count, angleDeg: 0 });
  const trace = {
    north: { found: false, angleDeg: 0 }, scaleBar: { found: false }, declined: [], notes: "",
    features: [
      { type: "lot_edge", points: [[60, 260], [940, 260], [940, 940], [60, 940]], closed: true },
      { type: "building", points: [[140, 60], [700, 60], [700, 230], [140, 230]], closed: true, label: "EXISTING BUILDING" },
      row([120, 420], [880, 420], [0, -120], 22), row([120, 560], [880, 560], [0, 120], 22),
      { type: "stall_row", p1: [120, 780], p2: [880, 780], q1: [120, 900], count: 20, angle: 60, leanToward: "p1" },
      { type: "island", points: [[66, 432], [108, 432], [108, 548], [66, 548]], closed: true, rounded: true, surface: "landscaped" },
      { type: "aisle", points: [[100, 420], [880, 420], [880, 560], [100, 560]], closed: true },
      { type: "aisle", points: [[100, 680], [940, 680], [940, 780], [100, 780]], closed: true },
      { type: "drive_lane", points: [[90, 490], [870, 490]], flow: "two-way" },
      { type: "drive_lane", points: [[930, 730], [90, 730]], flow: "one-way" },
      { type: "arrow", at: [520, 730], angleDeg: 270 },
      { type: "landscape", points: [[60, 60], [130, 60], [130, 230], [60, 230]], closed: true, label: "planting bed" },
      { type: "landscape", points: [[710, 60], [940, 60], [940, 232], [710, 232]], closed: true, label: "grass" },
      { type: "hedge", points: [[70, 972], [930, 972]] },
      { type: "tree", at: [95, 150], r: 24 }, { type: "tree", at: [905, 480], r: 26 }, { type: "tree", at: [240, 965], r: 22 }, { type: "tree", at: [640, 962], r: 24 },
      { type: "island", points: [[880, 300], [930, 300], [930, 680], [880, 680]], closed: true, rounded: true, surface: "landscaped" },
      { type: "curb", points: [[60, 262], [940, 262]] },
      { type: "ada_space", points: [[120, 300], [189, 300], [189, 420], [120, 420]], closed: true },
      { type: "hatch_area", points: [[189, 300], [224, 300], [224, 420], [189, 420]], closed: true },
      { type: "sidewalk", points: [[140, 232], [700, 232], [700, 254], [140, 254]], closed: true },
      { type: "arrow", at: [300, 490], angleDeg: 90 }, { type: "arrow", at: [700, 490], angleDeg: 270 },
      { type: "light_pole", at: [905, 330] }, { type: "light_pole", at: [905, 650] }, { type: "stoplight", at: [960, 250] },
      { type: "equipment", at: [800, 150], label: "TRANSFORMER" },
      { type: "dimension", p1: [100, 420], p2: [100, 560], what: "aisle" }
    ],
    unclear: []
  };
  trace.laneNotes = inferLanes(trace);
  S.rounds = [{ n: 1, trace, answers: {}, detail: "", at: new Date() }]; S.view = 0;
  renderOptions();
}

loadExample();
boot();
/* Opened from the CD50 Site Layout tool: the address comes in the link (?address= or #address=) or by message from the
   layout tool window (it sends it, and answers a request from here), and is filled in. */
function fillAddress(a, how) {
  a = String(a || "").trim().slice(0, 200); if (!a) return;
  $("#address").value = a; $("#addr-hint").hidden = true;
  const m = $("#addr-from"); m.hidden = false;
  m.textContent = `Address filled in from step 0 of the layout${how}: ${a}. Add the aerial image, site name and customer, then Start.`;
}
// step 0 of the layout tool hands over the address when it switches here
CD50.on(CD50.ADDRESS, a => { if (typeof a === "string" && a.trim() && !S.busy && $("#address").value.trim() !== a.trim()) fillAddress(a, ""); });
/* Paste: this page is not allowed to read the clipboard in most views, so it selects the box for Ctrl+V. */
$("#addr-paste").addEventListener("click", async () => {
  const box = $("#address"), hint = $("#addr-hint");
  box.focus(); box.select();
  try {
    const t = await Promise.race([navigator.clipboard.readText(), new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 800))]);
    if (t && t.trim()) { box.value = t.trim().slice(0, 200); hint.hidden = true; return; }
  } catch (e) {}
  hint.hidden = false; hint.textContent = "This view does not let the page read the clipboard. The box is selected: press Ctrl+V (Cmd+V on a Mac).";
});
/* ---------- back to the layout ---------- */
function sketchPayload() {
  const r = S.rounds[S.view], ctx = Object.assign(sheetCtx(r), { bare: true }), svg = renderSheet(r, S.picked, ctx);
  return { svg, meta: { type: "cd50-sketch-meta", v: 1, ppf: ctx.meta.ppf, north: ctx.meta.north, address: S.example ? "" : S.inputs.address, name: baseName() + ".png",
    scale: S.scaleEstimated ? "estimated" : S.pxPerFt ? "measured" : "unscaled", scaleSource: S.scaleSource || "" } };
}
// the layout tool listens for CD50.SKETCH (bridge.js), loads the PNG at its scale into the layout area and the sketch slot, and switches back
async function sendToLayout() {
  const m = $("#dl-msg"), { svg, meta } = sketchPayload(), png = await svgToPng(svg);
  CD50.send(CD50.SKETCH, CD50.sketchResult(Object.assign({}, meta, { png: await blobToDataURL(png) })));
  m.className = "msg ok"; m.textContent = "Sent to the layout area and the Aerial sketch result slot.";
}
$("#sk-back").addEventListener("click", () => CD50.send(CD50.LAYOUT));
$("#send-layout").addEventListener("click", e => withBusy(e.target, () => sendToLayout(e.target)));

})();
// END AERIAL SITE SKETCH script
