"""Console entry point for the private, self-contained Windows download engine."""
import multiprocessing

# Frozen workers re-enter this executable. Dispatch them before Click sees argv.
if __name__ == "__main__":
    multiprocessing.freeze_support()

import importlib.metadata
import json
import sys

# Frozen Python ignores PYTHONIOENCODING at interpreter startup. Electron reads UTF-8.
for stream in (sys.stdout, sys.stderr):
    if stream is not None and hasattr(stream, "reconfigure"):
        stream.reconfigure(encoding="utf-8", errors="backslashreplace")

from gamdl import _ammuxer
from gamdl.cli.cli import main


def self_test():
    # Exercise the native module and dynamic dependencies before reporting ready.
    import certifi
    import mutagen
    from Crypto.Cipher import AES
    from pywidevine.device import Device
    from pyplayready.device import Device as PlayReadyDevice
    import yt_dlp

    assert callable(_ammuxer.decrypt_and_mux_hex_native)
    assert callable(_ammuxer.decrypt_and_mux_wrapper_native)
    assert AES and Device and PlayReadyDevice and yt_dlp and mutagen
    with open(certifi.where(), "rb") as certificates:
        assert b"BEGIN CERTIFICATE" in certificates.read()
    return {"version": importlib.metadata.version("gamdl"), "native": True,
            "python": sys.version.split()[0], "frozen": bool(getattr(sys, "frozen", False))}


if __name__ == "__main__":
    if sys.argv[1:] == ["--gui-self-test"]:
        print(json.dumps(self_test()))
    elif sys.argv[1:] == ["--gui-download-self-test"]:
        from engine_probe import download_self_test
        print(json.dumps(download_self_test(), ensure_ascii=False))
    elif len(sys.argv) == 3 and sys.argv[1] == "--gui-inspect-media":
        from media_inspector import inspect_file
        print(json.dumps(inspect_file(sys.argv[2]), ensure_ascii=False))
    elif len(sys.argv) == 3 and sys.argv[1] == "--gui-validate-args":
        with main.make_context("gamdl", json.loads(sys.argv[2])) as context:
            print(json.dumps({"valid": True, "urls": context.params["urls"]}))
    else:
        main()
