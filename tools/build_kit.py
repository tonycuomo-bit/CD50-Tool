"""Pack the plan set generator into one text file for Build PDF sessions: build/cd50-kit.b64.txt.

  python3 tools/build_kit.py            # -> build/cd50-kit.b64.txt and build/kit.html (gitignored)

A session started by the layout tool's Build PDF button has no copy of this repo, and adding the repo there
waits for an approval nobody sees. So the generator ships as a kit instead: a base64 tar.gz of the committed
files the build needs (cd50-plansets, rules, tools/new_site.py, requirements.txt, sites), plus a first line
`CD50-KIT <commit> <date>` saying which commit it came from. It is published as kit/cd50-kit.b64.txt on the
"CD50 build kit" artifact (see CLAUDE.md); the session reads it with the Artifact tool and unpacks it:

  tail -n +2 cd50-kit.b64.txt | base64 -d | tar xz
"""
import base64, datetime, io, os, shutil, subprocess, sys, tarfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PATHS = ["cd50-plansets", "rules", "tools/new_site.py", "requirements.txt", "sites"]
SKIP = ("cd50-plansets/source/",)       # truck path scripts: not needed to build


def kit_files():
    out = subprocess.run(["git", "ls-files", "--", *PATHS], cwd=ROOT, check=True, capture_output=True, text=True).stdout
    return [f for f in out.split("\n") if f and not f.startswith(SKIP)]


def build_kit():
    commit = subprocess.run(["git", "rev-parse", "--short", "HEAD"], cwd=ROOT, check=True, capture_output=True, text=True).stdout.strip()
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w:gz") as tar:
        for f in kit_files():
            ti = tar.gettarinfo(os.path.join(ROOT, f), arcname=f)
            ti.mtime, ti.uid, ti.gid, ti.uname, ti.gname = 0, 0, 0, "", ""
            with open(os.path.join(ROOT, f), "rb") as fh:
                tar.addfile(ti, fh)
    b64 = base64.encodebytes(buf.getvalue()).decode()
    return f"CD50-KIT {commit} {datetime.date.today().isoformat()}\n{b64}"


if __name__ == "__main__":
    os.makedirs(os.path.join(ROOT, "build"), exist_ok=True)
    path = os.path.join(ROOT, "build", "cd50-kit.b64.txt")
    with open(path, "w") as fh:
        fh.write(build_kit())
    shutil.copy(os.path.join(ROOT, "tools", "kit_page.html"), os.path.join(ROOT, "build", "kit.html"))   # the artifact page
    print(f"{path}: {os.path.getsize(path):,} bytes, {len(kit_files())} files")
    sys.exit(0)
