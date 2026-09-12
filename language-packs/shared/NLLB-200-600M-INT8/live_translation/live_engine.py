import time
import sys
import os

sys.path.insert(
    0,
    os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
)

from nllb_engine import NLLBEngine
from live_translation.phrase_buffer import PhraseBuffer


class LiveTranslationEngine:

    def __init__(
        self,
        source_lang="swh_Latn",
        target_lang="eng_Latn",
        pause_ms=500
    ):
        print("Initializing Live Translation Engine...")

        self.source_lang = source_lang
        self.target_lang = target_lang

        self.translator = NLLBEngine()

        self.buffer = PhraseBuffer(
            pause_ms=pause_ms
        )

        print("Live Translation Engine READY")

    def process_text(self, text):

        start = time.perf_counter()

        self.buffer.add(text)

        if not self.buffer.should_flush():
            return None

        phrase = self.buffer.flush()

        if not phrase:
            return None

        translation_start = time.perf_counter()

        result = self.translator.translate(
            phrase,
            self.source_lang,
            self.target_lang
        )

        translation_time = (
            time.perf_counter() - translation_start
        )

        total_time = (
            time.perf_counter() - start
        )

        return {
            "source": phrase,
            "translation": result,
            "translation_seconds": translation_time,
            "pipeline_seconds": total_time
        }


if __name__ == "__main__":

    engine = LiveTranslationEngine()

    print()
    print("LIVE TRANSLATION TEST")
    print("Type phrases as if they are coming from speech.")
    print("Press Enter after each phrase.")
    print()

    while True:

        try:
            text = input("PASTOR > ")

            if text.lower() in ("exit", "quit"):
                break

            result = engine.process_text(text)

            if result:
                print()
                print("TRANSLATION >", result["translation"])
                print(
                    "NLLB TIME > "
                    f"{result['translation_seconds']:.3f}s"
                )
                print()

        except KeyboardInterrupt:
            break
