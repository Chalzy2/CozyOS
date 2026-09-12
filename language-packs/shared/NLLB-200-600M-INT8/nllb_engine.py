import numpy as np
import onnxruntime as ort
from tokenizers import Tokenizer
import os

MODEL_DIR = os.path.dirname(os.path.abspath(__file__))

TOKENIZER_FILE = os.path.join(MODEL_DIR, "tokenizer.json")
ENCODER_FILE = os.path.join(MODEL_DIR, "encoder_model_int8.onnx")
DECODER_FILE = os.path.join(MODEL_DIR, "decoder_model_int8.onnx")

DECODER_START = 2
EOS = 2
MAX_LENGTH = 200


class NLLBEngine:

    def __init__(self):

        print("Loading tokenizer...")
        self.tokenizer = Tokenizer.from_file(TOKENIZER_FILE)

        print("Loading encoder...")
        self.encoder = ort.InferenceSession(
            ENCODER_FILE,
            providers=["CPUExecutionProvider"]
        )

        print("Loading decoder...")
        self.decoder = ort.InferenceSession(
            DECODER_FILE,
            providers=["CPUExecutionProvider"]
        )

        self.languages = {}

        for token_id in range(256001, 256203):
            token = self.tokenizer.id_to_token(token_id)

            if token and "_" in token:
                self.languages[token] = token_id

        print(
            f"NLLB Engine ready — {len(self.languages)} language tokens"
        )


    def language_id(self, language):

        if language not in self.languages:
            raise ValueError(
                f"Unsupported language: {language}"
            )

        return self.languages[language]


    def translate(
        self,
        text,
        source_lang,
        target_lang
    ):

        if not text.strip():
            return ""

        source_id = self.language_id(source_lang)
        target_id = self.language_id(target_lang)

        # ---------- TOKENIZE ----------

        encoded = self.tokenizer.encode(
            text,
            add_special_tokens=False
        )

        source_ids = np.array(
            [[source_id] + encoded.ids + [EOS]],
            dtype=np.int64
        )

        source_mask = np.ones_like(
            source_ids,
            dtype=np.int64
        )

        # ---------- ENCODER ----------

        encoder_hidden = self.encoder.run(
            None,
            {
                "input_ids": source_ids,
                "attention_mask": source_mask
            }
        )[0]

        # ---------- DECODER ----------

        generated = [
            DECODER_START,
            target_id
        ]

        for _ in range(MAX_LENGTH):

            decoder_ids = np.array(
                [generated],
                dtype=np.int64
            )

            logits = self.decoder.run(
                None,
                {
                    "encoder_attention_mask": source_mask,
                    "input_ids": decoder_ids,
                    "encoder_hidden_states": encoder_hidden
                }
            )[0]

            next_token = int(
                np.argmax(
                    logits[0, -1, :]
                )
            )

            generated.append(next_token)

            if next_token == EOS:
                break

        # ---------- DECODE ----------

        result = self.tokenizer.decode(
            generated,
            skip_special_tokens=True
        )

        return result


if __name__ == "__main__":

    engine = NLLBEngine()

    print()
    print(
        engine.translate(
            "Hello, how are you?",
            "eng_Latn",
            "swh_Latn"
        )
    )
