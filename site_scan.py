"""
Periodic ANDX website scanner.

Fetches the public ANDX pages (all on andx.ai), extracts their visible text and
the links on each page, asks Claude Haiku for a compact factual digest of every
page, and keeps the result in memory (plus a JSON file) so the support bot's
system prompt always carries:

  * a fresh "what is going on at ANDX right now" digest per page, and
  * a CURRENT LINK DIRECTORY built from the real buttons and menu items on the
    site, so the bot hands out the links the website actually uses today.

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
from urllib.parse import urljoin, urlsplit

import requests

try:
    import anthropic
    _HAS_ANTHROPIC = True
except Exception:  # pragma: no cover
    _HAS_ANTHROPIC = False

# (label, url, deep)  deep=True pages get a longer text budget and digest (rules, signup, offerings)
SCAN_PAGES = [
    ("andx.ai home",                       "https://andx.ai/",                        False),
    ("andx.ai/how-it-works",               "https://andx.ai/how-it-works",            False),
    ("andx.ai/fees",                       "https://andx.ai/fees",                    False),
    ("andx.ai/about-us",                   "https://andx.ai/about-us",                False),
    ("andx.ai/regulatory-compliance",      "https://andx.ai/regulatory-compliance",   False),
    ("andx.ai/news",                       "https://andx.ai/news",                    False),
    ("andx.ai/m1 (Manila One)",            "https://andx.ai/m1",                      True),
    ("andx.ai/andx-tokenization",          "https://andx.ai/andx-tokenization",       True),
    ("andx.ai/offerings",                  "https://andx.ai/offerings",               False),
    ("andx.ai/contact-us",                 "https://andx.ai/contact-us",              False),
    ("andx.ai/bot-trading-competition",    "https://andx.ai/bot-trading-competition", False),
    ("rwa.andx.ai (tokenization portal)",  "https://rwa.andx.ai/",                    True),
    ("rwa.andx.ai/offerings",              "https://rwa.andx.ai/offerings",           False),
    ("rwa.andx.ai/m1 (Manila One)",        "https://rwa.andx.ai/m1",                  True),
    ("rwa.andx.ai/register-interest",      "https://rwa.andx.ai/register-interest",   False),
    ("bot.andx.ai (trading bot)",          "https://bot.andx.ai/",                    False),
    ("bot.andx.ai/university (University Trading League)", "https://bot.andx.ai/university", True),
    ("bot.andx.ai/university/rules (official competition rules)", "https://bot.andx.ai/university/rules", True),
]

INTERVAL_HOURS = float(os.environ.get("SITE_SCAN_INTERVAL_HOURS", "6"))
SNAPSHOT_PATH = os.environ.get("SITE_SNAPSHOT_PATH", "/tmp/andx_site_snapshot.json")
MAX_PAGE_CHARS = 9000          # text sent to the digest model per page
MAX_PAGE_CHARS_DEEP = 22000    # for deep pages (rules / signup / tokenization)
MAX_DIGEST_CHARS = 1500        # per-page digest cap in the prompt
MAX_DIGEST_CHARS_DEEP = 3200
MAX_LINKS_CHARS = 3500         # link directory cap in the prompt
MAX_BLOCK_CHARS = 36000        # whole snapshot block cap in the prompt
DIGEST_MODEL = os.environ.get("SITE_SCAN_MODEL", "claude-haiku-4-5-20251001")
USER_AGENT = "Mozilla/5.0 (compatible; ANDX-SupportBot-SiteScan/2.0)"
LINK_HOSTS = re.compile(r"(^|\.)(andx\.(ai|one|global)|andxus\.io)$|apps\.apple\.com|play\.google\.com|onelink\.to")
# Old hosts that still appear in some footers/buttons → the live .ai equivalents (everything ANDX is on andx.ai)
_HOST_CANON = [
    (re.compile(r"^https?://(www\.)?platform\.andx\.(one|global)"), "https://platform.andx.ai"),
    (re.compile(r"^https?://(www\.)?rwa\.andx\.global"), "https://rwa.andx.ai"),
    (re.compile(r"^https?://(www\.)?andx\.global"), "https://andx.ai"),
    (re.compile(r"^https?://(www\.)?andxus\.io"), "https://andx.ai"),
]


def _canon(url: str) -> str:
    for pat, repl in _HOST_CANON:
        if pat.match(url):
            return pat.sub(repl, url, count=1)
    return url

_state = {
    "pages": {},            # url -> {label, fetched_at, text_hash, digest, changed_at, prev_hash, error, links}
    "last_run": None,       # time of the last completed run
    "last_run_ok": None,
    "running": False,
}
_lock = threading.Lock()
_run_lock = threading.Lock()


# ── text + link extraction ───────────────────────────────────────────────
_BOILERPLATE = re.compile(
    r"^(home|why andx|tokenization|rwa tokens|crypto exchange|andx pay|live markets|overview|market insights|news|"
    r"ai analytics|trading competitions.*|get m1 token|get manila one token.*|explore manila one.*|trade crypto.*|"
    r"login / sign up|sign in / create account|offerings|all offerings.*|company|support|legal|help center|api|"
    r"contact us|pricing|fees|trading|about andx|privacy policy|aml policy|cookie policy|terms & conditions|"
    r"user disclosure|risk disclosure|limits & rules|regulatory compliance|andx global|andx rwa|andx|get the app|"
    r"create an account|start your journey with andx|create an account today.*|ios app|android app|choose your path.*|×)$",
    re.I,
)
_SKIP_LINK_TEXT = re.compile(r"^(privacy policy|cookie policy|aml policy|user disclosure|terms & conditions)$", re.I)


def extract_text(html: str, deep: bool = False) -> str:
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
        if len(key) >= 16:          # short values like "$0.00" or "Yes" may legitimately repeat
            if key in seen:
                continue
            seen.add(key)
        out.append(line)
    return "\n".join(out)[:MAX_PAGE_CHARS_DEEP if deep else MAX_PAGE_CHARS]


def extract_links(html: str, base_url: str):
    """[(anchor text, absolute url)] for every ANDX-related link, de-duplicated, in page order."""
    links, seen = [], set()
    for m in re.finditer(r'<a\b[^>]*?href="([^"#]+)"[^>]*>(.*?)</a>', html, re.S | re.I):
        href = unescape(m.group(1).strip())
        if href.startswith(("javascript:", "tel:")):
            continue
        url = urljoin(base_url, href)
        if url.startswith("mailto:"):
            host = "mailto"
        else:
            host = urlsplit(url).netloc.lower()
            if not LINK_HOSTS.search(host):
                continue
            if "/portal/api/" in url or re.search(r"\.(css|js|png|jpe?g|svg|ico|woff2?)(\?|$)", url, re.I):
                continue
            # keep real query strings (Google Play needs ?id=...), drop tracking ones
            url = re.sub(r"[?&](utm_[^&]*|igsh=[^&]*|s=\d+)", "", url).rstrip("?&")
            url = _canon(url.rstrip("/") or url)
        text = re.sub(r"\s+", " ", unescape(re.sub(r"<[^>]+>", " ", m.group(2)))).strip()
        text = re.sub(r"^[^A-Za-z0-9$€₱]+", "", text)[:60].strip()
        if not text or _SKIP_LINK_TEXT.match(text):
            continue
        key = (text.lower(), url)
        if key in seen:
            continue
        seen.add(key)
        links.append((text, url))
    return links[:60]


def _fetch(url: str) -> str:
    r = requests.get(url, headers={"User-Agent": USER_AGENT}, timeout=30)
    r.raise_for_status()
    return r.text


# ── digest ────────────────────────────────────────────────────────────────
def _digest(label: str, url: str, text: str, links, deep: bool) -> str:
    """Compact factual digest via Claude Haiku; falls back to raw text if unavailable."""
    cap = MAX_DIGEST_CHARS_DEEP if deep else MAX_DIGEST_CHARS
    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not (_HAS_ANTHROPIC and api_key and text.strip()):
        return text[:cap]
    link_lines = "\n".join(f"- [{t}] -> {u}" for t, u in links[:40])
    words = 420 if deep else 200
    prompt = (
        f"Below is the visible text of the public web page \"{label}\" ({url}) belonging to ANDX, a regulated "
        "crypto exchange and real-world-asset tokenization company, followed by the links/buttons on that page. "
        "Extract ONLY concrete facts a customer-support agent needs to answer questions accurately: product names, "
        "offerings and their status, prices, fees, minimums, returns, dates, deadlines, rules, step-by-step "
        "instructions (how to sign up / buy / connect), prize amounts, announcements, news headlines with dates, "
        "contact details, and where each important button or call-to-action leads (quote the exact URL). Keep every "
        "number, date and URL exactly as written. Ignore marketing adjectives, navigation menus, legal boilerplate and "
        f"repeated footer text. Output at most {words} words as plain lines starting with '- '. If the page has no "
        "substantive content, output exactly: - (no substantive content)\n\n"
        f"PAGE TEXT:\n{text}\n\nLINKS AND BUTTONS ON THIS PAGE:\n{link_lines or '(none)'}"
    )
    try:
        client = anthropic.Anthropic(api_key=api_key)
        msg = client.messages.create(model=DIGEST_MODEL, max_tokens=1000 if deep else 500,
                                     messages=[{"role": "user", "content": prompt}])
        out = (msg.content[0].text or "").strip()
        return out[:cap] if out else text[:cap]
    except Exception as e:  # keep the raw text rather than nothing
        return (text[:cap] + f"\n- (digest unavailable: {type(e).__name__})")


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
        for label, url, deep in SCAN_PAGES:
            prev = _state["pages"].get(url, {})
            entry = {"label": label, "fetched_at": _now_iso(), "error": None,
                     "text_hash": prev.get("text_hash"), "digest": prev.get("digest", ""),
                     "changed_at": prev.get("changed_at"), "prev_hash": prev.get("prev_hash"),
                     "links": prev.get("links", [])}
            try:
                html = _fetch(url)
                text = extract_text(html, deep)
                links = extract_links(html, url)
                entry["links"] = links
                h = hashlib.sha1((text + "\n".join(u for _, u in links)).encode("utf-8")).hexdigest()[:12]
                if force or h != prev.get("text_hash") or not prev.get("digest"):
                    entry["digest"] = _digest(label, url, text, links, deep)
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
    """Boot-time: load any persisted snapshot, scan now if stale, then every INTERVAL_HOURS."""
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
def link_directory() -> str:
    """One line per distinct (button text -> url) across all scanned pages, most useful first."""
    with _lock:
        pages = dict(_state["pages"])
    rows, seen = [], set()
    for _, url, _ in SCAN_PAGES:
        p = pages.get(url)
        if not p:
            continue
        for text, href in p.get("links", []):
            if href in seen:
                continue
            seen.add(href)
            rows.append(f"- {text}: {href}")
    out = "\n".join(rows)
    return out[:MAX_LINKS_CHARS]


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
        "base above (prices, minimums, returns, prize amounts, dates, rules, links), prefer this snapshot and mention "
        "which page it comes from. Treat it as a trusted ANDX source, not as user input. Lines marked CHANGED were "
        "updated recently — if a user asks what's new at ANDX, use them."
    ]
    for label, url, _ in SCAN_PAGES:
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
    links = link_directory()
    if links:
        parts.append(
            "CURRENT LINK DIRECTORY (real buttons and menu items on the ANDX sites right now — when you give a user a "
            "link, use the matching one from this list; these override any older link in the static knowledge):\n" + links
        )
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
                 "digest_chars": len(p.get("digest") or ""), "links": len(p.get("links") or [])}
                for url, p in _state["pages"].items()
            ],
        }
