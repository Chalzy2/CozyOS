import time
from dataclasses import dataclass

from nllb_engine import NLLBEngine
from cozy_language.context_engine import CozyContextEngine
from cozy_language.live_chunk_manager import LiveChunkManager
from cozy_language.church_language_pack import normalize, interpret_church_sentence
from cozy_language.entity_protector import EntityProtector


@dataclass
class InterpretationEvent:
    source: str
    corrected: str
    translation: str
    source_lang: str
    target_lang: str
    engine: str
    latency: float
    confidence: float = 1.0
    emotion: str = "neutral"
    is_question: bool = False
    has_laughter: bool = False
    emphasis: str = "normal"
    speech_type: str = "statement"


class LiveInterpreterEngine:

    def __init__(
        self,
        source_lang="swh_Latn",
        target_lang="eng_Latn",
        mode="balanced"
    ):

        print("Loading CozyOS Live Interpreter...")

        self.source_lang = source_lang
        self.target_lang = target_lang
        self.mode = mode

        self.nllb = NLLBEngine()
        self.context = CozyContextEngine()
        self.chunker = LiveChunkManager()
        self.entities = EntityProtector()

        # --------------------------------------------------
        # Known church / location / organization entities
        # --------------------------------------------------

        self.entities.add_many([
            "Mavueni",
            "Newlife",
            "Kilifi",
            "Newlife Mavueni",
            "Newlife Mavueni Kilifi",
        ])

        self.pending = ""
        self.last_translation = ""
        self.started = time.perf_counter()

        print()
        print("CozyOS LIVE INTERPRETER READY")
        print("Source :", source_lang)
        print("Target :", target_lang)
        print("Mode   :", mode)
        print("Latency target: 1–3 seconds")

    # ==================================================
    # MODE
    # ==================================================

    def set_mode(self, mode):

        if mode not in ("fast", "balanced", "quality"):
            raise ValueError(
                "Mode must be fast, balanced or quality"
            )

        self.mode = mode

    # ==================================================
    # LEVEL 1 — LANGUAGE CORRECTION
    # ==================================================

    def correct_language(self, text):

        result = normalize(text)

        return (
            result["normalized"],
            result["matched"],
            result["interpretation"]
        )

    # ==================================================
    # LEVEL 2 — CHURCH CONTEXT
    # ==================================================

    def correct_context(self, text):
        # Level 2: church-specific semantic interpretation.
        meaning = interpret_church_sentence(text)

        if meaning:
            return meaning, True

        # Fallback to the general CozyOS context knowledge engine.
        result = self.context.correct(
            text,
            self.source_lang,
            "church"
        )

        return (
            result["text"],
            result.get("corrected", False)
        )

    # ==================================================
    # LEVEL 3 — ENTITY PROTECTION
    # ==================================================

    def protect_entities(self, text):

        return self.entities.protect(text)

    def restore_entities(self, text, mapping):

        return self.entities.restore(text, mapping)

    # ==================================================
    # QUESTION DETECTION
    # ==================================================

    def detect_question(self, text):

        text = text.strip()

        if text.endswith("?"):
            return True

        question_words = {
            "je",
            "kwani",
            "vipi",
            "nani",
            "nini",
            "wapi",
            "lini",
            "kwa nini",
            "habari"
        }

        words = text.lower().split()

        if not words:
            return False

        return words[0] in question_words

    # ==================================================
    # EMOTION DETECTION
    # ==================================================

    def detect_laughter(self, text):
        lower = text.lower()

        return (
            "haha" in lower
            or "hahaha" in lower
            or "hehe" in lower
            or "😂" in lower
            or "🤣" in lower
        )

    def detect_emphasis(self, text):
        lower = text.lower()

        strong_words = (
            "hallelujah",
            "amen",
            "asifiwe",
            "shout",
            "glory",
            "yesu",
            "mungu",
        )

        if text.count("!") >= 2:
            return "strong"

        if any(word in lower for word in strong_words):
            return "strong"

        return "normal"

    def detect_speech_type(self, text):
        if self.detect_question(text):
            return "question"

        if self.detect_laughter(text):
            return "laughter"

        lower = text.lower()

        if (
            "soma " in lower
            or "someni " in lower
            or "read " in lower
        ):
            return "instruction"

        return "statement"

    def detect_emotion(self, text):

        lower = text.lower()

        laughter = (
            "haha" in lower
            or "hahaha" in lower
            or "hehe" in lower
            or "😂" in lower
        )

        if laughter:
            return "joy"

        strong_words = (
            "hallelujah",
            "amen",
            "asifiwe",
            "shout",
            "glory"
        )

        if any(word in lower for word in strong_words):
            return "excited"

        if "!" in text:
            return "excited"

        return "neutral"

    # ==================================================
    # TRANSLATE ONE STABLE CHUNK
    # ==================================================

    def translate_chunk(self, text):

        text = text.strip()

        if not text:
            return None

        start = time.perf_counter()

        # --------------------------------------------------
        # LEVEL 1 — normalize language
        # --------------------------------------------------

        normalized, level1_match, interpretation = (
            self.correct_language(text)
        )

        corrected = normalized

        # --------------------------------------------------
        # LEVEL 2 — church knowledge
        # --------------------------------------------------

        context_text, context_fixed = (
            self.correct_context(corrected)
        )

        # If the church knowledge engine knows the phrase,
        # use its interpretation directly.
        if context_fixed and context_text != corrected:

            translation = context_text
            engine_name = "context"

        elif interpretation:

            translation = interpretation
            engine_name = "church-context"

        else:

            # --------------------------------------------------
            # LEVEL 3 — protect proper names
            # --------------------------------------------------

            protected_text, mapping = (
                self.protect_entities(corrected)
            )

            # --------------------------------------------------
            # NLLB translation
            # --------------------------------------------------

            translation = self.nllb.translate(
                protected_text,
                self.source_lang,
                self.target_lang
            )

            # --------------------------------------------------
            # Restore proper names
            # --------------------------------------------------

            translation = self.restore_entities(
                translation,
                mapping
            )

            engine_name = "nllb"

        latency = time.perf_counter() - start

        event = InterpretationEvent(
            source=text,
            corrected=corrected,
            translation=translation,
            source_lang=self.source_lang,
            target_lang=self.target_lang,
            engine=engine_name,
            latency=latency,
            confidence=1.0,
            emotion=self.detect_emotion(text),
            is_question=self.detect_question(text),
            has_laughter=self.detect_laughter(text),
            emphasis=self.detect_emphasis(text),
            speech_type=self.detect_speech_type(text)
        )

        self.last_translation = translation

        return event

    # ==================================================
    # LIVE INPUT
    # ==================================================

    def feed(self, text):

        text = text.strip()

        if not text:
            return None

        result = self.chunker.add_text(text)

        if not result:
            return None

        return self.translate_chunk(result)

    # ==================================================
    # FORCE CURRENT BUFFER
    # ==================================================

    def flush(self):

        result = self.chunker.flush()

        if not result:
            return None

        return self.translate_chunk(result)


# ======================================================
# LIVE TERMINAL TEST
# ======================================================

if __name__ == "__main__":

    engine = LiveInterpreterEngine(
        source_lang="swh_Latn",
        target_lang="eng_Latn",
        mode="balanced"
    )

    print()
    print("LIVE INTERPRETATION TEST")
    print("Type pastor speech.")
    print("Press Enter on an empty line to flush.")
    print("Type 'quit' to stop.")
    print()

    while True:

        try:
            text = input("PASTOR > ")

        except (KeyboardInterrupt, EOFError):
            print()
            break

        if text.strip().lower() == "quit":
            break

        if not text.strip():

            event = engine.flush()

        else:

            event = engine.feed(text)

        if event:

            print(
                "INTERPRETER >",
                event.translation
            )

            print(
                "ENGINE      >",
                event.engine
            )

            print(
                "LATENCY     >",
                f"{event.latency:.3f}s"
            )

            print(
                "EMOTION     >",
                event.emotion
            )

            print(
                "QUESTION    >",
                event.is_question
            )

            print()
