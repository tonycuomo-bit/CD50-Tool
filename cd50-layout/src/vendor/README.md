Third-party libraries inlined into the layout tool by tools/build_layout.py, so Aerial Site Sketch exports (PDF, ZIP) work offline and behind strict proxies.

- jsPDF 2.5.1, `dist/jspdf.umd.min.js` from the npm package (MIT, see jspdf.LICENSE). Source map comment removed.
- JSZip 3.10.1, `dist/jszip.min.js` from the npm package (MIT or GPLv3, see jszip.LICENSE.md). Source map comment removed.

To update: `npm pack jspdf@<v> jszip@<v>`, copy the same files here, update the include lines in page.html.
