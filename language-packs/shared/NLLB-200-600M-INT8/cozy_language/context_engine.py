import json
import os
import re


class CozyContextEngine:

    def __init__(self, knowledge_dir="cozy_language/knowledge"):

        self.knowledge_dir = knowledge_dir
        self.knowledge = {}

        self.load_knowledge()

    def load_knowledge(self):

        if not os.path.isdir(self.knowledge_dir):
            return

        for filename in os.listdir(self.knowledge_dir):

            if not filename.endswith(".json"):
                continue

            path = os.path.join(
                self.knowledge_dir,
                filename
            )

            try:
                with open(path, "r", encoding="utf-8") as f:
                    data = json.load(f)

                language = data.get("language")
                domain = data.get("domain")

                if language and domain:

                    self.knowledge[
                        (language, domain)
                    ] = data

            except Exception as e:

                print(
                    f"Warning: could not load {filename}: {e}"
                )

    def normalize(self, text):

        text = text.strip()

        text = re.sub(
            r"\s+",
            " ",
            text
        )

        return text

    def exact_match(
        self,
        text,
        source_lang,
        domain
    ):

        text = self.normalize(text)

        data = self.knowledge.get(
            (source_lang, domain)
        )

        if not data:
            return None

        phrases = data.get(
            "phrases",
            {}
        )

        # Exact match first
        if text in phrases:

            return phrases[text]["meaning"]

        # Case-insensitive match
        lowered = text.lower()

        for phrase, value in phrases.items():

            if phrase.lower() == lowered:

                return value["meaning"]

        return None

    def correct(
        self,
        text,
        source_lang,
        domain="general"
    ):

        result = self.exact_match(
            text,
            source_lang,
            domain
        )

        if result:
            return {
                "text": result,
                "corrected": True,
                "source": "knowledge"
            }

        return {
            "text": text,
            "corrected": False,
            "source": "original"
        }
