"""The Build PDF kit (tools/build_kit.py) unpacks to a generator that builds a new site."""
import base64, io, os, subprocess, sys, tarfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tools"))
from build_kit import build_kit  # noqa: E402


def test_kit_unpacks_and_builds(tmp_path):
    head, b64 = build_kit().split("\n", 1)
    assert head.startswith("CD50-KIT ")
    with tarfile.open(fileobj=io.BytesIO(base64.b64decode(b64)), mode="r:gz") as tar:
        names = tar.getnames()
        tar.extractall(tmp_path, filter="data")
    for need in ("cd50-plansets/cd50.py", "cd50-plansets/pdf.cjs", "rules/sizing_rules.json", "tools/new_site.py"):
        assert need in names
    assert not any(n.endswith("site_private.json") for n in names)
    lay = tmp_path / "sites/san-ysidro-r6/layout.json"
    subprocess.run([sys.executable, "tools/new_site.py", str(lay), "--site", "kit-test"], cwd=tmp_path, check=True, capture_output=True)
    subprocess.run([sys.executable, "cd50-plansets/cd50.py", "sites/kit-test"], cwd=tmp_path, check=True, capture_output=True)
    assert (tmp_path / "sites/kit-test/out/cd50.html").exists()
