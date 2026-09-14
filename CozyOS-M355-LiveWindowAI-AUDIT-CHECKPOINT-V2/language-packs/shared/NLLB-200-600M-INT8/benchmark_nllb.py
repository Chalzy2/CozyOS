import time
from nllb_engine import NLLBEngine

engine = NLLBEngine()

tests = [
    "Habari.",
    "Habari za leo?",
    "Bwana awabariki.",
    "Leo tunamshukuru Mungu kwa wema wake.",
    "Ndugu zangu, karibu katika ibada ya leo.",
]

print()
print("=== NLLB LIVE TRANSLATION BENCHMARK ===")
print()

for text in tests:

    start = time.perf_counter()

    result = engine.translate(
        text,
        "swh_Latn",
        "eng_Latn"
    )

    elapsed = time.perf_counter() - start

    print("SOURCE :", text)
    print("RESULT :", result)
    print(f"TIME   : {elapsed:.3f} seconds")
    print("-" * 50)

