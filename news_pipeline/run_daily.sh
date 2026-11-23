#!/usr/bin/env bash
# Jalankan pipeline berita harian (dipanggil cron). Rahasia dibaca dari news_pipeline/.env bila ada.
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f news_pipeline/.env ] && set -a && . news_pipeline/.env && set +a
mkdir -p news_pipeline/data/logs
exec python3 -m news_pipeline.run_daily --config news_pipeline/config.yaml "$@" \
  >> "news_pipeline/data/logs/$(date +%F).log" 2>&1
