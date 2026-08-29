#!/usr/bin/env bash
#
# scripts/verify-production-routing.sh
#
# Reproducible, read-only verification that cozyos.org is actually routing
# /webauthn/*, /auth/*, /admin and /chalzydashboard to the Render backend
# (server/static-boundary-server.js) rather than to Cloudflare Pages'
# static index.html.
#
# Dependency-light on purpose: only `curl` and core POSIX utilities
# (grep/sed/awk, already on Termux and any Linux box). No jq requirement.
#
# This script NEVER reads, stores, or transmits credentials, cookies,
# passkeys, secrets, or tokens. Every request below is unauthenticated
# (no -u, no -H "Cookie: ..." with a real value). The optional Part 3
# ("real session cookie flags") only INSPECTS a Set-Cookie header the
# server itself already sent back in response to a login YOU perform
# interactively in a browser and paste the raw header from — this script
# never asks for or handles the cookie's actual value, only its flags.
#
# ARCHITECTURE (offline-testable / online-live split):
#   This file is written so it can be `source`d without making any network
#   call: sourcing it only defines functions and does nothing else. The
#   classify_* functions below are pure — given a status code, a
#   content-type string, and a path to a body file, they decide
#   PASS/WARN/FAIL with no curl, no network, no environment dependency.
#   `main()` is the only part of this file that touches the network (via
#   `fetch`), and `main()` only runs when this file is executed directly,
#   not when it's sourced. That split is what lets
#   test/deployment/verify-production-routing-offline.test.js exercise the
#   real decision logic with fabricated HTTP responses, with zero network
#   access required, while the actual live check against
#   https://cozyos.org still only happens when you run this script
#   directly (e.g. from Termux).
#
# Usage (live, from an environment with real network access):
#   ./scripts/verify-production-routing.sh
#   BASE_URL=https://cozyos.org ./scripts/verify-production-routing.sh
#   ./scripts/verify-production-routing.sh --set-cookie-header 'Set-Cookie: cozy_admin_session=...; Secure; HttpOnly; SameSite=Strict; Path=/'
#
set -u

# ---------------------------------------------------------------------
# Pure, network-free helpers and classifiers. Safe to source and call
# directly from tests with fabricated inputs.
# ---------------------------------------------------------------------

# Resolve a writable temp work directory without ever assuming /tmp
# exists or is writable (it may not be, e.g. under Termux). Falls back
# TMPDIR -> /tmp -> current directory. Prints the resolved, created
# directory path on stdout; caller is responsible for removing it.
resolve_workdir() {
  local base="${TMPDIR:-/tmp}"
  if [ ! -d "$base" ] || [ ! -w "$base" ]; then
    base="."
  fi
  local dir
  dir="$(mktemp -d "$base/cozyos-verify.XXXXXX" 2>/dev/null || echo "$base/cozyos-verify.$$")"
  mkdir -p "$dir" 2>/dev/null
  echo "$dir"
}

# True (exit 0) if the given file's content looks like an HTML document
# shell (i.e. contains an <html tag), false otherwise.
body_looks_like_html_shell_file() {
  local file="$1"
  [ -f "$file" ] && grep -qi '<html' "$file" 2>/dev/null
}

# Emits "PASS::message", "WARN::message", or "FAIL::message" on stdout.
# Never touches the network; args are fabricated or previously-fetched
# status/content-type/body.

classify_root() {
  local status="$1"
  if [ "$status" = "200" ]; then
    echo "PASS::/ returned 200"
  else
    echo "WARN::/ returned HTTP $status (expected 200)"
  fi
}

classify_webauthn_session_route() {
  # Part 1 per-route classification for /webauthn/session.
  local status="$1" ctype="$2" bodyfile="$3"
  if [ "$status" = "401" ] && echo "$ctype" | grep -qi 'application/json'; then
    if body_looks_like_html_shell_file "$bodyfile"; then
      echo "FAIL::/webauthn/session returned JSON content-type but HTML-looking body — check for a proxy misconfig"
    else
      echo "PASS::/webauthn/session returned 401 application/json as expected from the Render backend"
    fi
  elif body_looks_like_html_shell_file "$bodyfile"; then
    echo "FAIL::/webauthn/session returned HTML (looks like Cloudflare Pages' index.html, not the Render backend) — routing is NOT hitting Render"
  else
    echo "WARN::/webauthn/session returned HTTP $status / ${ctype:-<none>} — not the expected 401 JSON; inspect manually"
  fi
}

classify_webauthn_session_body() {
  # Part 2 deeper check: does the body actually look like the Node
  # backend's {"authenticated":...} JSON shape?
  local ctype="$1" bodyfile="$2"
  if echo "$ctype" | grep -qi 'application/json' && grep -q '"authenticated"' "$bodyfile" 2>/dev/null; then
    echo "PASS::/webauthn/session body contains the expected {\"authenticated\":...} shape from the Node backend"
  elif body_looks_like_html_shell_file "$bodyfile"; then
    echo "FAIL::/webauthn/session returned an HTML document — this means the request is landing on Cloudflare Pages' static site, not Render. Same-origin routing (Origin Rule / DNS-to-Render) is not in effect."
  else
    echo "WARN::/webauthn/session body did not match the expected JSON shape and was not HTML either — inspect manually"
  fi
}

classify_auth_route() {
  local path="$1" status="$2" ctype="$3" bodyfile="$4"
  if body_looks_like_html_shell_file "$bodyfile" && echo "$ctype" | grep -qi 'text/html'; then
    echo "WARN::$path returned an HTML shell — could be a legitimate redirect/login page from the backend, or could be Pages' index.html. Inspect manually if unsure."
  else
    echo "PASS::$path did not return a generic HTML shell"
  fi
}

classify_admin_route() {
  local status="$1" bodyfile="$2"
  if [ "$status" = "404" ]; then
    echo "PASS::/admin correctly returns 404 unauthenticated (matches CP4 local verification)"
  elif body_looks_like_html_shell_file "$bodyfile" && grep -qi 'chalzy\|administrator' "$bodyfile" 2>/dev/null; then
    echo "FAIL::/admin appears to have returned administrator HTML unauthenticated — SECURITY ISSUE, investigate immediately"
  else
    echo "WARN::/admin returned HTTP $status (expected 404) — confirm this matches intended behavior, not necessarily a routing failure"
  fi
}

classify_chalzydashboard_route() {
  local status="$1" ctype="$2" bodyfile="$3"
  if [ "$status" = "200" ] && body_looks_like_html_shell_file "$bodyfile"; then
    echo "PASS::/chalzydashboard returned 200 HTML (gate page — confirm manually it is the login gate, not admin content, since this script cannot authenticate)"
  else
    echo "WARN::/chalzydashboard returned HTTP $status / ${ctype:-<none>} — inspect manually"
  fi
}

# Checks a single expected flag (case-insensitive substring match)
# against a raw Set-Cookie header string. Emits PASS::/FAIL:: like the
# other classifiers.
classify_cookie_flag() {
  local set_cookie_header="$1" flag="$2"
  if echo "$set_cookie_header" | grep -qi "$flag"; then
    echo "PASS::Set-Cookie includes $flag"
  else
    echo "FAIL::Set-Cookie is missing $flag"
  fi
}

# ---------------------------------------------------------------------
# Networked orchestration. Only runs via main(), which is only invoked
# when this file is executed directly (see the guard at the bottom).
# ---------------------------------------------------------------------

main() {
  BASE_URL="${BASE_URL:-https://cozyos.org}"
  SET_COOKIE_HEADER=""
  CURL_TIMEOUT="${CURL_TIMEOUT:-10}"

  while [ $# -gt 0 ]; do
    case "$1" in
      --base-url)
        BASE_URL="$2"; shift 2 ;;
      --set-cookie-header)
        SET_COOKIE_HEADER="$2"; shift 2 ;;
      -h|--help)
        sed -n '2,40p' "$0"; return 0 ;;
      *)
        echo "Unknown argument: $1" >&2; return 2 ;;
    esac
  done

  PASS=0
  FAIL=0
  WARN=0

  report() {
    # Consumes a "PASS::msg" / "WARN::msg" / "FAIL::msg" line and prints
    # + tallies it.
    local line="$1"
    local kind="${line%%::*}"
    local msg="${line#*::}"
    case "$kind" in
      PASS) PASS=$((PASS+1)); printf '  \033[32mPASS\033[0m  %s\n' "$msg" ;;
      WARN) WARN=$((WARN+1)); printf '  \033[33mWARN\033[0m  %s\n' "$msg" ;;
      FAIL) FAIL=$((FAIL+1)); printf '  \033[31mFAIL\033[0m  %s\n' "$msg" ;;
      *)    FAIL=$((FAIL+1)); printf '  \033[31mFAIL\033[0m  (unrecognized classifier output: %s)\n' "$line" ;;
    esac
  }

  command -v curl >/dev/null 2>&1 || { echo "curl is required and was not found on PATH." >&2; return 3; }

  echo "== CozyOS production routing verification =="
  echo "Base URL: $BASE_URL"
  echo "Date:     $(date -u '+%Y-%m-%d %H:%M:%S UTC' 2>/dev/null || date)"
  echo

  WORKDIR="$(resolve_workdir)"
  TMP_HEADERS="$WORKDIR/headers"
  TMP_BODY="$WORKDIR/body"
  TMP_STATUS="$WORKDIR/status"
  TMP_ERR="$WORKDIR/err"
  cleanup() { rm -rf "$WORKDIR"; }
  trap cleanup EXIT

  # fetch PATH_ -> sets STATUS, CTYPE (lowercased), writes body to TMP_BODY
  fetch() {
    local path="$1"
    curl -sS -m "$CURL_TIMEOUT" -D "$TMP_HEADERS" -o "$TMP_BODY" \
      -w '%{http_code}' "$BASE_URL$path" > "$TMP_STATUS" 2>"$TMP_ERR"
    STATUS="$(cat "$TMP_STATUS" 2>/dev/null)"
    CURL_ERR="$(cat "$TMP_ERR" 2>/dev/null)"
    CTYPE="$(grep -i '^content-type:' "$TMP_HEADERS" | tail -1 | sed 's/^[Cc]ontent-[Tt]ype:[[:space:]]*//I' | tr -d '\r' | tr 'A-Z' 'a-z')"
  }

  echo "--- Part 1: status + content-type for each path ---"

  declare -a ROUTES=(
    "/|root|Frontend root (Cloudflare Pages or Render both may serve this)"
    "/webauthn/session|webauthn_session|Should hit Render backend, not Pages index.html"
    "/auth/google|auth|Representative /auth/* route (server/auth/google-login-endpoint.js)"
    "/admin|admin|Forbidden admin alias — must never leak admin HTML unauthenticated"
    "/chalzydashboard|chalzydashboard|Canonical admin entry — gate page only, unauthenticated"
  )

  for entry in "${ROUTES[@]}"; do
    IFS='|' read -r path kind desc <<< "$entry"
    fetch "$path"
    if [ -z "$STATUS" ] || [ "$STATUS" = "000" ]; then
      report "FAIL::$path -> no response (curl error: ${CURL_ERR:-unknown})"
      continue
    fi
    echo "  $path -> HTTP $STATUS, Content-Type: ${CTYPE:-<none>}"
    echo "         ($desc)"

    case "$kind" in
      root)              report "$(classify_root "$STATUS")" ;;
      webauthn_session)  report "$(classify_webauthn_session_route "$STATUS" "$CTYPE" "$TMP_BODY")" ;;
      auth)              report "$(classify_auth_route "$path" "$STATUS" "$CTYPE" "$TMP_BODY")" ;;
      admin)             report "$(classify_admin_route "$STATUS" "$TMP_BODY")" ;;
      chalzydashboard)   report "$(classify_chalzydashboard_route "$STATUS" "$CTYPE" "$TMP_BODY")" ;;
    esac
    echo
  done

  echo "--- Part 2: is /webauthn/session hitting Render, not Pages? ---"
  fetch "/webauthn/session"
  report "$(classify_webauthn_session_body "$CTYPE" "$TMP_BODY")"
  echo

  echo "--- Part 3: production Set-Cookie flags (optional, requires a real login) ---"
  if [ -n "$SET_COOKIE_HEADER" ]; then
    report "$(classify_cookie_flag "$SET_COOKIE_HEADER" "Secure")"
    report "$(classify_cookie_flag "$SET_COOKIE_HEADER" "HttpOnly")"
    report "$(classify_cookie_flag "$SET_COOKIE_HEADER" "SameSite=Strict")"
    report "$(classify_cookie_flag "$SET_COOKIE_HEADER" "Path=/")"
  else
    echo "  Skipped: no --set-cookie-header supplied."
    echo "  To check this, perform a real passkey login against $BASE_URL in a"
    echo "  browser, copy the raw 'Set-Cookie' response header for"
    echo "  cozy_admin_session from your browser's network inspector, and re-run:"
    echo
    echo "    ./scripts/verify-production-routing.sh --set-cookie-header 'Set-Cookie: cozy_admin_session=<redact-the-value-yourself>; Secure; HttpOnly; SameSite=Strict; Path=/'"
    echo
    echo "  This script never asks for, logs, or needs the cookie's actual value —"
    echo "  only the flag list after it. Redact the value before pasting if you"
    echo "  want to be extra safe; the flags are all this script inspects."
    WARN=$((WARN+1))
  fi
  echo

  echo "== Summary =="
  echo "  Pass: $PASS   Fail: $FAIL   Warn: $WARN"
  echo

  if [ "$FAIL" -gt 0 ]; then
    echo "Result: FAIL — production routing is not confirmed correct. See failures above."
    return 1
  elif [ "$WARN" -gt 0 ]; then
    echo "Result: PASS WITH WARNINGS — no hard failures, but some checks need manual eyes (see WARN lines)."
    return 0
  else
    echo "Result: PASS — all automated checks passed."
    return 0
  fi
}

# Only run main() — which is the only part of this file that touches the
# network — when this script is executed directly. When sourced (as the
# offline test suite does), this is a no-op: only function definitions
# are loaded, no HTTP request is made, no network access is required.
if [ "${BASH_SOURCE[0]:-$0}" = "${0}" ]; then
  main "$@"
  exit $?
fi
