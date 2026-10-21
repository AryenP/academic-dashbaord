#!/usr/bin/env bash
# Puts your Anthropic API key where Runway needs it, then scores the AI on the eval set.
# Run it yourself; the key is read from the terminal and never printed or committed.
#
#   ./scripts/set-ai-key.sh
set -euo pipefail
cd "$(dirname "$0")/.."
printf 'Anthropic API key (input hidden): '
read -rs KEY
echo
case "$KEY" in sk-ant-*) ;; *) echo "That doesn't look like an Anthropic key (sk-ant-…)."; exit 1;; esac
echo "→ Supabase secret for the live functions"
supabase secrets set ANTHROPIC_API_KEY="$KEY" >/dev/null
echo "→ local functions env (.env.functions.local, git-ignored)"
touch .env.functions.local
grep -v '^ANTHROPIC_API_KEY=' .env.functions.local > .env.functions.local.tmp || true
printf 'ANTHROPIC_API_KEY=%s\n' "$KEY" >> .env.functions.local.tmp
mv .env.functions.local.tmp .env.functions.local
echo "→ eval: Haiku 5.5 (the default) and Opus 5.5"
ANTHROPIC_API_KEY="$KEY" npm run -s eval:classify -- --ai --model claude-haiku-5-5
ANTHROPIC_API_KEY="$KEY" npm run -s eval:classify -- --ai --model claude-opus-5-5
echo
echo "Done. Redeploy nothing: the live functions read the secret on their next start."
echo "If the live gateway is in one of its 503 spells, give it 20–40 minutes."
