"""
Bridge-only regression tests for nllb_http_bridge.py

DISCLOSURE: these tests exercise the real Flask app object (routes,
validation, honesty of /health, fail-closed /translate behavior) via
Flask's test client — no real HTTP socket, no real network. They do NOT
require a loaded NLLB model, and they do NOT fake one: if the model is
loaded in this process (real deps + real model files present), the
"model not loaded" tests are skipped and replaced by a real end-to-end
sw -> en assertion instead. Run with:

    python3 test_nllb_http_bridge.py
"""

import sys
import unittest

import nllb_http_bridge as bridge


class BridgeValidationTests(unittest.TestCase):

    def setUp(self):
        bridge._holder.load()
        self.client = bridge.app.test_client()

    def test_health_reports_honest_state(self):
        r = self.client.get("/health")
        body = r.get_json()
        self.assertEqual(r.status_code, 200)
        self.assertEqual(body["provider"], "nllb")
        self.assertEqual(body["modelLoaded"], bridge._holder.loaded)
        self.assertEqual(body["ok"], bridge._holder.loaded)

    def test_translate_rejects_missing_text(self):
        r = self.client.post("/translate", json={"sourceLanguage": "sw", "targetLanguage": "en"})
        self.assertEqual(r.status_code, 400)
        body = r.get_json()
        self.assertFalse(body["success"])
        self.assertFalse(body["isReal"])
        self.assertIsNone(body["translatedText"])

    def test_translate_rejects_empty_text(self):
        r = self.client.post("/translate", json={"text": "   ", "sourceLanguage": "sw", "targetLanguage": "en"})
        self.assertEqual(r.status_code, 400)

    def test_translate_rejects_unsupported_source(self):
        r = self.client.post("/translate", json={"text": "hi", "sourceLanguage": "xx", "targetLanguage": "en"})
        self.assertEqual(r.status_code, 400)
        self.assertIn("Unsupported sourceLanguage", r.get_json()["reason"])

    def test_translate_rejects_unsupported_target(self):
        r = self.client.post("/translate", json={"text": "hi", "sourceLanguage": "sw", "targetLanguage": "xx"})
        self.assertEqual(r.status_code, 400)
        self.assertIn("Unsupported targetLanguage", r.get_json()["reason"])

    def test_translate_rejects_same_source_and_target(self):
        r = self.client.post("/translate", json={"text": "hi", "sourceLanguage": "sw", "targetLanguage": "sw"})
        self.assertEqual(r.status_code, 400)

    def test_translate_rejects_oversized_text(self):
        big = "a" * (bridge.MAX_TEXT_CHARS + 1)
        r = self.client.post("/translate", json={"text": big, "sourceLanguage": "sw", "targetLanguage": "en"})
        self.assertEqual(r.status_code, 400)

    def test_translate_never_crashes_on_non_json_body(self):
        r = self.client.post("/translate", data="not json", content_type="text/plain")
        self.assertEqual(r.status_code, 400)
        self.assertFalse(r.get_json()["success"])

    def test_cors_allows_localhost_origin(self):
        r = self.client.get("/health", headers={"Origin": "http://localhost:8080"})
        self.assertEqual(r.headers.get("Access-Control-Allow-Origin"), "http://localhost:8080")

    def test_cors_rejects_arbitrary_origin(self):
        r = self.client.get("/health", headers={"Origin": "https://evil.example.com"})
        self.assertNotIn("Access-Control-Allow-Origin", r.headers)

    def test_translate_fails_closed_or_succeeds_honestly(self):
        r = self.client.post("/translate", json={"text": "Habari ya leo?", "sourceLanguage": "sw", "targetLanguage": "en"})
        body = r.get_json()
        if bridge._holder.loaded:
            # REAL model available in this environment: prove real sw -> en.
            self.assertEqual(r.status_code, 200)
            self.assertTrue(body["success"])
            self.assertTrue(body["isReal"])
            self.assertTrue(body["translatedText"])
            self.assertIsInstance(body["latencyMs"], (int, float))
        else:
            # Model genuinely unavailable in this environment: must fail
            # closed, never fabricate a translation.
            self.assertEqual(r.status_code, 503)
            self.assertFalse(body["success"])
            self.assertFalse(body["isReal"])
            self.assertIsNone(body["translatedText"])
            self.assertTrue(body["reason"])


if __name__ == "__main__":
    print(f"[test_nllb_http_bridge] Model loaded in this run: {bridge._holder.loaded} "
          f"({bridge._holder.load_error or 'ok'})", file=sys.stderr)
    unittest.main(verbosity=2)
