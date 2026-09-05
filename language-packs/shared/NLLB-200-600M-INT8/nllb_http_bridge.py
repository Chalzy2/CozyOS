"""
CozyOS NLLB HTTP Bridge
File Reference: language-packs/shared/NLLB-200-600M-INT8/nllb_http_bridge.py

RESPONSIBILITY
    A small, persistent local HTTP server that loads the existing
    NLLBEngine (nllb_engine.py) exactly once and serves multiple
    /translate requests against it, so the browser/PWA can reach a real
    NLLB-200-600M-INT8 model without re-loading it per request.

    This file does NOT reimplement translation. It does NOT create a
    second translation engine. It imports and calls the real
    `NLLBEngine` class defined in nllb_engine.py, unmodified.

SCOPE
    Speech / live translation only. This bridge is never used for
    Scripture translation (see project constraint: Scripture translation
    must not be routed through NLLB / this bridge).

LANGUAGE ID CONTRACT
    The HTTP API is CozyOS-language-ID-facing (e.g. "sw", "en", "fr").
    NLLB's own codes (e.g. "swh_Latn", "eng_Latn") are an internal
    implementation detail of this bridge and are never the browser-facing
    contract. The canonical 17-language CozyOS registry is not modified
    to know about NLLB codes, and NLLB's 202 languages are not added to
    it — only this file's COZY_TO_NLLB map exists to bridge the two.

LIFETIME
    start bridge -> load NLLBEngine() once -> serve request 1, 2, 3, ...
    The model is never reloaded per-request and the process never exits
    after a single request.

CONCURRENCY
    onnxruntime InferenceSession.run() is not documented by this
    project's own testing as safe for concurrent invocation against the
    same session from multiple threads for this model, so inference is
    serialized behind a single lock rather than assumed safe. This
    prioritizes correctness over speculative optimization (no unbounded
    threads, no per-request model instance).

SECURITY
    - Binds to 127.0.0.1 by default (never 0.0.0.0 unless explicitly
      overridden via COZY_NLLB_BIND, which is undocumented/unsupported
      for LAN exposure and not needed by this milestone).
    - CORS is restricted to local development origins
      (http(s)://localhost[:port], http(s)://127.0.0.1[:port]) rather
      than a wildcard, matching this repo's own
      KNOWN_DEV_HOSTNAMES = ["localhost", "127.0.0.1", "0.0.0.0"]
      convention (core/security/dev-access-service.js).
    - No request field is ever used as a file path, module name, or
      shell command. Only `text`, `sourceLanguage`, `targetLanguage`
      are read, and each is validated before use.
    - Text length is bounded (COZY_NLLB_MAX_TEXT_CHARS).

STARTUP
    python3 nllb_http_bridge.py

    Configuration (all optional, all environment variables):
        COZY_NLLB_PORT            default 8177
        COZY_NLLB_BIND            default 127.0.0.1
        COZY_NLLB_MAX_TEXT_CHARS  default 2000

    The process fails clearly (non-zero exit, printed reason) if:
        - required Python dependencies are missing (flask, onnxruntime,
          tokenizers, numpy)
        - the NLLB model files are missing (tokenizer.json,
          encoder_model_int8.onnx, decoder_model_int8.onnx)
        - model initialization raises
        - the configured port is already in use
"""

import os
import sys
import time
import threading

# ---------------------------------------------------------------------------
# 1. DEPENDENCY / ENGINE IMPORT — fail clearly, never silently degrade
# ---------------------------------------------------------------------------

_MISSING = []

try:
    from flask import Flask, request, jsonify
except ImportError:
    _MISSING.append("flask")

try:
    # Import the existing, real engine. Do not redefine it here.
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from nllb_engine import NLLBEngine  # noqa: E402
except ImportError as exc:
    NLLBEngine = None
    _ENGINE_IMPORT_ERROR = str(exc)
else:
    _ENGINE_IMPORT_ERROR = None

if _MISSING:
    sys.stderr.write(
        "[nllb_http_bridge] Missing required Python dependencies: "
        + ", ".join(_MISSING)
        + ". Install them (e.g. pip install "
        + " ".join(_MISSING)
        + ") before starting the bridge.\n"
    )
    sys.exit(1)

# ---------------------------------------------------------------------------
# 2. CozyOS <-> NLLB LANGUAGE MAPPING (browser-facing IDs stay canonical)
# ---------------------------------------------------------------------------

COZY_TO_NLLB = {
    "sw": "swh_Latn",
    "en": "eng_Latn",
    "fr": "fra_Latn",
    "ar": "arb_Arab",
    "so": "som_Latn",
    "ru": "rus_Cyrl",
    "zh": "zho_Hans",
    "ha": "hau_Latn",
    "yo": "yor_Latn",
    "luo": "luo_Latn",
    "ki": "kik_Latn",
    "kam": "kam_Latn",
    "zu": "zul_Latn",
    "am": "amh_Ethi",
    "ln": "lin_Latn",
    "ig": "ibo_Latn",
    "hi": "hin_Deva",
}

# ---------------------------------------------------------------------------
# 3. CONFIG
# ---------------------------------------------------------------------------

PORT = int(os.environ.get("COZY_NLLB_PORT", "8177"))
BIND = os.environ.get("COZY_NLLB_BIND", "127.0.0.1")
MAX_TEXT_CHARS = int(os.environ.get("COZY_NLLB_MAX_TEXT_CHARS", "2000"))

import re
_ALLOWED_ORIGIN_RE = re.compile(r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$")

# ---------------------------------------------------------------------------
# 4. MODEL LIFECYCLE — load once, retain, serialize inference
# ---------------------------------------------------------------------------

class _EngineHolder:
    """Loads NLLBEngine() exactly once and guards inference with a lock."""

    def __init__(self):
        self.engine = None
        self.load_error = None
        self.loaded = False
        self._lock = threading.Lock()

    def load(self):
        if _ENGINE_IMPORT_ERROR:
            self.load_error = (
                "nllb_engine.py could not be imported: " + _ENGINE_IMPORT_ERROR
            )
            return
        try:
            print("[nllb_http_bridge] Loading NLLBEngine (once)...")
            self.engine = NLLBEngine()
            self.loaded = True
            print("[nllb_http_bridge] NLLBEngine loaded and ready.")
        except Exception as exc:  # noqa: BLE001 - must report, not crash silently
            self.load_error = f"{type(exc).__name__}: {exc}"
            self.engine = None
            self.loaded = False
            print(f"[nllb_http_bridge] Model initialization FAILED: {self.load_error}")

    def translate(self, text, cozy_source, cozy_target):
        if not self.loaded or self.engine is None:
            raise RuntimeError(
                self.load_error or "NLLB engine is not loaded."
            )
        nllb_source = COZY_TO_NLLB.get(cozy_source)
        nllb_target = COZY_TO_NLLB.get(cozy_target)
        if nllb_source is None:
            raise ValueError(f"Unsupported sourceLanguage: {cozy_source}")
        if nllb_target is None:
            raise ValueError(f"Unsupported targetLanguage: {cozy_target}")

        # Serialized inference: correctness over speculative optimization.
        with self._lock:
            return self.engine.translate(text, nllb_source, nllb_target)


_holder = _EngineHolder()

# ---------------------------------------------------------------------------
# 5. HTTP APP
# ---------------------------------------------------------------------------

app = Flask(__name__)


@app.after_request
def _apply_cors(response):
    origin = request.headers.get("Origin", "")
    if origin and _ALLOWED_ORIGIN_RE.match(origin):
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Vary"] = "Origin"
        response.headers["Access-Control-Allow-Methods"] = "POST, GET, OPTIONS"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    return response


@app.route("/translate", methods=["OPTIONS"])
def translate_preflight():
    return ("", 204)


@app.route("/health", methods=["GET"])
def health():
    return jsonify({
        "ok": bool(_holder.loaded),
        "provider": "nllb",
        "modelLoaded": bool(_holder.loaded),
        "loadError": _holder.load_error,
    })


@app.route("/translate", methods=["POST"])
def translate():
    payload = request.get_json(silent=True)

    if not isinstance(payload, dict):
        return _fail(None, None, "Request body must be JSON.", status=400)

    text = payload.get("text")
    source_lang = payload.get("sourceLanguage")
    target_lang = payload.get("targetLanguage")

    # ---- validation (never crash the server on malformed input) ----
    if not isinstance(text, str) or text.strip() == "":
        return _fail(source_lang, target_lang, "text is required and must be a non-empty string.", status=400)
    if len(text) > MAX_TEXT_CHARS:
        return _fail(source_lang, target_lang, f"text exceeds max length of {MAX_TEXT_CHARS} characters.", status=400)
    if not isinstance(source_lang, str) or source_lang not in COZY_TO_NLLB:
        return _fail(source_lang, target_lang, f"Unsupported sourceLanguage: {source_lang!r}", status=400)
    if not isinstance(target_lang, str) or target_lang not in COZY_TO_NLLB:
        return _fail(source_lang, target_lang, f"Unsupported targetLanguage: {target_lang!r}", status=400)
    if source_lang == target_lang:
        return _fail(source_lang, target_lang, "sourceLanguage and targetLanguage must differ.", status=400)

    if not _holder.loaded:
        return _fail(source_lang, target_lang, _holder.load_error or "NLLB model is not loaded.", status=503)

    start = time.monotonic()
    try:
        translated_text = _holder.translate(text, source_lang, target_lang)
    except Exception as exc:  # noqa: BLE001 - report, never fabricate a translation
        return _fail(source_lang, target_lang, f"{type(exc).__name__}: {exc}", status=502)
    latency_ms = round((time.monotonic() - start) * 1000, 1)

    return jsonify({
        "success": True,
        "translatedText": translated_text,
        "sourceLanguage": source_lang,
        "targetLanguage": target_lang,
        "provider": "nllb",
        "isReal": True,
        "latencyMs": latency_ms,
    })


def _fail(source_lang, target_lang, reason, status=400):
    body = {
        "success": False,
        "translatedText": None,
        "sourceLanguage": source_lang,
        "targetLanguage": target_lang,
        "provider": "nllb",
        "isReal": False,
        "reason": reason,
    }
    resp = jsonify(body)
    resp.status_code = status
    return resp


def main():
    _holder.load()
    if not _holder.loaded:
        sys.stderr.write(
            f"[nllb_http_bridge] Starting anyway with model NOT loaded "
            f"(reason: {_holder.load_error}). /health will report "
            f"modelLoaded: false and /translate will fail closed with 503.\n"
        )
    try:
        app.run(host=BIND, port=PORT, threaded=True)
    except OSError as exc:
        sys.stderr.write(f"[nllb_http_bridge] Failed to bind {BIND}:{PORT} — {exc}\n")
        sys.exit(1)


if __name__ == "__main__":
    main()
