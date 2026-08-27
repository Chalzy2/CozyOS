import time


class PhraseBuffer:
    def __init__(self, pause_ms=500, max_chars=240):
        self.pause_ms = pause_ms
        self.max_chars = max_chars
        self.text = ""
        self.last_update = 0.0

    def add(self, text):
        text = text.strip()

        if not text:
            return

        if self.text:
            self.text += " "

        self.text += text
        self.last_update = time.perf_counter()

    def should_flush(self):
        if not self.text:
            return False

        elapsed_ms = (time.perf_counter() - self.last_update) * 1000

        return (
            elapsed_ms >= self.pause_ms
            or len(self.text) >= self.max_chars
            or self.text.endswith((".", "?", "!", "…"))
        )

    def flush(self):
        result = self.text.strip()
        self.text = ""
        self.last_update = 0.0
        return result
