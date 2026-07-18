#!/usr/bin/env python3
"""Small loopback-only speech server for Spoken Token on macOS."""

from __future__ import annotations

import json
import shutil
import subprocess
import tempfile
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

HOST = "127.0.0.1"
PORT = 8880
MAX_BODY_BYTES = 32_000
MAX_TEXT_CHARACTERS = 5_000

SAY = shutil.which("say") or "/usr/bin/say"
AFCONVERT = shutil.which("afconvert") or "/usr/bin/afconvert"

VOICE_MAP = {
    "af_heart": "Samantha",
    "af_bella": "Flo (English (US))",
    "af_sky": "Sandy (English (US))",
    "am_michael": "Reed (English (US))",
    "am_adam": "Eddy (English (US))",
    "bf_emma": "Flo (English (UK))",
    "bm_george": "Daniel",
}


def installed_voices() -> set[str]:
    result = subprocess.run(
        [SAY, "-v", "?"],
        check=True,
        capture_output=True,
        text=True,
        timeout=10,
    )
    names: set[str] = set()
    for line in result.stdout.splitlines():
        if not line.strip():
            continue
        # The locale column starts after a run of whitespace. Voice names may
        # contain spaces, so split on two or more spaces rather than one.
        before_locale = line.split("  ", 1)[0].strip()
        if before_locale:
            names.add(before_locale)
    return names


try:
    AVAILABLE_VOICES = installed_voices()
except (OSError, subprocess.SubprocessError):
    AVAILABLE_VOICES = set()


def choose_voice(requested: str) -> str | None:
    candidate = VOICE_MAP.get(requested, requested)
    return candidate if candidate in AVAILABLE_VOICES else None


class SpokenTokenHandler(BaseHTTPRequestHandler):
    server_version = "SpokenToken/0.1"

    def send_json(self, status: HTTPStatus, payload: dict[str, Any]) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:  # noqa: N802
        if self.path in {"/", "/health"}:
            self.send_json(
                HTTPStatus.OK,
                {
                    "ok": True,
                    "service": "Spoken Token macOS speech",
                    "host": HOST,
                    "port": PORT,
                },
            )
            return

        if self.path == "/v1/audio/voices":
            self.send_json(
                HTTPStatus.OK,
                {
                    "voices": [
                        {"id": voice_id, "name": display_name}
                        for voice_id, display_name in VOICE_MAP.items()
                    ]
                },
            )
            return

        self.send_json(HTTPStatus.NOT_FOUND, {"error": "Not found."})

    def do_POST(self) -> None:  # noqa: N802
        if self.path != "/v1/audio/speech":
            self.send_json(HTTPStatus.NOT_FOUND, {"error": "Not found."})
            return

        try:
            content_length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            content_length = 0

        if content_length <= 0 or content_length > MAX_BODY_BYTES:
            self.send_json(HTTPStatus.BAD_REQUEST, {"error": "Invalid request size."})
            return

        try:
            payload = json.loads(self.rfile.read(content_length))
            text = str(payload.get("input", "")).strip()
            voice = choose_voice(str(payload.get("voice", "af_heart")))
            speed = float(payload.get("speed", 1))
        except (json.JSONDecodeError, TypeError, ValueError):
            self.send_json(HTTPStatus.BAD_REQUEST, {"error": "Invalid speech request."})
            return

        if not text or len(text) > MAX_TEXT_CHARACTERS:
            self.send_json(
                HTTPStatus.BAD_REQUEST,
                {"error": f"Text must contain 1 to {MAX_TEXT_CHARACTERS} characters."},
            )
            return

        words_per_minute = round(175 * min(2.0, max(0.5, speed)))

        try:
            with tempfile.TemporaryDirectory(prefix="spoken-token-") as temp:
                temp_path = Path(temp)
                aiff_path = temp_path / "speech.aiff"
                wav_path = temp_path / "speech.wav"

                say_command = [SAY]
                if voice:
                    say_command.extend(["-v", voice])
                say_command.extend(["-r", str(words_per_minute), "-o", str(aiff_path), text])

                subprocess.run(
                    say_command,
                    check=True,
                    capture_output=True,
                    timeout=60,
                )
                subprocess.run(
                    [AFCONVERT, "-f", "WAVE", "-d", "LEI16", str(aiff_path), str(wav_path)],
                    check=True,
                    capture_output=True,
                    timeout=30,
                )
                audio = wav_path.read_bytes()
        except subprocess.TimeoutExpired:
            self.send_json(HTTPStatus.GATEWAY_TIMEOUT, {"error": "Speech generation timed out."})
            return
        except (OSError, subprocess.CalledProcessError):
            self.send_json(
                HTTPStatus.INTERNAL_SERVER_ERROR,
                {"error": "The macOS speech engine could not generate audio."},
            )
            return

        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", "audio/wav")
        self.send_header("Content-Length", str(len(audio)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(audio)

    def log_message(self, template: str, *args: Any) -> None:
        # Keep normal request diagnostics without ever logging the submitted text.
        print(f"[Spoken Token] {self.address_string()} {template % args}")


def main() -> None:
    if not Path(SAY).exists() or not Path(AFCONVERT).exists():
        raise SystemExit("Spoken Token requires macOS 'say' and 'afconvert'.")

    server = ThreadingHTTPServer((HOST, PORT), SpokenTokenHandler)
    print()
    print("Spoken Token is ready.")
    print(f"Speech endpoint: http://{HOST}:{PORT}/v1/audio/speech")
    print("This server accepts connections only from this Mac.")
    print("Press Control-C to stop.")
    print()

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping Spoken Token.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
