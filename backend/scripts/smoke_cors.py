"""CORS and local API authentication checks for development and packaged origins."""

from __future__ import annotations

import json
import os
import subprocess
import sys
import unittest
from pathlib import Path


BACKEND_ROOT = Path(__file__).resolve().parents[1]
TOKEN = "scriptcut-cors-smoke-token"

PROBE = r'''
import asyncio
import json
import sys
import types

torch = types.ModuleType("torch")


class FakeDevice:
    def __init__(self, value="cpu"):
        self.type = str(value).split(":", 1)[0]

    def __str__(self):
        return self.type


torch.device = FakeDevice
torch.cuda = types.SimpleNamespace(is_available=lambda: False, device_count=lambda: 0)
torch.backends = types.SimpleNamespace(
    mps=types.SimpleNamespace(is_available=lambda: False),
    cudnn=types.SimpleNamespace(),
)
torch.set_grad_enabled = lambda *args, **kwargs: None
sys.modules["torch"] = torch

from main import app

async def request(method, path, headers):
    response = {"status": 0, "headers": {}}
    messages = []

    async def receive():
        return {"type": "http.request", "body": b"", "more_body": False}

    async def send(message):
        messages.append(message)

    scope = {
        "type": "http",
        "asgi": {"version": "3.0", "spec_version": "2.0"},
        "http_version": "1.1",
        "method": method,
        "scheme": "http",
        "path": path,
        "raw_path": path.encode("ascii"),
        "query_string": b"",
        "headers": [(key.lower().encode("ascii"), value.encode("utf-8")) for key, value in headers.items()],
        "client": ("127.0.0.1", 1),
        "server": ("testserver", 80),
        "root_path": "",
    }
    await app(scope, receive, send)
    for message in messages:
        if message["type"] == "http.response.start":
            response["status"] = message["status"]
            response["headers"] = {
                key.decode("ascii"): value.decode("utf-8")
                for key, value in message["headers"]
            }
            break
    return response


async def main():
    result = {}
    for name, origin, token in [
        ("dev", "http://localhost:5173", TOKEN),
        ("packaged", "null", TOKEN),
        ("arbitrary", "https://example.invalid", TOKEN),
        ("unauthenticated", "null", None),
    ]:
        headers = {"Origin": origin}
        if token:
            headers["X-ScriptCut-Token"] = token
        response = await request("GET", "/system/checks", headers)
        result[name] = {
            "status": response["status"],
            "allow_origin": response["headers"].get("access-control-allow-origin"),
        }

    preflight = await request("OPTIONS", "/system/checks", {
        "Origin": "null",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type,x-scriptcut-token",
    })
    result["preflight"] = {
        "status": preflight["status"],
        "allow_origin": preflight["headers"].get("access-control-allow-origin"),
        "allow_methods": preflight["headers"].get("access-control-allow-methods", ""),
        "allow_headers": preflight["headers"].get("access-control-allow-headers", ""),
    }
    print(json.dumps(result))


asyncio.run(main())
'''


def probe(runtime_mode: str) -> dict:
    environment = os.environ.copy()
    environment["PYTHONPATH"] = str(BACKEND_ROOT)
    environment["SCRIPTCUT_API_TOKEN"] = TOKEN
    environment["SCRIPTCUT_RUNTIME_MODE"] = runtime_mode
    environment.pop("SCRIPTCUT_ALLOW_TOKENLESS_DEV", None)
    result = subprocess.run(
        [sys.executable, "-c", PROBE.replace("TOKEN", repr(TOKEN))],
        cwd=BACKEND_ROOT,
        env=environment,
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        raise AssertionError(result.stderr or result.stdout)
    return json.loads(result.stdout.strip().splitlines()[-1])


class CorsSmokeTests(unittest.TestCase):
    def test_development_origin_and_authentication(self) -> None:
        result = probe("development")
        self.assertEqual(result["dev"], {"status": 200, "allow_origin": "http://localhost:5173"})
        self.assertEqual(result["packaged"]["status"], 200)
        self.assertIsNone(result["packaged"]["allow_origin"])
        self.assertEqual(result["arbitrary"], {"status": 200, "allow_origin": None})
        self.assertEqual(result["unauthenticated"], {"status": 401, "allow_origin": None})
        self.assertEqual(result["preflight"]["status"], 400)

    def test_packaged_origin_and_preflight(self) -> None:
        result = probe("packaged-bundled")
        self.assertEqual(result["dev"], {"status": 200, "allow_origin": "http://localhost:5173"})
        self.assertEqual(result["packaged"], {"status": 200, "allow_origin": "null"})
        self.assertEqual(result["arbitrary"], {"status": 200, "allow_origin": None})
        self.assertEqual(result["unauthenticated"], {"status": 401, "allow_origin": None})
        self.assertEqual(result["preflight"]["status"], 200)
        self.assertEqual(result["preflight"]["allow_origin"], "null")
        self.assertIn("POST", result["preflight"]["allow_methods"])
        self.assertRegex(result["preflight"]["allow_headers"], r"(?i)content-type")
        self.assertRegex(result["preflight"]["allow_headers"], r"(?i)x-scriptcut-token")


if __name__ == "__main__":
    unittest.main(verbosity=2)
