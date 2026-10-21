"""Console entry point for the private, self-contained Windows download engine."""
import importlib.metadata
import json
import sys

from gamdl import _ammuxer
from gamdl.cli.cli import main


def self_test():
    # Exercise the native module and dynamic dependencies before reporting ready.
    import certifi
    from Crypto.Cipher import AES
    from pywidevine.device import Device
    from pyplayready.device import Device as PlayReadyDevice
    import yt_dlp

    assert callable(_ammuxer.decrypt_and_mux_hex_native)
    assert callable(_ammuxer.decrypt_and_mux_wrapper_native)
    assert AES and Device and PlayReadyDevice and yt_dlp
    with open(certifi.where(), "rb") as certificates:
        assert b"BEGIN CERTIFICATE" in certificates.read()
    return {"version": importlib.metadata.version("gamdl"), "native": True,
            "python": sys.version.split()[0], "frozen": bool(getattr(sys, "frozen", False))}


if __name__ == "__main__":
    if sys.argv[1:] == ["--gui-self-test"]:
        print(json.dumps(self_test()))
    elif len(sys.argv) == 3 and sys.argv[1] == "--gui-validate-args":
        with main.make_context("gamdl", json.loads(sys.argv[2])) as context:
            print(json.dumps({"valid": True, "urls": context.params["urls"]}))
    else:
        main()
