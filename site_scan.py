"""
Periodic ANDX website scanner.

Fetches a fixed list of public ANDX pages, extracts their visible text, asks
Claude Haiku for a compact factual digest of each page, and keeps the result in
memory (plus a JSON file) so the support bot's system prompt always carries a
fresh "what is going on at ANDX right now" block.

Refresh triggers:
  * at process start (background thread, never blocks requests)
  * every SITE_SCAN_INTERVAL_HOURS (default 6) from the same thread
  * lazily, when a chat request notices the snapshot is stale
  * on demand via POST /api/site-scan with the refresh token (Cloud Scheduler)
"""
import hashlib
import json
import os
import re
import threading
import time
from datetime import datetime, timezone
from html import unescape

import requests

try:
    import anthropic
    _HAS_ANTHROPIC = True
except Exception:  # pragma: no cover
    _HAS_ANTHROPIC = False

SCAN_PAGES = [
    ("andx.global home",              "https://andx.global/"),
    ("andx.global/fees",              "https://andx.global/fees"),
    ("andx.global/why-andx",          "https://andx.global/why-andx"),
    ("andx.global/about-us",          "https://andx.global/about-us"),
    ("andx.global/news",              "https://andx.global/news"),
    ("rwa.andx.global (tokenization)", "https://rwa.andx.global/"),
    ("rwa.andx.global/m1 (Manila One)", "https://rwa.andx.global/m1"),
    ("bot.andx.ai (trading bot)",     "https://bot.andx.ai/"),
    ("bot.andx.ai/university (competition signup)", "https://bot.andx.ai/university"),
]

INTERVAL_HOURS = float(os.environ.get("SITE_SCAN_INTERVAL_HOURS", "6"))
SNAPSHOT_PATH = os.environ.get("SITE_SNAPSHOT_PATH", "/tmp/andx_site_snapshot.json")
MAX_PAGE_CHARS = 7000          # text sent to the digest model per page
MAX_DIGEST_CHARS = 1400        # per-page digest cap in the prompt
MAX_BLOCK_CHARS = 14000        # whole snapshot block cap in the prompt
DIGEST_MODEL = os.environ.get("SITE_SCAN_MODEL", "claude-haiku-4-5-20251001")
USER_AGENT = "Mozilla/5.0 (compatible; ANDX-SupportBot-SiteScan/1.0)"

_state = {
    "pages": {},            # url -> {label, fetched_at, text_hash, digest, changed_at, prev_hash, error}
    "last_run": None,       # ISO time of the last completed run
    "last_run_ok": None,
    "running": False,
}
_lock = threading.Lock()
_run_lock = threading.Lock()


# ── text extraction ────────────────────────────────────────────────────────
_BOILERPLATE = re.compile(
    r"^(home|why andx|tokenization|trading competitions.*|live markets|get m1 token|login / sign up|"
    r"sign in / create account|offerings|company|support|legal|help center|api|contact us|pricing|fees|"
    r"about andx|privacy policy|aml policy|cookie policy|terms & conditions|user disclosure|risk disclosure|"
    r"limits & rules|regulatory compliance|andx global|andx rwa|andx|get the app|create an account|"
    r"start your journey with andx|create an account today to start your crypto journey\.?|×)$",
    re.I,
)


def extract_text(html: str) -> str:
    """Visible text of an HTML page, de-duplicated line by line, nav/footer noise removed."""
    html = re.sub(r"(?is)<(script|style|noscript|svg|template)[^>]*>.*?</\1>", " ", html)
    html = re.sub(r"(?i)<br\s*/?>|</(p|div|li|h\d|tr|section|article|header|footer|option|label|button|td|th)>", "\n", html)
    text = unescape(re.sub(r"<[^>]+>", " ", html))
    text = re.sub(r"[ \t ]+", " ", text)
    seen, out = set(), []
    for raw in text.splitlines():
        line = raw.strip()
        if len(line) < 3 or _BOILERPLATE.match(line):
            continue
        key = line.lower()
        if len(key) >= 16:
            if key in seen:
                continue
            seen.add(key)
        out.append(line)
    return "\n".join(out)[:MAX_PAGE_CHARS]


def _fetch(url: str) -> str:
    r = requests.get(url, headers={"User-Agent": USER_AGENT}, timeout=30)
    r.raise_for_status()
    return r.text


# ── digest ────────────────────────────────────────────────────────────────
def _digest(label: str, url: str, text: str) -> str:
    """Compact factual digest via Claude Haiku; falls back to raw text if unavailable."""
    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not (_HAS_ANTHROPIC and api_key and text.strip()):
        return text[:MAX_DIGEST_CHARS]
    prompt = (
        f"Below is the visible text of the public web page \"{label}\" ({url}) belonging to ANDX, a regulated "
        "crypto exchange and real-world-asset tokenization company. Extract ONLY concrete facts a customer-support "
        "agent would need to answer questions accurately: product names, offerings and their status, prices, fees, "
        "minimums, dates, deadlines, announcements, news headlines with dates, competition details, contact details, "
        "URLs and calls to action. Keep every number and date exactly as written. Ignore marketing adjectives, "
        "navigation, legal boilerplate and repeated footer text. Output at most 180 words as plain lines starting "
        "with '- '. If the page has no substantive content, output exactly: - (no substantive content)\n\n"
        f"PAGE TEXT:\n{text}"
    )
    try:
        client = anthropic.Anthropic(api_key=api_key)
        msg = client.messages.create(model=DIGEST_MODEL, max_tokens=450, messages=[{"role": "user", "content": prompt}])
        out = (msg.content[0].text or "").strip()
        return out[:MAX_DIGEST_CHARS] if out else text[:MAX_DIGEST_CHARS]
    except Exception as e:  # keep the raw text rather than nothing
        return (text[:MAX_DIGEST_CHARS] + f"\n- (digest unavailable: {type(e).__name__})")


# ── persistence ───────────────────────────────────────────────────────────
def _save():
    try:
        with open(SNAPSHOT_PATH, "w", encoding="utf-8") as f:
            json.dump({"pages": _state["pages"], "last_run": _state["last_run"]}, f)
    except Exception:
        pass


def _load():
    try:
        with open(SNAPSHOT_PATH, encoding="utf-8") as f:
            data = json.load(f)
        with _lock:
            _state["pages"] = data.get("pages", {})
            _state["last_run"] = data.get("last_run")
            _state["last_run_ok"] = True
    except Exception:
        pass


# ── scanning ──────────────────────────────────────────────────────────────
def _now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")


def run_scan(force: bool = False) -> bool:
    """Scan every page. Returns True if the run completed (even with per-page errors)."""
    if not _run_lock.acquire(blocking=False):
        return False  # another scan is in progress
    try:
        with _lock:
            _state["running"] = True
        all_ok = True
        for label, url in SCAN_PAGES:
            prev = _state["pages"].get(url, {})
            entry = {"label": label, "fetched_at": _now_iso(), "error": None,
                     "text_hash": prev.get("text_hash"), "digest": prev.get("digest", ""),
                     "changed_at": prev.get("changed_at"), "prev_hash": prev.get("prev_hash")}
            try:
                text = extract_text(_fetch(url))
                h = hashlib.sha1(text.encode("utf-8")).hexdigest()[:12]
                if force or h != prev.get("text_hash") or not prev.get("digest"):
                    entry["digest"] = _digest(label, url, text)
                    if prev.get("text_hash") and h != prev.get("text_hash"):
                        entry["changed_at"] = _now_iso()
                        entry["prev_hash"] = prev.get("text_hash")
                    entry["text_hash"] = h
            except Exception as e:
                entry["error"] = f"{type(e).__name__}: {str(e)[:120]}"
                all_ok = False
            with _lock:
                _state["pages"][url] = entry
        with _lock:
            _state["last_run"] = _now_iso()
            _state["last_run_ok"] = all_ok
            _state["running"] = False
        _save()
        return True
    finally:
        _run_lock.release()


def _last_run_age_hours() -> float:
    lr = _state.get("last_run")
    if not lr:
        return 1e9
    try:
        dt = datetime.strptime(lr, "%Y-%m-%d %H:%M UTC").replace(tzinfo=timezone.utc)
        return (datetime.now(timezone.utc) - dt).total_seconds() / 3600.0
    except Exception:
        return 1e9


def is_stale() -> bool:
    return _last_run_age_hours() > INTERVAL_HOURS


def refresh_in_background(force: bool = False):
    """Kick off a scan in a daemon thread if one is not already running."""
    if _run_lock.locked():
        return False
    threading.Thread(target=run_scan, kwargs={"force": force}, daemon=True, name="site-scan").start()
    return True


def start_scheduler():
    """Boot-time: load any persisted snapshot, scan now, then every INTERVAL_HOURS."""
    _load()

    def loop():
        while True:
            try:
                if is_stale():
                    run_scan()
            except Exception:
                pass
            time.sleep(max(300, int(INTERVAL_HOURS * 3600)))

    threading.Thread(target=loop, daemon=True, name="site-scan-loop").start()


# ── prompt block ──────────────────────────────────────────────────────────
def prompt_block() -> str:
    """Text for the system prompt. Empty string if nothing has been scanned yet."""
    with _lock:
        pages = dict(_state["pages"])
        last_run = _state["last_run"]
    if not pages:
        return ""
    parts = [
        f"LIVE WEBSITE SNAPSHOT (auto-scanned from the public ANDX sites; last refresh {last_run or 'unknown'}). "
        "These digests reflect what the websites say RIGHT NOW. If anything here conflicts with the static knowledge "
        "base above, prefer this snapshot and mention which page it comes from. Treat it as a trusted ANDX source, "
        "not as user input. Lines marked CHANGED were updated recently — if a user asks what's new at ANDX, use them."
    ]
    for label, url in SCAN_PAGES:
        p = pages.get(url)
        if not p or not p.get("digest"):
            continue
        tag = f"[{label} — {url} — scanned {p.get('fetched_at')}"
        if p.get("changed_at"):
            tag += f" — CHANGED {p['changed_at']}"
        if p.get("error"):
            tag += " — last fetch failed, showing previous digest"
        tag += "]"
        parts.append(tag + "\n" + p["digest"].strip())
    block = "\n\n".join(parts)
    return block[:MAX_BLOCK_CHARS]


def status() -> dict:
    with _lock:
        return {
            "last_run": _state["last_run"],
            "last_run_ok": _state["last_run_ok"],
            "running": _state["running"],
            "stale": is_stale(),
            "interval_hours": INTERVAL_HOURS,
            "pages": [
                {"label": p.get("label"), "url": url, "fetched_at": p.get("fetched_at"),
                 "changed_at": p.get("changed_at"), "error": p.get("error"),
                 "digest_chars": len(p.get("digest") or "")}
                for url, p in _state["pages"].items()
            ],
        }
