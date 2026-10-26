# layout.json (cd50-layout/2)

The Site Layout tool's export, read by `cd50-plansets/cd50.py` through `cd50-plansets/layout_io.py`, which checks it. All
positions are tool feet in the world frame; `frame.origin_ft` is the top-left of the background image.

| Key | Type | Notes |
|---|---|---|
| `format` | string | `cd50-layout/2`. `cd50-layout/1` is still read, with a warning to re-export. |
| `exported` | string | ISO date. |
| `tool.build` | string | Hash of the tool's sources (`tools/build_layout.py`). `git log -S <build> -- cd50-layout/cd50-layout.html` finds the commit. |
| `project` | object | `address` (the project address that unlocks the tool), `geo`. |
| `frame` | object | `site`, `origin_ft [x, y]`, `size_ft [w, h]`, `north`, `scale {how, by}`. `how` is `measured`, `assumed` (a count of standard 9 ft stalls), `estimated` or `unscaled`; anything but `measured` is flagged on the plan views. |
| `sizing` | object | `total_kva`, `xfmr_kva`, `service_amps`, `service_tag`. `cd50.py` re-sizes and warns when these differ. |
| `chargers` | list | `{tag, kind: V4 or MW, posts, kva, name}`. |
| `items` | list | Equipment: `{id, type, kind, cab, name, shape, x, y, rot, size_ft, pad_ft, body, pad, front_clear}`. |
| `bollards` | list | `{item, kind, xy}`. |
| `parking`, `landscape` | object | Stalls, signs, ADA check; plants. |
| `routes` | list | Conduit runs `{id, from, to, kind, n, size, cond, fn, path, length_ft}`. |
| `site_images` | object | `vicinity`, `lot`, `sketch`, `background`, see below. |

## Site images

Each entry has `name`, `address` (the project address it was added under) and, for `lot`, `install_box`. `background` is the
plan background itself (it fills `frame`); the tool sends it whenever the background is a real image, not the sample lot. The image itself is
never a data URI inside layout.json. It is one of:

- `file` + `sha256`: from **Download layout**, a zip of `layout.json` and `images/<slot>.<ext>`. Unzip it into `sites/<site>/`.
- `asset_id` + `sha256`: from **Build PDF**; Claude fetches the asset from the layout tool's asset store and writes it as `src`.
- `omitted`: from **Copy layout.json**, which leaves the images out.
- `src` (a data URI): written by Claude after fetching an asset, and found in older exports.

`layout_io.py` leaves out an image whose `address` is not the project's, whose file is missing, or whose sha256 does not match.
