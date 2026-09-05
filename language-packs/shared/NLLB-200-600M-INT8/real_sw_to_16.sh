#!/data/data/com.termux/files/usr/bin/bash
# real_sw_to_16.sh
#
# CURL-ONLY FALLBACK — use this only if `node` is not installed.
#
# DISCLOSURE: this script talks to the bridge (POST /translate) directly
# via curl. It proves the bridge -> real NLLB model path, but it does
# NOT exercise core/modules/speech/adapters/speech-translation-provider-nllb.js
# (the actual JS provider layer). For the full, spec-required
# "JS provider -> HTTP bridge -> real NLLB model" proof (implementation
# spec item 17), install Node and run real_sw_to_16.js instead:
#     pkg install nodejs-lts
#     node real_sw_to_16.js
#
# USAGE
#   ./real_sw_to_16.sh [bridgeBaseUrl]
#   Default bridgeBaseUrl: http://127.0.0.1:8177

set -u

BASE_URL="${1:-http://127.0.0.1:8177}"
SOURCE="sw"
SOURCE_TEXT="Habari ya leo?"
TARGETS=(en fr ar so ru zh ha yo luo ki kam zu am ln ig hi)

echo "=== /health ==="
curl -s "${BASE_URL}/health"
echo
echo

echo "=== REAL sw -> en ==="
start_ms=$(($(date +%s%N)/1000000))
resp=$(curl -s -X POST "${BASE_URL}/translate" \
  -H "Content-Type: application/json" \
  -d "{\"text\":\"${SOURCE_TEXT}\",\"sourceLanguage\":\"${SOURCE}\",\"targetLanguage\":\"en\"}")
end_ms=$(($(date +%s%N)/1000000))
echo "$resp"
echo "single translation wall latency: $((end_ms - start_ms))ms"
echo

echo "=== REAL sw -> 16 fan-out ==="
success_count=0
fanout_start_ms=$(($(date +%s%N)/1000000))

for target in "${TARGETS[@]}"; do
  resp=$(curl -s -X POST "${BASE_URL}/translate" \
    -H "Content-Type: application/json" \
    -d "{\"text\":\"${SOURCE_TEXT}\",\"sourceLanguage\":\"${SOURCE}\",\"targetLanguage\":\"${target}\"}")
  echo "target=${target} response=${resp}"
  if echo "$resp" | grep -q '"success": *true' || echo "$resp" | grep -q '"success":true'; then
    success_count=$((success_count + 1))
  fi
done

fanout_end_ms=$(($(date +%s%N)/1000000))

echo
echo "sw -> 16 result: ${success_count}/16 succeeded"
echo "16-target fan-out wall latency: $((fanout_end_ms - fanout_start_ms))ms"
