"""Konfigurasi pipeline: default di sini, ditimpa config.yaml, lalu variabel lingkungan untuk rahasia."""
from __future__ import annotations

import copy
import logging
import os
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import yaml


def load_dotenv(path: str | Path) -> int:
    """Muat KEY=VALUE dari file .env ke os.environ tanpa menimpa variabel yang sudah ada."""
    p = Path(path)
    if not p.is_file():
        return 0
    n = 0
    for line in p.read_text(encoding="utf-8-sig").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        k = k.strip().removeprefix("export ").strip()
        v = v.strip()
        if len(v) >= 2 and v[0] == v[-1] and v[0] in "'\"":
            v = v[1:-1]
        if k and k not in os.environ:
            os.environ[k] = v
            n += 1
    return n


load_dotenv(Path(__file__).resolve().parent / ".env")

PKG_DIR = Path(__file__).resolve().parent
WIB = timezone(timedelta(hours=7))

DEFAULTS: dict[str, Any] = {
    "run": {"data_dir": "data", "lookback_days": 1, "log_level": "INFO"},
    "mediacloud": {
        "api_key_env": "MEDIACLOUD_API_KEY",
        "collection_ids": [],
        "queries": {},           # label -> query, mis. {"Garut": "(padi OR gabah) AND garut"}
        "max_per_query": 1000,
    },
    "fetch": {
        "min_interval_sec": 2.0, "max_workers": 8, "timeout_sec": 20, "respect_robots": True,
        "block_threshold": 15, "use_wayback": True,
        "user_agent": "Mozilla/5.0 (compatible; TemuTaniNewsBot/1.0; +mailto:ganti-email@example.com)",
    },
    "preprocess": {"min_words": 80},
    "ner": {
        "model": "cahya/bert-base-indonesian-NER", "score_min": 0.70, "max_tokens": 256,
        "batch_size": 16, "device": "auto",
        "keep_types": ["PER", "ORG", "NOR", "GPE", "LOC", "FAC", "EVT", "PRD", "LAW", "QTY", "MON"],
    },
    "classifier": {
        "targets": ["Garut", "Cianjur"], "min_body_mentions": 2,
        "require_topic": True, "topic_min_hits": 3, "national_min_hits": 4,
    },
    "summary": {
        "method": "auto",        # auto | idt5 | lead
        "model_path": "",        # folder hasil fine-tuning (berisi inference_config.json) atau repo HF
        "max_input_len": 512, "max_new_tokens": 128, "num_beams": 4, "no_repeat_ngram": 3,
        "prefix": "ringkas: ", "lead_sentences": 2, "max_words": 45, "min_entity_precision": 0.8,
        "max_words_llm": 60,
        "llm": {                 # dipakai method llm (atau auto bila model_path kosong dan API key ada)
            "base_url": "https://api.groq.com/openai/v1", "api_key_env": "GROQ_API_KEY",
            "model": "openai/gpt-oss-20b", "temperature": 0.2, "max_tokens": 700,
            "max_chars": 6000,         # ~1.500 token input per artikel
            "min_interval_sec": 8.0,   # free tier Groq: 8.000 token/menit -> sekitar 1 artikel per 8 detik
            "max_retries": 3, "timeout_sec": 60,
            "extra_body": {"reasoning_effort": "low"},   # model gpt-oss: penalaran singkat agar token hemat
        },
    },
    "digest": {
        "kabupaten": ["Garut", "Cianjur"], "max_local": 5, "max_national": 3, "max_chars": 3500,
        "skip_if_empty": True,
        "footer": "Dikirim otomatis oleh Temu Tani. Balas STOP untuk berhenti berlangganan.",
        "llm": {"enabled": False, "ollama_url": "http://localhost:11434", "model": "qwen2.5:7b", "timeout_sec": 180},
    },
    "notify": {
        "enabled": False,         # False = dry-run (hanya mencatat, tidak mengirim)
        "waha_url": "http://localhost:3000", "api_key_env": "WAHA_API_KEY", "session": "default",
        "delay_sec": [4, 9], "recipients_source": "supabase", "recipients_csv": "",
    },
    "storage": {"supabase": {"enabled": False, "url_env": "SUPABASE_URL", "key_env": "SUPABASE_SERVICE_ROLE_KEY"}},
    "export": {"web_csv": "../backend/data/berita_pipeline.csv", "keep_days": 90},
}


def _merge(base: dict, over: dict) -> dict:
    out = copy.deepcopy(base)
    for k, v in (over or {}).items():
        out[k] = _merge(out[k], v) if isinstance(v, dict) and isinstance(out.get(k), dict) else v
    return out


@dataclass
class Context:
    """Konteks satu kali jalan: tanggal, folder kerja, konfigurasi."""
    cfg: dict
    run_date: date
    force: bool = False
    dry_run: bool = False
    extras: dict = field(default_factory=dict)

    @property
    def data_dir(self) -> Path:
        p = Path(self.cfg["run"]["data_dir"])
        return p if p.is_absolute() else PKG_DIR / p

    @property
    def run_dir(self) -> Path:
        d = self.data_dir / "runs" / self.run_date.isoformat()
        d.mkdir(parents=True, exist_ok=True)
        return d

    @property
    def state_dir(self) -> Path:
        d = self.data_dir / "state"
        d.mkdir(parents=True, exist_ok=True)
        return d

    def path(self, name: str) -> Path:
        return self.run_dir / name

    def resolve(self, p: str) -> Path:
        q = Path(p)
        return q if q.is_absolute() else (PKG_DIR / q).resolve()

    def secret(self, env_name: str) -> str:
        return os.getenv(env_name, "").strip()


def load_config(path: str | None) -> dict:
    cfg = DEFAULTS
    if path:
        p = Path(path)
        if not p.exists():
            raise FileNotFoundError(f"Config tidak ditemukan: {p}")
        cfg = _merge(DEFAULTS, yaml.safe_load(p.read_text(encoding="utf-8")) or {})
    logging.basicConfig(level=cfg["run"]["log_level"], format="%(asctime)s %(levelname)s [%(name)s] %(message)s")
    for noisy in ("httpx", "httpcore", "urllib3", "huggingface_hub"):
        logging.getLogger(noisy).setLevel(logging.WARNING)
    return cfg


def today_wib() -> date:
    return datetime.now(WIB).date()