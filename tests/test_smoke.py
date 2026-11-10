"""pytest wrapper for the Console smoke suite (node --test tests/).

Run: `pytest tests/` (any venv with pytest) or directly `node --test tests/`.
"""
import pathlib
import shutil
import subprocess

import pytest

ROOT = pathlib.Path(__file__).resolve().parents[1]


@pytest.mark.skipif(shutil.which("node") is None, reason="node not installed")
def test_console_node_smoke_suite():
    r = subprocess.run(["node", "--test", "tests/"], cwd=ROOT, capture_output=True, text=True, timeout=120)
    assert r.returncode == 0, r.stdout[-4000:] + r.stderr[-2000:]
