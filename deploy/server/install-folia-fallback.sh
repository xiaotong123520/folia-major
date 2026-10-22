#!/usr/bin/env bash
# Build an isolated Folia backend preview on a VPS with Docker and Compose v2.
# Never edits an existing BaoTa site, deploys to main, or reads existing music directories.
set -Eeuo pipefail

REPO_URL="https://github.com/xiaotong123520/folia-major.git"
BRANCH="${FOLIA_BRANCH:-feature/ai-radio-agent-v1}"
DEPLOY_DIR="${HOME}/folia-server-fallback"

for tool in git docker openssl; do
  command -v "$tool" >/dev/null || { echo "Missing dependency: $tool" >&2; exit 1; }
done
docker compose version >/dev/null || { echo "Docker Compose v2 required" >&2; exit 1; }

if [[ -e "$DEPLOY_DIR" && ! -d "$DEPLOY_DIR/.git" ]]; then
  echo "The destination exists but is not a Git repository: $DEPLOY_DIR" >&2
  exit 1
fi

if [[ ! -d "$DEPLOY_DIR/.git" ]]; then
  git clone --single-branch --branch "$BRANCH" "$REPO_URL" "$DEPLOY_DIR"
fi

cd "$DEPLOY_DIR"
if [[ -n "$(git status --porcelain)" ]]; then
  echo "Refusing to overwrite local modifications in $DEPLOY_DIR" >&2
  exit 1
fi
git fetch origin "$BRANCH"
git checkout "$BRANCH"
git merge --ff-only "origin/$BRANCH"

cd deploy/docker
if [[ ! -f .env ]]; then
  cp .env.example .env
  chmod 600 .env
  token="$(openssl rand -hex 32)"
  sed -i "s/^SYNC_TOKEN=$/SYNC_TOKEN=$token/" .env
  # BaoTa terminates TLS on a separate subdomain. Do not expose raw Docker ports.
  sed -i "s/^FOLIA_HTTP_BIND=.*/FOLIA_HTTP_BIND=127.0.0.1/" .env
  sed -i "s/^FOLIA_SYNC_BIND=.*/FOLIA_SYNC_BIND=127.0.0.1/" .env
  echo "Created private .env, with random Sync Token and loopback-only ports."
fi

docker compose -f compose.yaml -f compose.build.yaml config --quiet
docker compose -f compose.yaml -f compose.build.yaml build
docker compose -f compose.yaml -f compose.build.yaml up -d --wait
docker compose -f compose.yaml -f compose.build.yaml ps
curl --fail --silent --show-error http://127.0.0.1:18080/api/healthz
printf '\nFolia server backend is running on http://127.0.0.1:18080\n'
printf 'Use BaoTa to set up a SEPARATE HTTPS subdomain reverse-proxying to that URL.\n'
printf 'Then open Folia > Import music > My server and enter that HTTPS origin.\n'
printf 'No existing music files were copied, deleted, or scanned.\n'
