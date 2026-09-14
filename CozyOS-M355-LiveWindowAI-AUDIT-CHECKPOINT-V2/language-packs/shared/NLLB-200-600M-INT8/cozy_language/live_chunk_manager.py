import re
import time


class LiveChunkManager:
    """
    CozyOS Live Semantic Chunk Manager

    Designed for live speech interpretation.

    Goals:
    - release complete sentences immediately
    - recognize natural spoken transitions
    - avoid releasing tiny fragments
    - prevent very long NLLB requests
    - preserve proper-name phrases inside a chunk
    - support 1–3 second live interpretation
    """

    END_MARKERS = (
        ".",
        "?",
        "!",
        "…",
    )

    PAUSE_WORDS = (
        "sasa",
        "kwa hiyo",
        "lakini",
        "ndugu zangu",
        "wapendwa",
        "leo",
        "basi",
    )

    def __init__(
        self,
        min_words=2,
        max_words=30,
        pause_words=16,
    ):
        self.min_words = min_words
        self.max_words = max_words
        self.pause_words = pause_words

        self.buffer = ""
        self.last_update = None

    # ==================================================
    # ADD SPEECH
    # ==================================================

    def add_text(self, text):

        text = text.strip()

        if not text:
            return None

        if self.buffer:
            self.buffer += " " + text
        else:
            self.buffer = text

        self.last_update = time.perf_counter()

        return self.check()

    # ==================================================
    # CHECK BUFFER
    # ==================================================

    def check(self):

        text = self.buffer.strip()

        if not text:
            return None

        words = text.split()

        # --------------------------------------------------
        # Don't release tiny fragments.
        # --------------------------------------------------

        if len(words) < self.min_words:
            return None

        # --------------------------------------------------
        # 1. Explicit sentence ending.
        # Highest priority.
        # --------------------------------------------------

        if text.endswith(self.END_MARKERS):

            self.buffer = ""
            self.last_update = None

            return text

        # --------------------------------------------------
        # 2. Search for a complete sentence inside the buffer.
        #
        # This matters when STT gives us:
        #
        # "Karibuni kanisani. Leo tunamshukuru Mungu..."
        #
        # We should release the first sentence immediately.
        # --------------------------------------------------

        match = re.search(
            r"^(.+?[.!?…])(?:\s+|$)",
            text
        )

        if match:

            chunk = match.group(1).strip()
            remainder = text[len(match.group(0)):].strip()

            if len(chunk.split()) >= self.min_words:

                self.buffer = remainder
                self.last_update = (
                    time.perf_counter()
                    if remainder
                    else None
                )

                return chunk

        # --------------------------------------------------
        # 3. Natural spoken transition.
        #
        # Example:
        #
        # "Ndugu zangu karibu katika ibada ya leo sasa..."
        #
        # Don't split immediately on every pause word.
        # Only consider it when the chunk is already substantial.
        # --------------------------------------------------

        lowered = text.lower()

        if len(words) >= self.pause_words:

            for pause in self.PAUSE_WORDS:

                pattern = r"\b" + re.escape(pause) + r"\b"

                matches = list(
                    re.finditer(pattern, lowered)
                )

                if not matches:
                    continue

                match = matches[-1]

                before = text[:match.start()].strip()
                after = text[match.start():].strip()

                if len(before.split()) >= self.min_words:

                    self.buffer = after
                    self.last_update = time.perf_counter()

                    return before

        # --------------------------------------------------
        # 4. Hard safety limit.
        #
        # Never allow a huge speech segment to reach NLLB.
        # --------------------------------------------------

        if len(words) >= self.max_words:

            chunk_words = words[:self.max_words]

            self.buffer = " ".join(
                words[self.max_words:]
            )

            self.last_update = (
                time.perf_counter()
                if self.buffer
                else None
            )

            return " ".join(chunk_words)

        return None

    # ==================================================
    # FORCE FLUSH
    # ==================================================

    def flush(self):

        text = self.buffer.strip()

        self.buffer = ""
        self.last_update = None

        return text if text else None
