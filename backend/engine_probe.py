"""Offline regression probe for gamdl's actual frozen yt-dlp worker path."""
import asyncio
import hashlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import tempfile
import threading

from gamdl.downloader.base import AppleMusicBaseDownloader


def download_self_test():
    payload = bytes(range(256)) * 64
    routes = {
        "/audio.bin": payload,
        "/segment1.ts": payload[:8192],
        "/segment2.ts": payload[8192:],
        "/audio.m3u8": (
            b"#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:1\n"
            b"#EXT-X-MEDIA-SEQUENCE:0\n#EXTINF:1,\nsegment1.ts\n"
            b"#EXTINF:1,\nsegment2.ts\n#EXT-X-ENDLIST\n"
        ),
    }
    requests = []

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            requests.append(self.path)
            body = routes.get(self.path)
            if body is None:
                self.send_error(404)
                return
            self.send_response(200)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *_args):
            pass

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    downloader = AppleMusicBaseDownloader.__new__(AppleMusicBaseDownloader)
    downloader.silent = True
    try:
        with tempfile.TemporaryDirectory(prefix="gamdl-probe-") as directory:
            for route, filename in [("/audio.bin", "日本語 中文.bin"), ("/audio.m3u8", "分片 音楽.mp4")]:
                output = Path(directory) / filename
                asyncio.run(downloader._download_ytdlp_async(
                    f"http://127.0.0.1:{server.server_port}{route}", str(output)))
                assert output.read_bytes() == payload, f"Corrupt download: {route}"
        assert all(route in requests for route in routes), requests
        return {"http": True, "hls": True, "worker": True,
                "utf8": "日本語 中文 音楽", "bytes": len(payload),
                "sha256": hashlib.sha256(payload).hexdigest()}
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)
