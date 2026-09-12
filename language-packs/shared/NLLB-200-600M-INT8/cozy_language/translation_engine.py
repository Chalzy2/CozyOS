import time

from nllb_engine import NLLBEngine
from cozy_language.context_engine import CozyContextEngine


class CozyTranslationEngine:

    def __init__(self):

        print("Loading CozyOS Translation Engine...")

        self.nllb = NLLBEngine()
        self.context = CozyContextEngine()

        print("CozyOS Translation Engine READY")

    def translate(
        self,
        text,
        source_lang,
        target_lang,
        domain="general"
    ):

        start = time.perf_counter()

        text = text.strip()

        if not text:
            return {
                "text": "",
                "source": "empty",
                "corrected": False,
                "time": 0.0
            }

        # ------------------------------------------------
        # 1. CONTEXT / KNOWLEDGE ENGINE
        # ------------------------------------------------

        if domain != "general":

            correction = self.context.correct(
                text,
                source_lang,
                domain
            )

            if correction["corrected"]:

                elapsed = time.perf_counter() - start

                return {
                    "text": correction["text"],
                    "source": "context",
                    "corrected": True,
                    "domain": domain,
                    "time": elapsed
                }

        # ------------------------------------------------
        # 2. NLLB FALLBACK
        # ------------------------------------------------

        result = self.nllb.translate(
            text,
            source_lang,
            target_lang
        )

        elapsed = time.perf_counter() - start

        return {
            "text": result,
            "source": "nllb",
            "corrected": False,
            "domain": domain,
            "time": elapsed
        }
