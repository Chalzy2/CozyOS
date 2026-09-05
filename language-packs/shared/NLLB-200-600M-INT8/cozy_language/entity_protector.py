"""
CozyOS Named Entity Protector

Protects known church names, locations and organizations from
being accidentally translated or altered.
"""

import re


class EntityProtector:

    def __init__(self):
        self.entities = set()

    def add(self, name):
        name = name.strip()

        if name:
            self.entities.add(name)

    def add_many(self, names):
        for name in names:
            self.add(name)

    def protect(self, text):

        protected = text
        mapping = {}

        # Longest names first prevents partial replacement.
        names = sorted(
            self.entities,
            key=len,
            reverse=True
        )

        for index, name in enumerate(names):

            if not re.search(
                re.escape(name),
                protected,
                flags=re.IGNORECASE
            ):
                continue

            marker = f"__COZY_ENTITY_{index}__"

            protected = re.sub(
                re.escape(name),
                marker,
                protected,
                flags=re.IGNORECASE
            )

            mapping[marker] = name

        return protected, mapping

    def restore(self, text, mapping):

        result = text

        for marker, name in mapping.items():
            result = result.replace(marker, name)

        return result
