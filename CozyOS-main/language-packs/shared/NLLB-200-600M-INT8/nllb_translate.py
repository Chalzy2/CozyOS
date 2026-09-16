import numpy as np
import onnxruntime as ort
from tokenizers import Tokenizer

MODEL_DIR = "."

SOURCE_LANG = "eng_Latn"
TARGET_LANG = "swh_Latn"

DECODER_START = 2
EOS = 2
MAX_LENGTH = 100

text = "Hello, how are you?"

tokenizer = Tokenizer.from_file(
    f"{MODEL_DIR}/tokenizer.json"
)

# ---------- TOKENIZE SOURCE ----------
encoded = tokenizer.encode(text)

source_ids = np.array(
    [encoded.ids],
    dtype=np.int64
)

source_mask = np.ones_like(
    source_ids,
    dtype=np.int64
)

print("SOURCE:", text)
print("SOURCE IDs:", encoded.ids)
print("SOURCE TOKENS:", encoded.tokens)

# ---------- ENCODER ----------
encoder = ort.InferenceSession(
    f"{MODEL_DIR}/encoder_model_int8.onnx",
    providers=["CPUExecutionProvider"]
)

encoder_hidden = encoder.run(
    None,
    {
        "input_ids": source_ids,
        "attention_mask": source_mask
    }
)[0]

print("ENCODER:", encoder_hidden.shape)

# ---------- DECODER ----------
decoder = ort.InferenceSession(
    f"{MODEL_DIR}/decoder_model_int8.onnx",
    providers=["CPUExecutionProvider"]
)

# NLLB starts decoder with </s>, then forces target language
generated = [DECODER_START]

# First generated token must be target language.
generated.append(
    tokenizer.token_to_id(TARGET_LANG)
)

print("TARGET:", TARGET_LANG)
print("TARGET ID:", generated[-1])

for step in range(MAX_LENGTH):

    decoder_ids = np.array(
        [generated],
        dtype=np.int64
    )

    logits = decoder.run(
        None,
        {
            "encoder_attention_mask": source_mask,
            "input_ids": decoder_ids,
            "encoder_hidden_states": encoder_hidden
        }
    )[0]

    # Take prediction for the final decoder position.
    next_token = int(
        np.argmax(logits[0, -1, :])
    )

    generated.append(next_token)

    print(
        f"Step {step + 1}: token={next_token}"
    )

    if next_token == EOS:
        break

# ---------- DECODE ----------
print()
print("GENERATED IDS:")
print(generated)

result = tokenizer.decode(
    generated,
    skip_special_tokens=True
)

print()
print("TRANSLATION:")
print(result)
