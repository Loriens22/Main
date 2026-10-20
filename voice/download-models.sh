#!/bin/sh
# Downloads the speech models used by the voice service into $1 (default /models).
set -eu
DEST="${1:-/models}"
BASE="https://github.com/k2-fsa/sherpa-onnx/releases/download"
mkdir -p "$DEST"
cd "$DEST"
fetch() {
  url="$1"; out="$2"
  for i in 1 2 3 4; do
    if curl -fsSL --retry 3 -o "$out" "$url"; then return 0; fi
    echo "retry $i for $url"; sleep $((i * 3))
  done
  return 1
}
if [ ! -d nemo-asr ]; then
  fetch "$BASE/asr-models/sherpa-onnx-nemo-streaming-fast-conformer-transducer-en-480ms-int8.tar.bz2" asr.tar.bz2
  tar xjf asr.tar.bz2 && rm asr.tar.bz2
  mv sherpa-onnx-nemo-streaming-fast-conformer-transducer-en-480ms-int8 nemo-asr
  rm -rf nemo-asr/test_wavs
fi
if [ ! -d kokoro ]; then
  fetch "$BASE/tts-models/kokoro-multi-lang-v1_0.tar.bz2" tts.tar.bz2
  tar xjf tts.tar.bz2 && rm tts.tar.bz2
  mv kokoro-multi-lang-v1_0 kokoro
  # English-only deployment: drop the Chinese text-normalisation assets.
  rm -rf kokoro/dict kokoro/lexicon-zh.txt kokoro/date-zh.fst kokoro/number-zh.fst kokoro/phone-zh.fst
fi
ls -la "$DEST" "$DEST/nemo-asr" "$DEST/kokoro"
