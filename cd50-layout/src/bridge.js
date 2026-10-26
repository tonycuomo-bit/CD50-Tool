// ---------- the hand-off between the layout tool and Aerial Site Sketch (both scripts use this; nothing else does)
// The layout fires ADDRESS (detail: the address string) when it switches to the sketch; the sketch fires SKETCH (detail: a
// sketch result) from Send to the layout, or LAYOUT to switch back without one. sketchResult() is the one place that decides
// what a sketch result is: a PNG data URI, its pixels per foot (null = no scale), north, how the scale was found.
const CD50 = Object.freeze({
  ADDRESS: "cd50:address", SKETCH: "cd50:sketch", LAYOUT: "cd50:layout",
  STALL_FT: 9,   // a standard parking stall is about 9 ft wide (perpendicular to its stripes); both halves check scale with it
  send(type, detail){ window.dispatchEvent(new CustomEvent(type, {detail})); },
  on(type, fn){ window.addEventListener(type, e => fn(e.detail)); },
  sketchResult(d){
    if (!d || typeof d.png !== "string" || !/^data:image\/png;base64,/.test(d.png)) throw new Error("the sketch result has no PNG");
    const ppf = +d.ppf > 0 ? +d.ppf : null;
    const scale = !ppf ? "unscaled" : d.scale === "estimated" ? "estimated" : "measured";
    return {png:d.png, ppf, north:+d.north || 0, scale, scaleSource:String(d.scaleSource || "").slice(0, 300),
            address:String(d.address || "").slice(0, 200), name:String(d.name || "aerial-sketch.png").slice(0, 120)};
  }
});
