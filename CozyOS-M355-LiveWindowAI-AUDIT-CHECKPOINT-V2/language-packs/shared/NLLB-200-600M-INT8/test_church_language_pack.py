"""
Dedicated regression suite for cozy_language/church_language_pack.py
(the 512-line worship/pastor Kiswahili phrase pack + human-interpretation
dispatcher).

DISCLOSURE:
  - This suite imports and calls the REAL module. No mocks of the
    implementation under test.
  - It does NOT modify CHURCH_PHRASES, HUMAN_SW_PHRASES, or any other
    dictionary in the pack, and does NOT add new worship phrases.
  - It only exercises functions/data that already exist:
        normalize, normalize_words, lookup_phrase,
        interpret_church_sentence, interpret_human_kiswahili
        (and its layer_1/layer_2/layer_3 building blocks)
  - Confirmed callers before writing this suite:
        live_interpreter_engine.py imports only `normalize` and
        `interpret_church_sentence` from this module.
        `interpret_human_kiswahili` (and every HUMAN_* layer function)
        has NO caller anywhere else in the repository — it is tested
        here as existing, currently-unwired capability, exactly as it
        exists today. This suite does not wire it in.
  - church_sw.json is loaded by a *different* module
    (cozy_language/context_engine.py), not by church_language_pack.py.
    It is inspected/asserted on separately below for the "no private/
    personal Founder Story content" requirement, but its loader is out
    of scope for this file's tests.

Run with:
    python3 test_church_language_pack.py
"""

import json
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import cozy_language.church_language_pack as clp

CHURCH_SW_JSON_PATH = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    "cozy_language", "knowledge", "church_sw.json",
)


# ============================================================
# 1. WORSHIP GREETINGS (CHURCH_PHRASES via normalize())
# ============================================================

class WorshipGreetingsTests(unittest.TestCase):

    def test_capitalized_greeting_matches(self):
        # Exact-case form as it is stored in CHURCH_PHRASES.
        result = clp.normalize("Habari ya leo?")
        self.assertTrue(result["matched"])
        self.assertEqual(result["interpretation"], "How are you today?")

    def test_lowercase_greeting_FIXED(self):
        """
        Previously failed: WORD_CORRECTIONS["habar"] = "habari" was
        applied via a raw substring .replace() inside normalize_words(),
        and "habar" is itself a substring of the already-correct word
        "habari", so "habari" was corrupted to "habarii" before lookup
        ever ran. Fixed by matching WORD_CORRECTIONS on word boundaries.
        """
        result = clp.normalize("habari ya leo?")
        self.assertEqual(result["normalized"], "habari ya leo?")
        self.assertTrue(result["matched"])
        self.assertEqual(result["interpretation"], "How are you today?")

    def test_typo_variant_is_corrected_and_matches(self):
        # This is the case WORD_CORRECTIONS["habar"] was actually
        # written for: the genuine STT-style typo "habar ya leo?".
        result = clp.normalize("habar ya leo?")
        self.assertEqual(result["normalized"], "habari ya leo?")
        self.assertTrue(result["matched"])
        self.assertEqual(result["interpretation"], "How are you today?")

    def test_plural_greeting_capitalized(self):
        result = clp.normalize("Habari za leo?")
        self.assertTrue(result["matched"])
        self.assertEqual(result["interpretation"], "How are you today?")

    def test_full_congregation_greeting_capitalized(self):
        result = clp.normalize("Habari zenu siku ya leo?")
        self.assertTrue(result["matched"])
        self.assertEqual(result["interpretation"], "How are you today?")


# ============================================================
# 2. PASTOR SPEECH (dynamic templates via interpret_church_sentence)
# ============================================================

class PastorSpeechTests(unittest.TestCase):

    def test_welcome_with_church_name_inserted(self):
        result = clp.interpret_church_sentence(
            "Karibuni kanisani Mavueni Newlife Kilifi"
        )
        self.assertEqual(
            result, "Welcome to our church, Mavueni Newlife Kilifi."
        )

    def test_welcome_without_name_falls_back_to_generic(self):
        result = clp.interpret_church_sentence("karibuni kanisani")
        self.assertEqual(result, "Welcome to our church.")

    def test_welcome_singular_form_with_name(self):
        result = clp.interpret_church_sentence("Karibu kanisani Newlife")
        self.assertEqual(result, "Welcome to our church, Newlife.")

    def test_call_to_worship_phrases(self):
        self.assertEqual(
            clp.interpret_church_sentence("Tumsifu Mungu"), "Let us praise God."
        )
        self.assertEqual(
            clp.interpret_church_sentence("Tuombe"), "Let us pray."
        )

    def test_unrecognized_sentence_returns_none(self):
        result = clp.interpret_church_sentence(
            "Leo nataka kuzungumza kuhusu jambo geni kabisa."
        )
        self.assertIsNone(result)


# ============================================================
# 3. BLESSINGS
# ============================================================

class BlessingsTests(unittest.TestCase):

    def test_mungu_awabariki(self):
        self.assertEqual(
            clp.normalize("mungu awabariki")["interpretation"],
            "May God bless you.",
        )

    def test_mungu_awabariki_sana(self):
        self.assertEqual(
            clp.normalize("mungu awabariki sana")["interpretation"],
            "May God richly bless you.",
        )

    def test_mungu_akubariki_via_church_sentence(self):
        # Only registered in interpret_church_sentence, not CHURCH_PHRASES.
        self.assertEqual(
            clp.interpret_church_sentence("Mungu akubariki"),
            "May God bless you.",
        )
        self.assertIsNone(clp.lookup_phrase("mungu akubariki"))


# ============================================================
# 4. COMMON WORSHIP PHRASES
# ============================================================

class CommonWorshipPhraseTests(unittest.TestCase):

    def test_amen(self):
        self.assertEqual(clp.normalize("Amen")["interpretation"], "Amen.")

    def test_haleluya(self):
        self.assertEqual(
            clp.normalize("Haleluya")["interpretation"], "Hallelujah!"
        )

    def test_english_spelling_hallelujah_also_registered(self):
        self.assertEqual(
            clp.normalize("Hallelujah")["interpretation"], "Hallelujah!"
        )

    def test_bwana_yesu_asifiwe_with_and_without_exclamation(self):
        self.assertEqual(
            clp.normalize("Bwana Yesu asifiwe")["interpretation"],
            "Praise the Lord Jesus!",
        )
        self.assertEqual(
            clp.normalize("Bwana Yesu asifiwe!")["interpretation"],
            "Praise the Lord Jesus!",
        )

    def test_ndugu_zangu(self):
        self.assertEqual(
            clp.normalize("Ndugu zangu")["interpretation"], "My brethren."
        )


# ============================================================
# 5. HUMAN-INTERPRETATION DISPATCH
# ============================================================

class HumanInterpretationDispatchTests(unittest.TestCase):
    """
    interpret_human_kiswahili() is NOT called anywhere else in the
    repository (confirmed by repo-wide search). These tests exercise it
    as existing, standalone capability exactly as implemented today.
    """

    def test_agreement_layer_reachable(self):
        self.assertEqual(clp.interpret_human_kiswahili("ndio"), "Yes.")
        self.assertEqual(clp.interpret_human_kiswahili("hapana"), "No.")

    def test_feelings_layer_reachable(self):
        self.assertEqual(
            clp.interpret_human_kiswahili("nimechoka"), "I am tired."
        )

    def test_family_layer_reachable(self):
        self.assertEqual(
            clp.interpret_human_kiswahili("mama yangu"), "My mother."
        )

    def test_money_layer_reachable(self):
        self.assertEqual(
            clp.interpret_human_kiswahili("bei gani"), "What price?"
        )

    def test_kenyan_conversational_layer_reachable(self):
        self.assertEqual(
            clp.interpret_human_kiswahili("niaje"), "How are you?"
        )

    def test_stt_variant_layer_reachable(self):
        self.assertEqual(
            clp.interpret_human_kiswahili("tafadh"), "tafadhali"
        )

    def test_regression_layer_takes_precedence_over_layer_2(self):
        """
        Documents REAL current precedence, not the "Layer 1 -> Layer 2
        -> Layer 3" order claimed by the file's own section comment.
        HUMAN_KISWAHILI_REGRESSION_FIXES is checked before Layer 1/2/3,
        so 'sawa' resolves to the regression dict's wording ("Okay.")
        rather than HUMAN_SW_PHRASES' wording ("Okay / Alright.").
        See FAILURES/GAPS: the in-file comment does not match the real
        dispatch order.
        """
        self.assertEqual(clp.interpret_human_kiswahili("sawa"), "Okay.")

    def test_single_word_habari_via_layer_1_FIXED(self):
        """
        Same root cause as test_lowercase_greeting_FIXED: Layer 1 also
        calls normalize_words() first. Now that WORD_CORRECTIONS matches
        on word boundaries, "habari" (HUMAN_SW_PHRASES) resolves.
        """
        self.assertEqual(
            clp.interpret_human_kiswahili("habari"), "Hello / How are you?"
        )


# ============================================================
# 6. KNOWN / UNKNOWN PHRASE BEHAVIOR
# ============================================================

class KnownUnknownPhraseTests(unittest.TestCase):

    def test_known_phrase_matches(self):
        self.assertEqual(
            clp.lookup_phrase("bwana asifiwe"), "Praise the Lord!"
        )

    def test_unknown_phrase_returns_none_not_a_guess(self):
        self.assertIsNone(clp.lookup_phrase("hii sio maneno ya kanisa kabisa"))
        self.assertIsNone(
            clp.interpret_human_kiswahili("hii sio maneno ya kanisa kabisa")
        )

    def test_unknown_phrase_via_normalize_is_honest(self):
        result = clp.normalize("kitu kisichojulikana kabisa")
        self.assertFalse(result["matched"])
        self.assertIsNone(result["interpretation"])
        # Original text is preserved verbatim even when unmatched.
        self.assertEqual(result["original"], "kitu kisichojulikana kabisa")


# ============================================================
# 7. NORMALIZATION / CASE BEHAVIOR
# ============================================================

class NormalizationCaseTests(unittest.TestCase):

    def test_lookup_is_case_insensitive_for_already_normalized_text(self):
        # "BWANA ASIFIWE" contains no WORD_CORRECTIONS substrings, so
        # this path is unaffected by the habar/habari issue and proves
        # case-insensitivity genuinely works when nothing corrupts it.
        result = clp.normalize("BWANA ASIFIWE")
        self.assertTrue(result["matched"])
        self.assertEqual(result["interpretation"], "Praise the Lord!")

    def test_leading_trailing_whitespace_is_stripped(self):
        result = clp.normalize("   bwana asifiwe   ")
        self.assertTrue(result["matched"])

    def test_word_corrections_no_longer_corrupt_already_correct_text_FIXED(self):
        """
        Root-cause isolation test: WORD_CORRECTIONS now matches on word
        boundaries, so "habar" -> "habari" only fires when "habar"
        stands as its own word, and no longer fires on "habari" (where
        "habar" was previously matched as a bare substring).
        """
        self.assertEqual(clp.normalize_words("habari"), "habari")
        self.assertEqual(clp.normalize_words("Habari"), "Habari")
        # The genuine typo this correction targets still works.
        self.assertEqual(clp.normalize_words("habar"), "habari")


# ============================================================
# 8. OUTPUT STRUCTURE
# ============================================================

class OutputStructureTests(unittest.TestCase):

    def test_normalize_returns_expected_keys_and_types(self):
        result = clp.normalize("bwana asifiwe")
        self.assertEqual(
            set(result.keys()),
            {"original", "normalized", "interpretation", "matched"},
        )
        self.assertIsInstance(result["original"], str)
        self.assertIsInstance(result["normalized"], str)
        self.assertIsInstance(result["matched"], bool)

    def test_interpret_church_sentence_returns_str_or_none(self):
        matched = clp.interpret_church_sentence("tuombe")
        unmatched = clp.interpret_church_sentence("random text here")
        self.assertIsInstance(matched, str)
        self.assertIsNone(unmatched)

    def test_interpret_human_kiswahili_returns_str_or_none(self):
        matched = clp.interpret_human_kiswahili("ndio")
        unmatched = clp.interpret_human_kiswahili("random text here")
        self.assertIsInstance(matched, str)
        self.assertIsNone(unmatched)


# ============================================================
# 9. LANGUAGE IDENTITY / NO ENGLISH MASQUERADING AS KISWAHILI
# ============================================================

class LanguageIdentityTests(unittest.TestCase):

    def test_church_phrases_keys_are_not_english(self):
        # Spot-check: none of the Kiswahili dictionary keys are common
        # English greeting words that would indicate an English phrase
        # accidentally filed as a "Kiswahili" entry.
        english_words = {"hello", "goodbye", "thanks", "welcome", "amen "}
        for key in clp.CHURCH_PHRASES:
            self.assertNotIn(key.strip().lower(), english_words - {"amen "})

    def test_plain_english_input_does_not_match_worship_dictionary(self):
        for phrase in ("hello pastor", "good morning everyone", "thank you very much"):
            result = clp.normalize(phrase)
            self.assertFalse(
                result["matched"],
                f"English phrase {phrase!r} should not match the Kiswahili worship dictionary",
            )

    def test_plain_english_input_does_not_match_human_dispatch(self):
        for phrase in ("hello", "good morning", "thank you"):
            self.assertIsNone(
                clp.interpret_human_kiswahili(phrase),
                f"English phrase {phrase!r} should not resolve through the Kiswahili dispatcher",
            )

    def test_interpretation_is_genuinely_translated_not_echoed(self):
        # The English meaning must not simply be the Kiswahili input
        # echoed back (would indicate a no-op "translation").
        result = clp.normalize("bwana asifiwe")
        self.assertNotEqual(
            result["interpretation"].strip().lower(), "bwana asifiwe"
        )

    def test_church_sw_json_declares_swahili_language_tag(self):
        with open(CHURCH_SW_JSON_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
        self.assertEqual(data.get("language"), "swh_Latn")
        self.assertEqual(data.get("domain"), "church")


# ============================================================
# 10. NO PRIVATE / PERSONAL FOUNDER STORY CONTENT
# ============================================================

class NoFounderStoryLeakTests(unittest.TestCase):

    FORBIDDEN_TERMS = ("founder", "personal story", "my story", "biography")

    def test_church_language_pack_source_has_no_founder_content(self):
        pack_path = os.path.join(
            os.path.dirname(os.path.abspath(__file__)),
            "cozy_language", "church_language_pack.py",
        )
        with open(pack_path, "r", encoding="utf-8") as f:
            source_lower = f.read().lower()
        for term in self.FORBIDDEN_TERMS:
            self.assertNotIn(
                term, source_lower,
                f"church_language_pack.py should not contain {term!r}",
            )

    def test_church_sw_json_has_no_founder_content(self):
        with open(CHURCH_SW_JSON_PATH, "r", encoding="utf-8") as f:
            raw_lower = f.read().lower()
        for term in self.FORBIDDEN_TERMS:
            self.assertNotIn(
                term, raw_lower,
                f"church_sw.json should not contain {term!r}",
            )


# ============================================================
# 11. MALFORMED / UNKNOWN INPUT FAILS HONESTLY
# ============================================================

class MalformedInputTests(unittest.TestCase):

    def test_empty_string_is_handled_honestly(self):
        result = clp.normalize("")
        self.assertFalse(result["matched"])
        self.assertIsNone(result["interpretation"])
        self.assertEqual(result["original"], "")

    def test_whitespace_only_is_handled_honestly(self):
        result = clp.normalize("    ")
        self.assertFalse(result["matched"])

    def test_interpret_human_kiswahili_rejects_non_string_input_safely(self):
        # The dispatcher layers explicitly guard with
        # `if not isinstance(text, str): return None`.
        self.assertIsNone(clp.interpret_human_kiswahili(None))
        self.assertIsNone(clp.interpret_human_kiswahili(12345))
        self.assertIsNone(clp.interpret_human_kiswahili(["habari"]))

    def test_interpret_church_sentence_rejects_empty_string_honestly(self):
        self.assertIsNone(clp.interpret_church_sentence(""))

    def test_normalize_fails_safely_on_none_FIXED(self):
        """
        Previously: normalize(None) raised AttributeError. Fixed by
        giving normalize() the same isinstance(text, str) guard already
        used by every HUMAN_* layer function.
        """
        result = clp.normalize(None)
        self.assertEqual(result["original"], None)
        self.assertIsNone(result["normalized"])
        self.assertIsNone(result["interpretation"])
        self.assertFalse(result["matched"])

    def test_normalize_fails_safely_on_int(self):
        result = clp.normalize(123)
        self.assertEqual(result["original"], 123)
        self.assertFalse(result["matched"])
        self.assertIsNone(result["interpretation"])

    def test_normalize_fails_safely_on_dict(self):
        result = clp.normalize({})
        self.assertEqual(result["original"], {})
        self.assertFalse(result["matched"])
        self.assertIsNone(result["interpretation"])

    def test_normalize_fails_safely_on_list(self):
        result = clp.normalize([])
        self.assertEqual(result["original"], [])
        self.assertFalse(result["matched"])
        self.assertIsNone(result["interpretation"])

    def test_normalize_words_fails_safely_on_non_string_FIXED(self):
        self.assertIsNone(clp.normalize_words(None))
        self.assertIsNone(clp.normalize_words(123))
        self.assertIsNone(clp.normalize_words({}))
        self.assertIsNone(clp.normalize_words([]))


if __name__ == "__main__":
    unittest.main(verbosity=2)
