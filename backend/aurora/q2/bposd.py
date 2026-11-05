"""Import shim for the `ldpc` BP-OSD decoder.

`ldpc` eagerly imports its optional `sinter` integration, and the `sinter` sdist does not
build on this Python. We only use `ldpc.BpOsdDecoder`, so we register a minimal stand-in
module exposing the `Decoder` base class that the optional integration subclasses.
"""
import sys
import types

if "sinter" not in sys.modules:
    try:
        import sinter  # noqa: F401  (use the real package when it is installed)
    except ImportError:
        stub = types.ModuleType("sinter")

        class Decoder:  # minimal base class; never used for decoding here
            pass

        class CompiledDecoder:
            pass

        stub.Decoder = Decoder
        stub.CompiledDecoder = CompiledDecoder
        sys.modules["sinter"] = stub

from ldpc import BpOsdDecoder  # noqa: E402,F401
