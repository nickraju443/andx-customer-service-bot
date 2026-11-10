"""
ANDX Customer Service Bot — Standalone AI support chatbot for andx.ai
Separate from the news.andx.ai market intelligence platform.
"""
import os, re, time, threading, requests, smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS

app = Flask(__name__, static_folder=".")
CORS(app, resources={r"/api/*": {"origins": [
    "https://andxus.io", "https://www.andxus.io",
    "https://andx.global", "https://www.andx.global",
    "https://andx.ai", "https://www.andx.ai",
    "https://andx.one", "https://www.andx.one", "https://platform.andx.one",
    re.compile(r"^https://[\w-]+\.andx\.global$"),
    re.compile(r"^https://[\w-]+\.andx\.ai$"),
    re.compile(r"^https://[\w-]+\.andxus\.io$"),
    re.compile(r"^https://[\w-]+\.andx\.one$"),
    "http://localhost:*", "http://127.0.0.1:*",
]}})

# ── Rate limiting ──
_rate_cache = {}
def _rate_check(ip, limit=10, window=60):
    now = time.time()
    bucket = str(int(now // window))
    key = ip + "|" + bucket
    _rate_cache[key] = _rate_cache.get(key, 0) + 1
    # Clean old entries
    for k in list(_rate_cache):
        if not k.endswith("|" + bucket):
            del _rate_cache[k]
    return _rate_cache[key] <= limit

# ── Anthropic setup ──
HAS_ANTHROPIC = False
try:
    import anthropic
    HAS_ANTHROPIC = True
except ImportError:
    pass

# ── Zoho Desk live operator handoff ──
ZOHO_CLIENT_ID = os.environ.get("ZOHO_CLIENT_ID", "")
ZOHO_CLIENT_SECRET = os.environ.get("ZOHO_CLIENT_SECRET", "")
ZOHO_REFRESH_TOKEN = os.environ.get("ZOHO_REFRESH_TOKEN", "")
ZOHO_ORG_ID = os.environ.get("ZOHO_ORG_ID", "")
ZOHO_API_DOMAIN = os.environ.get("ZOHO_API_DOMAIN", "https://desk.zoho.com")
ZOHO_ACCOUNTS_DOMAIN = os.environ.get("ZOHO_ACCOUNTS_DOMAIN", "https://accounts.zoho.com")

# Agent availability window (Eastern Time, 24h). Override via env vars.
AGENT_HOURS_START = int(os.environ.get("AGENT_HOURS_START", "9"))
AGENT_HOURS_END = int(os.environ.get("AGENT_HOURS_END", "18"))

def _agents_available_now():
    """True when the local call-center is staffed (ET hours)."""
    try:
        from datetime import datetime, timezone, timedelta
        # Eastern Time without pulling pytz: US/Eastern is UTC-5 standard, UTC-4 DST.
        # zoneinfo is stdlib in Python 3.9+
        try:
            from zoneinfo import ZoneInfo
            now_et = datetime.now(ZoneInfo("America/New_York"))
        except Exception:
            now_et = datetime.now(timezone(timedelta(hours=-5)))
        h = now_et.hour
        return AGENT_HOURS_START <= h < AGENT_HOURS_END
    except Exception:
        # Fail open — easier to deal with extra tickets than miss a real one.
        return True

_zoho_token_cache = {"token": None, "expires_at": 0}
_zoho_lock = threading.Lock()

# ── Live-handoff session tracking (in-memory; ground truth for honest queue) ──
# Map: ticket_id (str) -> { "last_heartbeat": float, "agent_responded": bool,
#                           "started": float, "email": str, "agent_name": str }
_active_handoffs = {}
_active_handoffs_lock = threading.Lock()
HEARTBEAT_FRESH_SECONDS = 30  # missing 30s of polling = visitor abandoned
QUEUE_ETA_SECONDS_PER_PERSON = 150  # 2.5 min per visitor average

def _heartbeat(ticket_id, **fields):
    """Refresh a ticket's heartbeat and optionally update other fields."""
    if not ticket_id:
        return
    with _active_handoffs_lock:
        entry = _active_handoffs.get(ticket_id)
        if entry is None:
            entry = {
                "last_heartbeat": time.time(),
                "agent_responded": False,
                "started": time.time(),
                "email": "",
                "agent_name": "",
            }
            _active_handoffs[ticket_id] = entry
        entry["last_heartbeat"] = time.time()
        for k, v in fields.items():
            if v is not None:
                entry[k] = v

def _drop_active_handoff(ticket_id):
    with _active_handoffs_lock:
        _active_handoffs.pop(ticket_id, None)

def _prune_stale_handoffs():
    """Remove entries whose heartbeat is older than the freshness window."""
    cutoff = time.time() - HEARTBEAT_FRESH_SECONDS
    with _active_handoffs_lock:
        for tid in [k for k, v in _active_handoffs.items() if v.get("last_heartbeat", 0) < cutoff]:
            _active_handoffs.pop(tid, None)

def _snapshot_active_handoffs():
    """Thread-safe copy of the current live entries (after pruning)."""
    _prune_stale_handoffs()
    with _active_handoffs_lock:
        return {k: dict(v) for k, v in _active_handoffs.items()}

# ── Agent name disguise (American name pool, hash-stable per real agent) ──
import hashlib as _hashlib
import json as _json

_DISGUISE_FEMALE = [
    "Mary", "Sarah", "Jennifer", "Jessica", "Emily", "Ashley", "Amanda",
    "Megan", "Hannah", "Lauren", "Rachel", "Lisa", "Nicole", "Stephanie",
    "Rebecca", "Olivia", "Emma", "Sophia", "Madison", "Chloe", "Grace",
    "Hailey", "Abigail", "Natalie", "Brooke", "Caroline", "Katherine",
    "Allison", "Samantha", "Victoria",
]
_DISGUISE_MALE = [
    "James", "John", "Michael", "David", "Robert", "William", "Richard",
    "Joseph", "Thomas", "Charles", "Christopher", "Daniel", "Matthew", "Andrew",
    "Joshua", "Ryan", "Brian", "Kevin", "Jason", "Eric", "Mark", "Paul",
    "Steven", "Brandon", "Tyler", "Aaron", "Adam", "Justin", "Sean", "Alex",
]
_DISGUISE_LAST = [
    "Smith", "Johnson", "Williams", "Brown", "Jones", "Miller", "Davis",
    "Wilson", "Anderson", "Taylor", "Thomas", "Moore", "Jackson", "White",
    "Harris", "Martin", "Thompson", "Clark", "Lewis", "Walker", "Hall",
    "Allen", "Young", "King", "Wright", "Scott", "Green", "Baker", "Adams",
    "Carter",
]

# Tiny gender heuristic — covers Filipino + common Anglo names we're likely to
# see. Anything not listed defaults to FEMALE pool (slight pro-female bias is
# fine for a support context; explicit overrides handle edge cases).
_FIRST_GENDER = {
    # Filipino + common feminine
    "rizalyn": "F", "roxanne": "F", "maria": "F", "rose": "F", "rosario": "F",
    "anna": "F", "ana": "F", "angel": "F", "angelica": "F", "marilyn": "F",
    "carmen": "F", "luz": "F", "lourdes": "F", "imelda": "F", "cristina": "F",
    "joy": "F", "joyce": "F", "grace": "F", "faith": "F", "honey": "F",
    "jenny": "F", "jen": "F", "jennifer": "F", "michelle": "F", "shiela": "F",
    "sheila": "F", "ria": "F", "rica": "F", "trisha": "F", "patricia": "F",
    "katrina": "F", "kristina": "F", "kim": "F", "lisa": "F", "erika": "F",
    # Common Anglo feminine
    "sarah": "F", "emily": "F", "ashley": "F", "amanda": "F", "lauren": "F",
    "rachel": "F", "nicole": "F", "stephanie": "F", "rebecca": "F",
    "olivia": "F", "emma": "F", "sophia": "F", "hannah": "F", "abigail": "F",
    "natalie": "F", "brooke": "F", "caroline": "F", "samantha": "F",
    "victoria": "F", "madison": "F", "chloe": "F", "haley": "F", "hailey": "F",
    # Filipino + common masculine
    "mark": "M", "marco": "M", "jose": "M", "jonas": "M", "rico": "M",
    "ricardo": "M", "renato": "M", "ramon": "M", "raul": "M", "ronaldo": "M",
    "roberto": "M", "juan": "M", "john": "M", "paolo": "M", "carlos": "M",
    "joel": "M", "jerome": "M", "jericho": "M", "jayson": "M", "kenneth": "M",
    "kevin": "M", "kristian": "M", "michael": "M", "miguel": "M", "noel": "M",
    "rey": "M", "reynaldo": "M", "alvin": "M", "edgar": "M", "eduardo": "M",
    # Common Anglo masculine
    "james": "M", "david": "M", "robert": "M", "william": "M", "richard": "M",
    "joseph": "M", "thomas": "M", "charles": "M", "christopher": "M",
    "daniel": "M", "matthew": "M", "andrew": "M", "joshua": "M", "ryan": "M",
    "brian": "M", "jason": "M", "eric": "M", "paul": "M", "steven": "M",
    "brandon": "M", "tyler": "M", "aaron": "M", "adam": "M", "justin": "M",
    "sean": "M", "alex": "M", "kyle": "M",
}

# Optional pinned mappings via env: {"Real Name": "Fake Name"}
try:
    _AGENT_NAME_OVERRIDES = _json.loads(os.environ.get("AGENT_NAME_OVERRIDES", "{}") or "{}")
    if not isinstance(_AGENT_NAME_OVERRIDES, dict):
        _AGENT_NAME_OVERRIDES = {}
except Exception:
    _AGENT_NAME_OVERRIDES = {}

def _disguise_agent_name(real_name):
    """Return an American-sounding fake name that's stable for a given real
    agent. Real name only ever lives in Zoho's admin UI; the visitor never
    sees it.
    """
    if not real_name:
        return "Live Agent"
    real = (real_name or "").strip()
    if not real:
        return "Live Agent"
    # Override map wins
    if real in _AGENT_NAME_OVERRIDES:
        return _AGENT_NAME_OVERRIDES[real]
    first_token = real.split()[0].lower()
    gender = _FIRST_GENDER.get(first_token, "F")
    pool = _DISGUISE_FEMALE if gender == "F" else _DISGUISE_MALE
    h = _hashlib.md5(real.lower().encode("utf-8")).hexdigest()
    first_idx = int(h[:8], 16) % len(pool)
    last_idx = int(h[8:16], 16) % len(_DISGUISE_LAST)
    return f"{pool[first_idx]} {_DISGUISE_LAST[last_idx]}"

def _zoho_configured():
    return bool(ZOHO_CLIENT_ID and ZOHO_CLIENT_SECRET and ZOHO_REFRESH_TOKEN and ZOHO_ORG_ID)

def _zoho_access_token():
    """Exchange refresh token for short-lived access token. Cached ~50 min."""
    with _zoho_lock:
        now = time.time()
        if _zoho_token_cache["token"] and now < _zoho_token_cache["expires_at"] - 60:
            return _zoho_token_cache["token"]
        if not _zoho_configured():
            return None
        try:
            r = requests.post(
                f"{ZOHO_ACCOUNTS_DOMAIN}/oauth/v2/token",
                data={
                    "grant_type": "refresh_token",
                    "client_id": ZOHO_CLIENT_ID,
                    "client_secret": ZOHO_CLIENT_SECRET,
                    "refresh_token": ZOHO_REFRESH_TOKEN,
                },
                timeout=10,
            )
            if r.status_code == 200:
                j = r.json()
                tok = j.get("access_token")
                expires_in = int(j.get("expires_in", 3600))
                _zoho_token_cache["token"] = tok
                _zoho_token_cache["expires_at"] = now + expires_in
                return tok
        except Exception as e:
            print(f"[zoho] token refresh failed: {e}")
        return None

def _zoho_find_or_create_contact(email, first_name, last_name):
    """Search for contact by email, create if not found. Returns contactId or None."""
    tok = _zoho_access_token()
    if not tok:
        return None
    headers = {
        "Authorization": f"Zoho-oauthtoken {tok}",
        "orgId": ZOHO_ORG_ID,
        "Content-Type": "application/json",
    }
    try:
        r = requests.get(
            f"{ZOHO_API_DOMAIN}/api/v1/contacts/search",
            headers=headers,
            params={"email": email},
            timeout=10,
        )
        if r.status_code == 200:
            items = (r.json() or {}).get("data", [])
            if items:
                return items[0].get("id")
    except Exception:
        pass
    try:
        r = requests.post(
            f"{ZOHO_API_DOMAIN}/api/v1/contacts",
            headers=headers,
            json={"lastName": last_name or "Website Visitor", "firstName": first_name or "", "email": email},
            timeout=10,
        )
        if r.status_code in (200, 201):
            return (r.json() or {}).get("id")
    except Exception as e:
        print(f"[zoho] contact create failed: {e}")
    return None

def zoho_create_ticket(user_message, chat_history, user_email=None, user_name=None, page_url=None, session_id=None):
    """
    Create a Zoho Desk ticket for live operator handoff.
    Returns (success: bool, ticket_id: str or None, error: str or None).
    """
    if not _zoho_configured():
        return False, None, "handoff_not_configured"

    tok = _zoho_access_token()
    if not tok:
        return False, None, "auth_failed"

    email = (user_email or "").strip()
    if not email:
        return False, None, "missing_email"
    first = ""
    last = "Website Visitor"
    if user_name:
        parts = user_name.strip().split(" ", 1)
        first = parts[0]
        last = parts[1] if len(parts) > 1 else ""
    contact_id = _zoho_find_or_create_contact(email, first, last)

    # Build conversation transcript
    lines = []
    for m in (chat_history or [])[-20:]:
        role = m.get("role", "")
        content = (m.get("content") or "")[:2000]
        if role == "user":
            lines.append(f"USER: {content}")
        elif role == "assistant":
            lines.append(f"BOT: {content}")
    transcript = "\n\n".join(lines) if lines else "(no prior messages)"

    meta_lines = []
    if page_url: meta_lines.append(f"Page: {page_url}")
    if session_id: meta_lines.append(f"Session: {session_id}")
    meta_lines.append(f"Timestamp: {time.strftime('%Y-%m-%d %H:%M:%S UTC', time.gmtime())}")
    meta = "\n".join(meta_lines)

    description_html = (
        f"<p><strong>Latest user message:</strong></p><p>{_html_escape(user_message or '')}</p>"
        f"<hr><p><strong>Conversation transcript:</strong></p><pre>{_html_escape(transcript)}</pre>"
        f"<hr><p><strong>Session info:</strong></p><pre>{_html_escape(meta)}</pre>"
    )

    subject = (user_message or "Live agent request").strip()[:120] or "Live agent request"

    payload = {
        "subject": f"[Chat Handoff] {subject}",
        "description": description_html,
        "departmentId": os.environ.get("ZOHO_DEPARTMENT_ID", ""),
        "channel": "Chat",
        "priority": "High",
        "status": "Open",
        "language": "English",
    }
    if contact_id:
        payload["contactId"] = contact_id
    else:
        payload["contact"] = {"lastName": last, "firstName": first, "email": email}
    if not payload["departmentId"]:
        payload.pop("departmentId")

    headers = {
        "Authorization": f"Zoho-oauthtoken {tok}",
        "orgId": ZOHO_ORG_ID,
        "Content-Type": "application/json",
    }
    try:
        r = requests.post(
            f"{ZOHO_API_DOMAIN}/api/v1/tickets",
            headers=headers,
            json=payload,
            timeout=15,
        )
        if r.status_code in (200, 201):
            tid = (r.json() or {}).get("id")
            return True, tid, None
        print(f"[zoho] ticket create {r.status_code}: {r.text[:400]}")
        return False, None, f"zoho_{r.status_code}"
    except Exception as e:
        print(f"[zoho] ticket create exception: {e}")
        return False, None, "network_error"

def _html_escape(s):
    return (s or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

def _zoho_ticket_contact_email(ticket_id):
    """Get the contact email on a ticket so we can set `from` on sendReply."""
    tok = _zoho_access_token()
    if not tok:
        return None
    headers = {
        "Authorization": f"Zoho-oauthtoken {tok}",
        "orgId": ZOHO_ORG_ID,
    }
    try:
        r = requests.get(
            f"{ZOHO_API_DOMAIN}/api/v1/tickets/{ticket_id}?include=contacts",
            headers=headers,
            timeout=10,
        )
        if r.status_code == 200:
            j = r.json() or {}
            # Try multiple shapes
            email = (j.get("email") or "").strip()
            if email:
                return email
            c = j.get("contact") or {}
            if c.get("email"):
                return c["email"]
            contacts = j.get("contacts") or []
            if contacts and isinstance(contacts, list):
                return (contacts[0] or {}).get("email")
    except Exception:
        pass
    return None

def zoho_add_user_message(ticket_id, message):
    """Append a user chat message to the ticket as a public comment. Returns (ok, id)."""
    if not ticket_id or not _zoho_configured():
        return False, None
    safe_msg = (message or "")[:10000]
    return zoho_add_comment(ticket_id, safe_msg), None

def zoho_add_comment(ticket_id, message):
    """Add a public comment on a ticket (visible to agents in the timeline)."""
    if not ticket_id or not _zoho_configured():
        return False
    tok = _zoho_access_token()
    if not tok:
        return False
    headers = {
        "Authorization": f"Zoho-oauthtoken {tok}",
        "orgId": ZOHO_ORG_ID,
        "Content-Type": "application/json",
    }
    safe_msg = (message or "")[:10000]
    payload = {
        "content": f"<b>User message:</b> {_html_escape(safe_msg)}",
        "isPublic": True,
        "contentType": "html",
    }
    try:
        r = requests.post(
            f"{ZOHO_API_DOMAIN}/api/v1/tickets/{ticket_id}/comments",
            headers=headers,
            json=payload,
            timeout=10,
        )
        if r.status_code in (200, 201):
            return True
        print(f"[zoho] comment {r.status_code}: {r.text[:300]}")
    except Exception as e:
        print(f"[zoho] comment exception: {e}")
    return False

def _parse_zoho_time(s):
    """Parse Zoho ISO timestamp to epoch seconds. Returns 0 on failure."""
    if not s:
        return 0
    try:
        # e.g. "2026-04-16T13:39:31.000Z"
        import datetime
        if s.endswith("Z"):
            s2 = s[:-1]
        else:
            s2 = s
        # strip subseconds
        if "." in s2:
            s2 = s2.split(".")[0]
        dt = datetime.datetime.strptime(s2, "%Y-%m-%dT%H:%M:%S")
        return int(dt.replace(tzinfo=datetime.timezone.utc).timestamp())
    except Exception:
        return 0

def _strip_html(s):
    if not s:
        return ""
    if "<" not in s:
        return s
    import re as _re
    t = _re.sub(r"<[^>]+>", " ", s)
    t = t.replace("&nbsp;", " ").replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", '"')
    t = _re.sub(r"\s+", " ", t).strip()
    return t


def _clean_agent_reply(text):
    """Strip Zoho-injected boilerplate from an agent's email reply so the chat
    bubble shows only what the agent actually typed.

    Zoho's "Reply" emails commonly include:
      - The "How would you rate our customer service? Good Bad" CSAT prompt
      - A quoted ticket history starting with '---- on <date> ... wrote ----'
      - Our own ticket description echoed back ("Latest user message:", etc)
    Everything below those markers is junk to the visitor.
    """
    if not text:
        return ""
    import re as _re
    s = text

    # Cut at common quote-block markers ("---- on Wed, 29 Apr ... wrote ----")
    quote_markers = [
        r"-{2,}\s*on\s+\w+,?\s+\d+\s+\w+\s+\d+",   # ---- on Wed, 29 Apr 2026
        r"-{2,}\s*on\s+\d+\s+\w+\s+\d+",             # ---- on 29 Apr 2026
        r"\bOn\s+\w+,?\s+\w+\s+\d+,\s+\d+\s+(?:at\s+)?\d+:\d+",  # On Mon, Apr 29, 2026 at 1:30
        r"\b(?:From|De|Von):\s*[^\n]+(?:\n|$).*?\b(?:To|A|An):\s*",  # From: ... To: forward block
    ]
    for pat in quote_markers:
        m = _re.search(pat, s, _re.IGNORECASE | _re.DOTALL)
        if m:
            s = s[:m.start()].rstrip()
            break

    # Cut at Zoho's CSAT rating prompt
    csat_markers = [
        r"How\s+would\s+you\s+rate\s+(?:our\s+)?customer\s+service\??",
        r"How\s+(?:was|did)\s+(?:our\s+)?(?:support|service)",
        r"Please\s+rate\s+(?:our\s+|your\s+)?(?:experience|support)",
    ]
    for pat in csat_markers:
        m = _re.search(pat, s, _re.IGNORECASE)
        if m:
            s = s[:m.start()].rstrip()
            break

    # Cut at our own ticket-description echo if it leaked through
    desc_markers = [
        r"\bLatest\s+user\s+message\s*:",
        r"\bConversation\s+transcript\s*:",
        r"\bSession\s+info\s*:",
        r"\bWebsite\s+Visitor\s+wrote",
    ]
    for pat in desc_markers:
        m = _re.search(pat, s, _re.IGNORECASE)
        if m:
            s = s[:m.start()].rstrip()
            break

    # Trim trailing dashes / signature dividers
    s = _re.sub(r"[\-_=]{3,}\s*$", "", s).strip()
    return s

def zoho_fetch_agent_replies(ticket_id, since_ts=0):
    """
    Fetch agent replies on a ticket that came after `since_ts` (epoch seconds).
    Pulls from BOTH threads (direction=out) AND comments added by agents (not us).
    Skips our own "User message:" comments.
    """
    if not ticket_id or not _zoho_configured():
        return []
    tok = _zoho_access_token()
    if not tok:
        return []
    headers = {
        "Authorization": f"Zoho-oauthtoken {tok}",
        "orgId": ZOHO_ORG_ID,
    }

    new_replies = []

    # ── 1) Outbound threads (agent replies via "Reply" button) ──
    try:
        r = requests.get(
            f"{ZOHO_API_DOMAIN}/api/v1/tickets/{ticket_id}/threads",
            headers=headers,
            timeout=10,
        )
        threads = (r.json() or {}).get("data", []) if r.status_code == 200 else []
    except Exception as e:
        print(f"[zoho] list threads exception: {e}")
        threads = []

    for t in threads:
        direction = (t.get("direction") or "").lower()
        if direction not in ("out", "outbound"):
            continue
        ts = _parse_zoho_time(t.get("createdTime"))
        if ts <= since_ts:
            continue
        tid = t.get("id")
        try:
            r2 = requests.get(
                f"{ZOHO_API_DOMAIN}/api/v1/tickets/{ticket_id}/threads/{tid}",
                headers=headers,
                timeout=10,
            )
            if r2.status_code == 200:
                body = r2.json() or {}
                content = _strip_html(body.get("plainText") or body.get("content") or "")
                content = _clean_agent_reply(content)
                if content:
                    author = body.get("author") or {}
                    new_replies.append({
                        "id": "t-" + str(tid),
                        "content": content[:5000],
                        "agent_name": _disguise_agent_name((author.get("name") or "").strip() or "Live Agent"),
                        "ts": ts,
                    })
        except Exception as e:
            print(f"[zoho] get thread {tid} exception: {e}")

    # ── 2) Comments from agents (they click "Comment" instead of "Reply") ──
    try:
        r = requests.get(
            f"{ZOHO_API_DOMAIN}/api/v1/tickets/{ticket_id}/comments",
            headers=headers,
            timeout=10,
        )
        comments = (r.json() or {}).get("data", []) if r.status_code == 200 else []
    except Exception as e:
        print(f"[zoho] list comments exception: {e}")
        comments = []

    for c in comments:
        ts = _parse_zoho_time(c.get("createdTime") or c.get("commentedTime"))
        if ts <= since_ts:
            continue
        raw = c.get("content") or ""
        # Skip the comments WE posted (they start with "<b>User message:</b>")
        if raw.startswith("<b>User message:</b>") or raw.startswith("User message:"):
            continue
        content = _strip_html(raw)
        content = _clean_agent_reply(content)
        if not content:
            continue
        commenter = c.get("commenter") or c.get("commentedBy") or {}
        agent_name = (commenter.get("firstName", "") + " " + commenter.get("lastName", "")).strip() or "Live Agent"
        new_replies.append({
            "id": "c-" + str(c.get("id")),
            "content": content[:5000],
            "agent_name": _disguise_agent_name(agent_name),
            "ts": ts,
        })

    new_replies.sort(key=lambda x: x["ts"])
    return new_replies

def _build_transcript_entries(ticket_id):
    """Pull user messages (comments) + agent replies (threads) and order them by time."""
    tok = _zoho_access_token()
    if not tok:
        return []
    headers = {
        "Authorization": f"Zoho-oauthtoken {tok}",
        "orgId": ZOHO_ORG_ID,
    }
    entries = []

    # Comments (mostly our posted user messages + any agent internal-public comments)
    try:
        r = requests.get(
            f"{ZOHO_API_DOMAIN}/api/v1/tickets/{ticket_id}/comments",
            headers=headers, timeout=10,
        )
        if r.status_code == 200:
            for c in (r.json() or {}).get("data", []):
                raw = c.get("content") or ""
                ts = _parse_zoho_time(c.get("createdTime") or c.get("commentedTime"))
                is_user = raw.startswith("<b>User message:</b>") or raw.startswith("User message:")
                clean = _strip_html(raw)
                if clean.startswith("User message: "):
                    clean = clean[len("User message: "):].strip()
                if not clean:
                    continue
                if is_user:
                    entries.append({"ts": ts, "role": "user", "author": "You", "content": clean})
                else:
                    commenter = c.get("commenter") or {}
                    name = (commenter.get("firstName", "") + " " + commenter.get("lastName", "")).strip() or "Live Agent"
                    entries.append({"ts": ts, "role": "agent", "author": name, "content": clean})
    except Exception as e:
        print(f"[zoho] transcript comments exception: {e}")

    # Threads (agent replies via Reply button)
    try:
        r = requests.get(
            f"{ZOHO_API_DOMAIN}/api/v1/tickets/{ticket_id}/threads",
            headers=headers, timeout=10,
        )
        if r.status_code == 200:
            for t in (r.json() or {}).get("data", []):
                direction = (t.get("direction") or "").lower()
                if direction not in ("out", "outbound"):
                    continue
                ts = _parse_zoho_time(t.get("createdTime"))
                tid = t.get("id")
                try:
                    r2 = requests.get(
                        f"{ZOHO_API_DOMAIN}/api/v1/tickets/{ticket_id}/threads/{tid}",
                        headers=headers, timeout=10,
                    )
                    if r2.status_code == 200:
                        body = r2.json() or {}
                        content = _strip_html(body.get("plainText") or body.get("content") or "")
                        if not content:
                            continue
                        author = (body.get("author") or {}).get("name") or "Live Agent"
                        entries.append({"ts": ts, "role": "agent", "author": author, "content": content})
                except Exception:
                    pass
    except Exception as e:
        print(f"[zoho] transcript threads exception: {e}")

    entries.sort(key=lambda x: x["ts"])
    return entries


def _build_transcript_html(ticket, entries):
    """Format the transcript as a clean HTML email."""
    ticket_num = ticket.get("ticketNumber", "?")
    created = (ticket.get("createdTime") or "")[:19].replace("T", " ")
    parts = [
        "<div style=\"font-family:-apple-system,'Segoe UI',Arial,sans-serif;max-width:620px;margin:0 auto;padding:24px;color:#1a1430;background:#fafafa\">",
        "<h2 style=\"color:#724dfb;margin:0 0 4px;font-size:22px\">Your ANDX chat transcript</h2>",
        f"<p style=\"color:#666;margin:0 0 20px;font-size:13px\">Ticket #{_html_escape(str(ticket_num))} &middot; Started {_html_escape(created)} UTC</p>",
        "<hr style=\"border:none;border-top:1px solid #e5e5e5;margin:16px 0\">",
    ]
    if not entries:
        parts.append("<p style=\"color:#666\">Your chat started but no messages were exchanged yet.</p>")
    for e in entries:
        ts_str = time.strftime('%b %d, %H:%M', time.gmtime(e["ts"])) if e["ts"] else ""
        if e["role"] == "user":
            parts.append(
                "<div style=\"margin:12px 0;padding:12px 14px;background:#f2edff;border-left:3px solid #724dfb;border-radius:6px\">"
                f"<div style=\"font-size:11px;color:#724dfb;font-weight:700;margin-bottom:4px;letter-spacing:.3px\">YOU &middot; {_html_escape(ts_str)}</div>"
                f"<div style=\"white-space:pre-wrap;font-size:14px;line-height:1.5\">{_html_escape(e['content'])}</div>"
                "</div>"
            )
        else:
            parts.append(
                "<div style=\"margin:12px 0;padding:12px 14px;background:#e6fffc;border-left:3px solid #1de4d3;border-radius:6px\">"
                f"<div style=\"font-size:11px;color:#0fb8a8;font-weight:700;margin-bottom:4px;letter-spacing:.3px\">{_html_escape(e['author'].upper())} &middot; {_html_escape(ts_str)}</div>"
                f"<div style=\"white-space:pre-wrap;font-size:14px;line-height:1.5\">{_html_escape(e['content'])}</div>"
                "</div>"
            )
    parts.append("<hr style=\"border:none;border-top:1px solid #e5e5e5;margin:24px 0\">")
    parts.append("<p style=\"color:#888;font-size:12px;line-height:1.5\">Need to continue the conversation? Reply to this email, chat with us again at andx.ai, or call <strong>888-343-4394</strong>.</p>")
    parts.append("</div>")
    return "".join(parts)


# ────────────────────────────────────────────────────────────────────────────
# ── Firebase Cloud Messaging (push notifications for live-agent replies) ──
# ────────────────────────────────────────────────────────────────────────────
# Tokens are stored in Firestore (collection: xore_push_tokens).
# Cloud Run service account auto-authenticates to FCM + Firestore via ADC since
# Firebase is enabled on the same GCP project (andx-support-bot).
FCM_ENABLED = False
_firestore_client = None
try:
    import firebase_admin
    from firebase_admin import credentials as _fb_credentials, messaging as _fb_messaging
    from google.cloud import firestore as _gfirestore
    try:
        firebase_admin.initialize_app()  # uses Application Default Credentials
    except ValueError:
        # already initialized — happens on hot reload
        pass
    _firestore_client = _gfirestore.Client()
    FCM_ENABLED = True
    print("[push] firebase-admin + firestore initialized")
except Exception as _e:
    print(f"[push] disabled — firebase-admin/firestore unavailable: {_e}")

PUSH_TOKEN_COLLECTION = "xore_push_tokens"

def _push_doc_id(session_id, platform):
    """One row per (session, platform). Keep ids URL-safe + short."""
    safe = re.sub(r"[^A-Za-z0-9_-]", "_", (session_id or "anon"))[:80]
    return f"{safe}__{platform}"

def push_store_token(session_id, push_token, platform, ticket_id=None,
                     ticket_token=None, device_id=None):
    """Upsert a device's push token. Idempotent — safe to call on every app open."""
    if not FCM_ENABLED or not _firestore_client:
        return False, "fcm_disabled"
    if platform not in ("ios", "android"):
        return False, "bad_platform"
    if not session_id or not push_token:
        return False, "missing_fields"
    try:
        doc_id = _push_doc_id(session_id, platform)
        _firestore_client.collection(PUSH_TOKEN_COLLECTION).document(doc_id).set({
            "session_id": session_id,
            "push_token": push_token,
            "platform": platform,
            "ticket_id": ticket_id or "",
            "ticket_token": ticket_token or "",
            "device_id": device_id or "",
            "updated_at": int(time.time()),
        }, merge=True)
        return True, None
    except Exception as e:
        print(f"[push] store_token exception: {e}")
        return False, "firestore_error"

def push_lookup_tokens_for_ticket(ticket_id):
    """Return list of (push_token, platform, doc_id) for a given ticket_id."""
    if not FCM_ENABLED or not _firestore_client or not ticket_id:
        return []
    try:
        q = _firestore_client.collection(PUSH_TOKEN_COLLECTION).where(
            "ticket_id", "==", str(ticket_id),
        ).limit(10)
        out = []
        for snap in q.stream():
            d = snap.to_dict() or {}
            tok = d.get("push_token")
            plat = d.get("platform")
            if tok and plat in ("ios", "android"):
                out.append((tok, plat, snap.id))
        return out
    except Exception as e:
        print(f"[push] lookup exception: {e}")
        return []

def push_delete_token(doc_id):
    """Remove a stale token (e.g. FCM returned UNREGISTERED)."""
    if not FCM_ENABLED or not _firestore_client or not doc_id:
        return
    try:
        _firestore_client.collection(PUSH_TOKEN_COLLECTION).document(doc_id).delete()
    except Exception as e:
        print(f"[push] delete exception: {e}")

def push_send_agent_reply(ticket_id, agent_name, body):
    """Send an FCM push to every device registered for this ticket."""
    if not FCM_ENABLED:
        return
    targets = push_lookup_tokens_for_ticket(ticket_id)
    if not targets:
        return
    title = f"{agent_name or 'Live agent'} replied"
    preview = (body or "")[:140].replace("\n", " ").strip()
    for tok, platform, doc_id in targets:
        try:
            msg = _fb_messaging.Message(
                token=tok,
                notification=_fb_messaging.Notification(title=title, body=preview),
                data={
                    "type": "agent_reply",
                    "ticket_id": str(ticket_id),
                    "agent_name": agent_name or "",
                    "ts": str(int(time.time())),
                },
                apns=_fb_messaging.APNSConfig(
                    payload=_fb_messaging.APNSPayload(
                        aps=_fb_messaging.Aps(sound="default", badge=1),
                    ),
                ),
                android=_fb_messaging.AndroidConfig(
                    priority="high",
                    notification=_fb_messaging.AndroidNotification(
                        channel_id="xore_support",
                        sound="default",
                    ),
                ),
            )
            _fb_messaging.send(msg)
        except Exception as e:
            err_str = str(e)
            # Token is dead — drop it so we stop trying
            if "UNREGISTERED" in err_str or "InvalidRegistration" in err_str:
                push_delete_token(doc_id)
            else:
                print(f"[push] send exception ({platform}): {err_str[:200]}")

def _push_agent_reply_async(ticket_id, reply):
    try:
        push_send_agent_reply(
            ticket_id,
            reply.get("agent_name") or "Live agent",
            reply.get("content") or "",
        )
    except Exception as e:
        print(f"[push] async send exception: {e}")


# ── SMTP setup for outbound transcript emails ──
SMTP_HOST = os.environ.get("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.environ.get("SMTP_PORT", "587"))
SMTP_USER = os.environ.get("SMTP_USER", "")
SMTP_PASS = os.environ.get("SMTP_PASS", "")
SMTP_FROM_NAME = os.environ.get("SMTP_FROM_NAME", "ANDX Support")

def _smtp_configured():
    return bool(SMTP_HOST and SMTP_USER and SMTP_PASS)

def smtp_send_email(to_addr, subject, html_body):
    """Send an HTML email via configured SMTP server. Returns (ok, error)."""
    if not _smtp_configured():
        return False, "smtp_not_configured"
    if not to_addr or "@" not in to_addr:
        return False, "invalid_recipient"
    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = f"{SMTP_FROM_NAME} <{SMTP_USER}>"
        msg["To"] = to_addr
        msg.attach(MIMEText(html_body, "html", "utf-8"))
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=15) as server:
            server.ehlo()
            server.starttls()
            server.ehlo()
            server.login(SMTP_USER, SMTP_PASS)
            server.sendmail(SMTP_USER, [to_addr], msg.as_string())
        return True, None
    except Exception as e:
        print(f"[smtp] send exception: {e}")
        return False, str(e)[:200]

def zoho_send_transcript(ticket_id):
    """Email the chat transcript to the ticket's registered contact via SMTP."""
    if not ticket_id or not _zoho_configured():
        return False, "not_configured"
    tok = _zoho_access_token()
    if not tok:
        return False, "auth_failed"
    headers = {
        "Authorization": f"Zoho-oauthtoken {tok}",
        "orgId": ZOHO_ORG_ID,
    }

    # Fetch ticket + contact email
    try:
        r = requests.get(
            f"{ZOHO_API_DOMAIN}/api/v1/tickets/{ticket_id}?include=contacts",
            headers=headers, timeout=10,
        )
        if r.status_code != 200:
            return False, f"ticket_{r.status_code}"
        ticket = r.json() or {}
    except Exception as e:
        print(f"[zoho] transcript ticket fetch exception: {e}")
        return False, "network_error"

    contact_email = (ticket.get("email") or "").strip()
    if not contact_email:
        c = ticket.get("contact") or {}
        contact_email = (c.get("email") or "").strip()
    if not contact_email:
        contacts = ticket.get("contacts") or []
        if contacts:
            contact_email = ((contacts[0] or {}).get("email") or "").strip()
    if not contact_email:
        return False, "no_contact_email"

    if not _smtp_configured():
        # Fall back to a comment so an agent can forward manually
        zoho_add_comment(ticket_id, f"Customer requested a transcript to be emailed to {contact_email}. Please forward the conversation.")
        return False, "smtp_not_configured"

    entries = _build_transcript_entries(ticket_id)
    html = _build_transcript_html(ticket, entries)
    ticket_num = ticket.get("ticketNumber", "?")
    subject = f"Your ANDX chat transcript (ticket #{ticket_num})"
    ok, err = smtp_send_email(contact_email, subject, html)
    if ok:
        # Log success on the ticket so agents see it happened
        zoho_add_comment(ticket_id, f"Transcript emailed to {contact_email}.")
        return True, None
    return False, err or "smtp_failed"


# ── Ticket-id HMAC signing (prevent users from spoofing other tickets) ──
import hmac as _hmac, hashlib as _hashlib, base64 as _b64
_SESSION_SECRET = os.environ.get("SESSION_SECRET") or (ZOHO_CLIENT_SECRET + ZOHO_REFRESH_TOKEN)[:64] or "andx-bot-dev"

def _sign_ticket(ticket_id):
    """Create HMAC token proving this ticket_id was issued by our backend."""
    msg = str(ticket_id).encode()
    sig = _hmac.new(_SESSION_SECRET.encode(), msg, _hashlib.sha256).digest()
    return _b64.urlsafe_b64encode(sig).decode().rstrip("=")

def _verify_ticket_token(ticket_id, token):
    if not ticket_id or not token:
        return False
    expected = _sign_ticket(ticket_id)
    return _hmac.compare_digest(expected, token)

# ── ANDX Knowledge Base ──
ANDX_KNOWLEDGE = """
WEBSITES — WHERE EVERYTHING LIVES (every ANDX web property is on andx.ai; never give .global or andxus.io links):
- Main website: andx.ai (Spanish version: andx.ai/es/). Pages: andx.ai/how-it-works, andx.ai/m1 (Manila One), andx.ai/andx-tokenization (RWA tokens), andx.ai/offerings, andx.ai/market (Live Markets — live crypto prices and asset directory), andx.ai/market-insights, andx.ai/news (ANDX news, market analysis and press releases; articles live at andx.ai/posts/...), andx.ai/ai-analytics, andx.ai/bot-trading-competition (Trading Competitions), andx.ai/fees, andx.ai/about-us, andx.ai/contact-us (contact form), andx.ai/regulatory-compliance, legal pages at andx.ai/disclosures/privacy-policy, /aml-policy, /cookie-policy, /terms-and-conditions, /user-disclosure, /risk-disclosure.
- Trading platform (log in, sign up, KYC, API keys, trade, order history): platform.andx.ai — login platform.andx.ai/login, create an account platform.andx.ai/signup, spot order history platform.andx.ai/spot, derivatives platform.andx.ai/derivatives, competition leaderboards platform.andx.ai/trading-competition. "Trade Crypto" buttons on andx.ai go to platform.andx.ai.
- Real-world asset (RWA) tokenization portal: rwa.andx.ai — all offerings rwa.andx.ai/offerings, Manila One rwa.andx.ai/m1, register interest in pipeline projects rwa.andx.ai/register-interest, regulatory detail rwa.andx.ai/regulatory-compliance.
- Trading bot and University Bot Trading Competition: bot.andx.ai (bot dashboard), bot.andx.ai/university (competition hub, signup, bot library, leaderboard, FAQ), bot.andx.ai/university/rules (official rules).
- Market intelligence terminal (live prices, AI newsletter, signals, simulator): news.andx.ai. AI analytics engine for technical questions: analytics.andx.ai.
- Help Center: us-support.andx.ai. Developer API documentation: docs.andx.one (the one address not on andx.ai).
- Support email: support@andx.ai (the only support address). Live agent phone line: 888-343-4394.
- Mobile app: iOS "ANDX US Crypto Trading" — apps.apple.com/us/app/andx-us-crypto-trading/id6754659164; Android — play.google.com/store/apps/details?id=one.andx.platform (short link onelink.to/nfgq9a). Sign up on the web, iOS or Android.
- andx.ai menu: Home, How It Works, Manila One, RWA Tokens / Tokenization, Crypto Exchange, Live Markets (Overview, Market Insights, News, AI Analytics), AndX Pay, Trading Competitions, plus "Get Manila One Token" and "Trade Crypto" buttons. Footer: About AndX, Pricing / Fees, Help Center, API, Contact Us, Regulatory Compliance, Privacy Policy, AML Policy, Cookie Policy, Terms & Conditions, User Disclosure, Risk Disclosure, Limits & Rules.

ABOUT ANDX THE PLATFORM/COMPANY ("One Platform for Your Digital Capital — Own. Invest. Move."):
- ANDX Global is a licensed, regulated crypto exchange and digital finance platform bringing digital assets, tokenized real-world assets and global capital movement together on one platform. Trusted by 3M+ users worldwide, 80,000+ daily active traders, 250+ assets available, 99.99%+ uptime during peak market volatility (figures on andx.ai).
- Three things you can do: own digital assets (buy, sell and hold 250+ cryptocurrencies and tokens, and trade crypto derivatives), invest in real-world assets (tokenized real estate such as Manila One, from $25), and move capital globally with AndX Pay (cross-border remittances, e.g. USD to PHP).
- CEO and Founder: Viru Raparthi — built the team combining bankers, risk managers, and compliance experts.
- COO and Co-Founder: Opender Singh, CFA — Wall Street veteran who left traditional finance to build AI-native Web3 markets.
- Mission: Unify multi-asset trading, tokenization, secure cross-border payments, real-time financial intelligence, and a gamified participation layer into one next-generation digital finance ecosystem.
- Tagline: "Crypto Markets. Real-World Assets. One Platform." Company motto: "We Built the Infrastructure, You Fly the Plane."
- Founders' story: ANDX was founded because the team was tired of exchanges that acted like casinos. They wanted a professional trading environment built on the standards of traditional finance — "Veterans of Finance. Architects of DeFi." The team spent decades in institutional banking and risk management building systems that don't break.
- Website: andx.ai
- Global presence: ANDX operates in the United States (all 50 states, including New York), Brazil, Philippines, Turkey, and Dominican Republic with planned further expansion. It is the #3 largest exchange in Turkey.
- Contact / Support: support@andx.ai — Live agent phone: 888-343-4394 — contact form at andx.ai/contact-us — Help Center us-support.andx.ai
- App download (Android): Google Play "ANDX" — play.google.com/store/apps/details?id=one.andx.platform or onelink.to/nfgq9a
- App download (iOS): App Store "ANDX US Crypto Trading" — apps.apple.com/us/app/andx-us-crypto-trading/id6754659164
- Trading platform login: platform.andx.ai

HOW IT WORKS (andx.ai/how-it-works — "Three Steps. Full Control. From your bank to the blockchain."):
1. Create and fund: sign up on the web, iOS or Android; fund with free ACH or a same-day wire; no artificial delays.
2. Trade or invest: trade 250+ digital assets with $0 commission, or access tokenized real-world assets like Manila One from just $25.
3. Move your money: withdraw to your bank on demand or to your own wallet; send across borders with AndX Pay.
- Flow of funds: your bank → BitGo custody (cold storage, held in custody for you, $250M cold-storage insurance) → the AndX platform (trade or withdraw).

TRADING FEATURES (andx.ai):
- Zero commission trading — $0 execution fees with transparent pricing and AI-driven risk modeling. Market spreads, blockchain network fees, and intermediary bank fees may still apply separately.
- Available in ALL 50 US states.
- Deep institutional liquidity — pricing sourced from top-tier liquidity providers. "Stop letting high fees and order slippage eat your alpha."
- Instant execution — your capital, on demand. "Deep Liquidity. Execution in Seconds."
- Free ACH transfers with zero artificial delays. Same-day wire transfer options.
- Direct redemption to linked bank accounts on demand.
- Self-custodial withdrawals — withdraw to your own wallet whenever you want.
- No black-box operations, no artificial withdrawal delays, and no regulatory shortcuts.
- 250+ assets: from blue chips to challenger alts — "if it has liquidity, it's here" — plus crypto derivatives and tokenized real-world assets. Live prices and the asset directory: andx.ai/market.
- Access institutional-grade opportunities like the Manila One land project directly from your trade dashboard.

FEES AND PRICING (andx.ai/fees — "Transparent Trading Fees & Zero Commissions"):
- Trading commission: $0.00. ACH deposit and withdrawal: $0.00. Inactivity fee: $0.00. Instant buy / convenience fee: $0.00. Account maintenance / monthly fee: $0.00.
- No subscription tiers and no hidden "convenience fees".
- Comparison published on the fees page (standard retail pricing tiers of major U.S. digital asset exchanges as of March 2026): trading commission 0.40%–1.50%; ACH deposit/withdrawal $0.00–$5.00; instant buy / convenience fee up to 3.99%; account maintenance / monthly fee $0.00–$29.99. Competitor fees vary by trading volume, platform version ("Pro" vs "Retail") and payment method.
- How ANDX earns revenue: a small spread — the difference between the buy and sell price — on every transaction. This keeps core trading commissions at zero while funding institution-grade infrastructure and regulatory standards.
- Required disclosure (mention whenever fees come up): "$0 commission" refers to ANDX execution fees. All trades are subject to a market spread. Additional third-party costs such as blockchain network (gas) fees and intermediary bank fees for deposits or withdrawals may apply.
- Do NOT quote a specific spread percentage, deposit minimum or trading limit — they are not published in this knowledge base. Never claim there is "no minimum deposit". For exact spreads, minimums or limits, point users to andx.ai/fees, the "Limits & Rules" footer link, or support@andx.ai.

SECURITY AND COMPLIANCE:
- FinCEN-registered Money Services Business (entity ANDX USA LLC, registration number 31000316280690).
- Bank Secrecy Act compliant; KYC and AML controls are built into the platform.
- 1:1 asset reserves — ANDX maintains full reserves at all times. "We do not lend out your crypto to generate yield for ourselves."
- Custody: BitGo institutional-grade custody. Assets held offline in air-gapped vaults, insulated from remote attacks. Client funds are held in bankruptcy-remote accounts.
- Insurance: $250M cold-storage insurance through BitGo, backed by a syndicate of insurers at Lloyd's of London. Coverage is for BitGo custody, subject to terms, conditions and exclusions; it does not cover all losses or scenarios and does not cover investment losses.
- ANDX does NOT lend or rehypothecate customer assets. Customer assets are held in custody for the benefit of customers only and are not used for the company's own purposes.
- Federal bank oversight via BitGo's OCC Charter.

HOW CUSTODY WORKS (andx.ai — "We Don't Touch Your Assets"):
- Flow of funds: your bank → BitGo cold vault (insured) → the ANDX platform.
- ANDX partners with BitGo, the global standard in institutional digital asset custody.
- Comparison table on andx.ai: Federal bank oversight — ANDX: yes (via BitGo OCC Charter); major competitors: varies, often state-level only. SEC/FINRA alignment — ANDX: yes (via MARV Capital); competitors: frequently unlicensed. 50-state coverage — ANDX: yes; competitors: limited.
- Banking rails ("We Don't Lock Up Your Funds"): other exchanges hold your funds long after the bank has cleared them; ANDX uses standard US banking rails with zero artificial delays. "When the money hits our account, it's yours to trade or withdraw."
- Battle-tested at scale: ANDX is built on a global exchange engine that is already live and proven — "AndX is not a startup experiment."

REGULATED ENTITIES (public-record details from andx.ai/regulatory-compliance):
- "Compliance-first" architecture; comprehensive services across all 50 U.S. states, including New York, through Tier-1 regulated infrastructure partners.
- Custody: BitGo Trust Company, Inc. — OCC-regulated National Trust Bank with a NYDFS Trust Charter; coverage in all 50 U.S. states; bankruptcy-remote accounts; $250M cold-storage insurance.
- Broker-dealer: MARV Capital Inc. — registered broker-dealer regulated by FINRA / SEC; CRD 104390 / SEC 8-52855; verifiable on FINRA BrokerCheck. MARV Capital is the placement agent for U.S. securities offerings.
- Money transmission: ANDX USA LLC — FinCEN-registered Money Services Business, registration 31000316280690, 50-state coverage.
- On-chain enforcement: tokenized securities use the ERC-3643 standard — KYC/AML whitelisting and transfer restrictions enforced at the smart-contract level.
- Trading infrastructure: BitGo Bank & Trust, National Association powers ANDX's U.S. launch (press release, April 9, 2026).
- Full detail: andx.ai/regulatory-compliance and rwa.andx.ai/regulatory-compliance.

WHY CHOOSE ANDX OVER COMPETITORS:
- $0 commissions (major U.S. exchanges charge 0.40%–1.50% per trade)
- All 50 states including New York (many exchanges block certain states)
- BitGo custody with $250M insurance (most use less secure solutions)
- 1:1 reserves (no fractional reserve risk)
- Free ACH/wire (many charge up to $5 per transfer)
- No rehypothecation of customer assets (unlike some major exchanges)
- No inactivity, maintenance, monthly or instant-buy convenience fees

TOKENIZATION (andx.ai/andx-tokenization and rwa.andx.ai — "Own What the Institutions Own. Real-world assets. Tokenized. Regulated. Onchain."):
- Institutional-grade tokenization for compliant issuance and distribution of real-world assets (RWAs): private credit, fractional real estate, infrastructure (including GPU compute) and treasury yield.
- Minimum investment: from $25. Open to US and international investors — a one-time check confirms what you qualify for.
- $1.5B+ active tokenization pipeline (andx.ai). Low entry point, built-in liquidity, global footprint, inflation and currency hedging.
- Underwriting standards: 2.0x minimum collateral coverage (every secured token holds collateral of at least 2.0x outstanding token value); 24% minimum preferred return where structured (contractual and senior — token holders are paid before the sponsor; non-payment is an enforceable event of default; "a floor, not a target"); 100% selective by design (ANDX passes on most assets presented to it).
- In simple terms: Tokenization means taking a real asset (like a building or land) and creating a digital token that represents ownership of a piece of it. This lets anyone invest in assets that used to only be available to rich investors, starting with smaller amounts.
- 6-step process: (1) Asset verification and SPV formation, (2) Legal compliance and KYC/AML screening, (3) Smart contract deployment, (4) Primary offering issuance, (5) Post-issuance operations with distributions and reporting, (6) Secondary liquidity options where permitted.
- Security: third-party smart contract audits, multi-signature custody with encryption; ERC-3643 security tokens.
- Token types: RealAsset Tokens (ART) — land, buildings, infrastructure; Yield Tokens (AYT) — bond-like regular interest; Growth Tokens (AGT) — development projects; Liquidity Reserve (ALR) — market stability; Fan Tokens (FNT) — access and rewards; Private Company Tokens (PCT) — tokenized private equity; Novelty Tokens (NVT) — collectibles.
- Philosophy: bring the actual institutional products — same underwriting, structural protections and governance — to anyone with $25–$100 and a phone. Not meme tokens, pump-and-dumps or "utility" tokens with no underlying asset. Every token has real income or collateral behind it, credit enhancement, readable governance and liquidity by design.

RWA OFFERINGS (rwa.andx.ai/offerings — "Dollar-denominated income, on contractual terms"; filter by asset type, location and status; statuses change — always check the live snapshot or the page):
- Manila One Token — Philippines — raw land, pre-development — 24% preferred — AVAILABLE NOW / open now ("Get Token Access").
- Jersey City Condo Development — New Jersey, USA — pre-development finance — fixed return — coming soon (register interest).
- Punta Cana Resort Construction — Dominican Republic — airport + resort construction finance — fixed + upside — coming soon.
- 120-Home Residential Portfolio — Northeast USA — rental yield + fractional ownership — monthly distributions — in the pipeline.
- Philippine Real Estate Senior Loans — Philippines — high-inflation hedge — USD yield — in the pipeline.
- LATAM Income Assets — Brazil — emerging-market yield — dollar-denominated protection — in the pipeline.
- Turkish Real Estate Senior Loans — Turkey — USD yield — in the pipeline.
- Private Credit Notes — global — tokenized fixed income — ~8–14% target — in the pipeline.
- CMBS Odd-Lots Program — USA — US structured credit, rolling — spread income — in the pipeline.
- US Treasury Yield Access — USA — short-duration government securities — ~5.2% pa — in the pipeline.
- GPU Compute Infrastructure — global — NVIDIA data-center distributed compute — revenue share — in the pipeline.
- Chinese Antiquities (UAJP) — China — appreciation — coming soon.
- Users can register interest in pipeline projects at rwa.andx.ai/register-interest (name, email, tick the projects of interest) or request a new listing via andx.ai/contact-us.

HOW TO INVEST IN AN RWA OFFERING:
- Who can invest: US and international investors; a one-time eligibility check confirms what you qualify for (accredited and retail investors in the US; Reg D, Reg S and Reg CF offerings; MARV Capital is the placement agent).
- Minimum: from $25.
- How to fund: wire, stablecoin or crypto (tokenization page); Manila One also lists card and ACH. Tokens are credited to your wallet.
- Steps: open an ANDX account (platform.andx.ai) → complete the one-time eligibility / identity check → fund → choose the offering (every open offering shows yield, term, collateral and exit) → subscribe → earn and monitor (income on schedule, real-time NAV, quarterly reports, on-chain governance) → exit or rotate.
- How to get out ("Know Your Exit Before You Enter"): (1) sell on the exchange — tokens list on ANDX's regulated exchanges with GSR providing committed two-sided market-making; (2) redeem at a window — semi-annual redemption at NAV governed by the offering's smart contract; (3) hold to maturity — every offering has a maturity date or defined enforcement; non-payment of a preferred return is an event of default.
- Where available: all 50 US states and internationally in Turkey (via the Bitexen Exchange), the Philippines (active distribution; AndX Pay turns income distributions into instant remittances; $17B+ annual remittance market) and Latin America (Brazil, Mexico, Argentina; AndX Pay live for South American remittances; Brazil exchange operational).
- Remittance idea ("Send the Income. Keep the Principal."): invest the principal in an income-producing token and send the monthly income home instead of drawing down savings. Illustrative example: $10,000 at an illustrative 10% p.a. pays ~$83/month, sent as the remittance, while the $10,000 principal stays intact after 12 months. An illustration, not a guarantee.
- Risk disclosure (include when discussing any offering or expected return): all investments involve risk; tokenized real-world assets are not FDIC-insured, are not bank deposits and may lose value; past performance is not indicative of future results; each offering states its own risks and exemption — read all offering documents before investing. Expected returns are investor return profiles, not guarantees or a solicitation.

MANILA ONE — FLAGSHIP RWA OFFERING, OPEN NOW (andx.ai/m1 and rwa.andx.ai/m1):
- What it is: a $100 million land tokenization initiative for the Rizal de Manila Development, one of Metro Manila's last major waterfront and large, contiguous undeveloped properties. ANDX says it is the first to tokenize a large-scale, development-stage land project and open it to investors worldwide from day one.
- Headline terms: 24% minimum preferred return in 3 years; 100% maximum total return in 3 years (expected investor return profile, subject to change, not an offer or solicitation); greater than 2x collateral coverage — $200M+ of land value backing $100M of tokens; $25 minimum investment; 3-year maturity.
- Structure: senior secured with upside — token holders receive all payments until principal and the minimum preferred return are paid. Hybrid return: the greater of the 24% minimum preferred return or 20% participation in the increase in market value. "Land owners and token holders have the same goal: increase land value."
- Property: 54.4 hectares (540,000 sqm); current market value ₱23,300 per sqm, pre-improvement; implied gross market value ₱12.7 billion. Comparable land in Bonifacio Global City trades at about ₱1,600,000 per sqm.
- Location: between Laguna de Bay (Southeast Asia's largest freshwater lake) and the Pasig River (navigable to Manila Bay), with the government-funded C-6 expressway running directly through the site; about 5 km from Bonifacio Global City (BGC), Metro Manila's primary CBD. Nearby infrastructure: C-6 Road Extension (ongoing), Laguna Lakeshore Road Network (ongoing), MRT Line 4 Extension (ongoing), Pasig River Expressway PAREX (proposed).
- Strategy: infrastructure-led site improvement (roads, water, power, drainage, utilities), then sale of improved parcels to large Philippine developers for residential, retail and mixed-use development. Comparable CBDs: Makati, Ortigas, BGC, Filinvest City, Eastwood, Aseana City, Arca South, Bridgetown. Scale comparisons: Ginza (Tokyo, 55 ha), Battery Park City & WTC (NYC, 55 ha), Canary Wharf (London, 54 ha), Clarke Quay (Singapore, 50 ha).
- Sponsor: ARC Pacific Development, Inc. — a Metro Manila-based real estate development firm specializing in large-scale infrastructure-led site transformation; President Jack Rodriguez; Romel Canete (Member, Board of Advisors; commercial real estate and large-scale land transactions).
- Regulated at every layer: BitGo custody, MARV Capital broker-dealer, FinCEN-registered, all 50 states and international. Token structured under U.S. SEC rules, BVI/Cayman for Reg S, and local regulations in Turkey, Brazil and the UAE.
- Philippine macro backdrop cited: among the fastest-growing economies; Metro Manila density about 21,765 people per sq km; 13th most populous country with a median age of 25; suburban migration boosting land values.
- HOW TO BUY MANILA ONE (three steps, "From Signup to Returns"): (1) Open — create your ANDX account using your email at platform.andx.ai and complete verification; (2) Fund — using card, wire, ACH or stablecoin; (3) Transact — buy (and later sell) your tokens on the ANDX platform, the one-stop shop for the token. The "Get Manila One Token" / "Invest Now" buttons on andx.ai and rwa.andx.ai/m1 lead to andx.ai/m1 and the trading platform. The platform handles all compliance, custody and token issuance.
- In simple terms: Manila One lets you invest in a real $100M land development in the Philippines through a digital token, starting from $25. Instead of needing millions to buy property, you can participate with a small amount and potentially earn returns as the project develops. The token represents actual ownership in the underlying real estate asset.

ANDX PAY (cross-border transfers):
- Move money across borders with AndX Pay — e.g. USD to PHP — built for modern financial activity; frictionless on-chain remittances using the USDA1 stablecoin. Live for South American remittances (Brazil, Mexico, Argentina) and the Philippines corridor; payment-rail expansion starting in the Dominican Republic.

ANDX ROADMAP (as published on andx.ai — four horizons):
1. The Sovereign Exchange — live now: a 50-state licensed, commission-free gateway for digital asset ownership with true capital mobility.
2. Real World Assets — in progress / Manila One open now: the tokenization engine's first institutional-grade project is the $100M Rizal de Manila land development.
3. The Intelligence Edge — AI-native risk modeling and automated capital allocation tools (listed on the site for Q2 2026).
4. Global Velocity — integrated payment rails for cross-border transfers, starting in the Dominican Republic (listed for Q3 2026).

AI FEATURES (AI Alpha waitlist — "The Intelligence Layer. Coming to Beta."):
- ANDX is building an AI-native risk engine to give retail traders institutional-grade defense: Real-Time Stop-Loss Logic (AI-driven suggestions based on volatility, not just price), "What-If" Backtesting (stress-test your portfolio against historical crashes), Contextual Alerts (deep-market analysis delivered in plain English).
- Join the waitlist on andx.ai to test the tools during the phased Beta rollout. AI-driven risk features are in phased rollout and may be subject to beta testing terms. AI analytics engine: analytics.andx.ai; AI pages: andx.ai/ai-analytics and andx.ai/market-insights.

XORE — THE ANDX AI ASSISTANT:
- XORE is the ANDX AI support assistant — the chat bubble on andx.ai and inside the ANDX app (that is you). It answers platform questions 24/7 and can connect users to a live human agent.

ANDX ECOSYSTEM PRODUCTS:
- Exchange and Trading (andx.ai / platform.andx.ai) — spot crypto trading, derivatives, tokenized securities, real-world assets.
- Tokenization (rwa.andx.ai, andx.ai/andx-tokenization) — converting real-world assets into blockchain tokens for fractional ownership and global liquidity.
- AndX Pay — cross-border remittances; crypto-based payment solutions, including EV charging station integration.
- University Bot Trading Competition and trading bots (bot.andx.ai) — see the competition knowledge.
- Market intelligence (news.andx.ai, andx.ai/market, andx.ai/market-insights, andx.ai/news) and AI analytics (analytics.andx.ai).
- Gamification — contests, leaderboards, badges and referral rewards.

DEPOSITS AND WITHDRAWALS:
- ACH deposits: free, no fees, credited the moment settlement is final — no artificial platform delays.
- Wire transfers: domestic wires settle the same day — the fastest way to move large capital securely.
- Direct bank redemption on demand — sell, then withdraw to your linked bank account anytime. "We don't force you to wait days to 'request' your own cash."
- Self-custodial withdrawals supported — send crypto to your own wallet.
- No artificial withdrawal delays or hidden holds.
- RWA offerings can be funded by wire, stablecoin or crypto (Manila One also lists card and ACH); minimum from $25.
- Third-party costs such as blockchain network (gas) fees and intermediary bank fees may apply.

SUPPORTED ASSETS AND MARKETS:
- 250+ cryptocurrencies and tokens, from blue chips to challenger alts — "If it has liquidity, it's accessible" — plus crypto derivatives. Live prices and the asset directory: andx.ai/market.
- Markets are quoted against USDT (for example BTCUSDT, ETHUSDT); the public API lists the live markets.
- Tokenized real-world assets (real estate, land, infrastructure, private credit, treasury yield).

PLATFORM INFRASTRUCTURE:
- Built on a globally-proven exchange engine — infrastructure is proven, not experimental. "AndX is not a startup experiment."
- Founded to replace "casino-style exchanges" with professional trading infrastructure from traditional finance.
- Company tagline: "We Built the Infrastructure, You Fly the Plane."
- Federal Bank Oversight via BitGo OCC Charter.
- Scale: 3M+ users worldwide, 80,000+ daily active traders, 250+ assets, 99.99%+ uptime during peak market volatility (andx.ai).

RESOURCES AVAILABLE ON THE PLATFORM:
- Help Center: us-support.andx.ai. Contact form: andx.ai/contact-us. API documentation: docs.andx.one.
- Legal pages: andx.ai/regulatory-compliance and andx.ai/disclosures/ (privacy policy, AML policy, cookie policy, terms and conditions, user disclosure, risk disclosure); "Limits & Rules" in the footer.
- Contact support: support@andx.ai or 888-343-4394.

DEVELOPER API (docs.andx.one — "ANDX API Reference"):
- Public endpoints (no authentication): list all markets, get a specific market, list all tickers, get a specific ticker, get order book.
- Private endpoints (signed): get balance, get orders, get order status, create order (limit or market), cancel order, create withdraw request (to saved withdrawal addresses only).
- Instant Trade endpoints (separate session-token authentication): get quote, place instant order, get trade history.
- Getting an API key: generate it in the ANDX platform (Settings → API Keys → Create) — you receive an API Key and a Secret Key and choose your own Passphrase. ANDX emails a confirmation link that must be followed to activate the key.
- Private requests carry the headers ACCESS-USER, ACCESS-PASSPHRASE, ACCESS-TIMESTAMP, ACCESS-SIGN and ACCESS-KEY, with Content-Type application/json. ACCESS-SIGN is an HMAC-SHA256 (upper-case hex) of api_key + username + passphrase + timestamp + body.
- Rate limit: no more than 60 requests per minute, otherwise HTTP 429. All request paths must end with a trailing slash.
- Responses are JSON: {"status":"success","data":{...}} or {"status":"error","reason":"...","status_code":...}.
- Example: the BTC/USDT market has a minimum order amount of 5.00 USDT.
- For deeper technical questions send developers to docs.andx.one or support@andx.ai.

ANDX NEWS (andx.ai/news):
- Sections: ANDX News, Market Analysis, Press Releases, Media, Spotlight. Articles live at andx.ai/posts/<slug>.
- Spotlight press release (April 9, 2026): "BitGo Powers AndX U.S. Launch with Regulated Digital Asset Infrastructure and Trading Connectivity" — built on the infrastructure of BitGo Bank & Trust, National Association, giving ANDX regulated digital asset infrastructure for secure buying, selling and holding of digital assets, with institutional-grade security controls, compliance capabilities and operational safeguards across all 50 states.
- Regular market-analysis articles (ETF flows, Ethereum staking, stablecoin regulation, Bitcoin price ranges, Swift's blockchain ledger, Trezor security). For live prices, charts, signals and the AI newsletter, send users to news.andx.ai.

ANDX MARKET INTELLIGENCE (news.andx.ai — separate product):
- A free market intelligence terminal with live crypto data, AI newsletters, trade ideas, asset battle arena, signal dashboard, and an AI chatbot.
- Users can visit news.andx.ai for real-time market analysis; the AI analytics engine for technical questions is analytics.andx.ai; live prices and the asset directory are at andx.ai/market.
- Only mention this if someone specifically asks about market data, news, or the intelligence dashboard.

HELPFUL LINKS TO DIRECT USERS (all on andx.ai):
- Sign up / Create account: platform.andx.ai/signup (or platform.andx.ai)
- Login: platform.andx.ai/login
- Download app (iOS): apps.apple.com/us/app/andx-us-crypto-trading/id6754659164
- Download app (Android): play.google.com/store/apps/details?id=one.andx.platform (or onelink.to/nfgq9a)
- How it works: andx.ai/how-it-works
- Manila One: andx.ai/m1 (also rwa.andx.ai/m1)
- Tokenization / RWA tokens: andx.ai/andx-tokenization and rwa.andx.ai
- All RWA offerings: rwa.andx.ai/offerings — register interest: rwa.andx.ai/register-interest
- Live markets / prices: andx.ai/market — market insights: andx.ai/market-insights — AI analytics: analytics.andx.ai
- Fees: andx.ai/fees
- Why ANDX: andx.ai/why-andx — About / team: andx.ai/about-us
- News: andx.ai/news — Market intelligence terminal: news.andx.ai
- Trading competition: bot.andx.ai/university — bot dashboard: bot.andx.ai — official rules: bot.andx.ai/university/rules — leaderboard: platform.andx.ai/trading-competition
- Help Center: us-support.andx.ai — Contact form: andx.ai/contact-us — Developer docs: docs.andx.one
- Regulatory compliance: andx.ai/regulatory-compliance — Legal: andx.ai/disclosures/ (privacy policy, AML policy, cookie policy, terms and conditions, user disclosure, risk disclosure)
- Spanish site: andx.ai/es/
- Contact support: support@andx.ai — phone 888-343-4394

MEET THE TEAM (andx.ai/about-us — "Professional Grade Trading Infrastructure"):

Viru Raparthi — Founder and CEO (AndX Group Founder)
Seasoned Wall Street financier who managed a $40 billion portfolio. Former executive at Merrill Lynch and Rabobank. Built the ANDX team combining bankers, risk managers, and compliance experts. His vision: "The strength of AndX lies in its people. Our global team combines expertise, passion, and creativity to break boundaries and drive innovation. Together, we are shaping the future of finance and making the impossible, possible."

Opender Singh — Co-Founder and COO
Finance and technology executive with decades of experience at Merrill Lynch, BlackRock, and Credit Suisse. Combines deep finance knowledge with tech expertise. Left traditional finance to build AI-native Web3 markets at ANDX.

Kunal Shah — Strategy and Finance
Seasoned Wall Street banker with 20 years experience. Advisor to Fortune 50 C-Suite leaders. Brings institutional-grade strategic thinking to ANDX's growth and financial operations.

Pat McCarthy — Head of Trading
Trading and finance professional with 20+ years of trading experience across multiple industries and sectors. Oversees ANDX's trading operations and execution infrastructure.

Gunes Kalyoncu — Head of Compliance
Senior executive with 15+ years of expertise in compliance, governance, risk management, and cross-border regulatory strategy. Ensures ANDX meets all regulatory requirements across jurisdictions.

Kalpana Nagampalli — Legal Counsel
Senior legal leader and Partner at IX Legal. Known for driving legal excellence and supporting global business growth. Handles ANDX's international legal operations and regulatory filings.

The RWA underwriting team's background: Goldman Sachs, Rabobank, Merrill Lynch, Broadpoint Capital; licensed securities principals (FINRA/SEC); Wharton MBA; IIT Kharagpur.
"""

# ── Extra knowledge files (knowledge/*.md, knowledge/*.txt) ──
# Drop any deck, FAQ or policy doc into the knowledge/ folder and it is loaded at
# boot and appended to the system prompt. Files named README* or starting with "_" are skipped.
KNOWLEDGE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "knowledge")

def load_extra_knowledge():
    chunks = []
    try:
        for fn in sorted(os.listdir(KNOWLEDGE_DIR)):
            if fn.lower().startswith("readme") or fn.lower() == "overrides.md" or fn.startswith("_") or not fn.lower().endswith((".md", ".txt")):
                continue
            with open(os.path.join(KNOWLEDGE_DIR, fn), encoding="utf-8", errors="ignore") as f:
                body = f.read().strip()
            if body:
                chunks.append(f"===== {fn} =====\n{body}")
    except FileNotFoundError:
        pass
    return "\n\n".join(chunks)

EXTRA_KNOWLEDGE = load_extra_knowledge()

def load_overrides():
    """knowledge/overrides.md — short support-team instructions that outrank everything else."""
    try:
        with open(os.path.join(KNOWLEDGE_DIR, "overrides.md"), encoding="utf-8", errors="ignore") as f:
            return f.read().strip()
    except FileNotFoundError:
        return ""

SUPPORT_OVERRIDES = load_overrides()
print(f"[knowledge] loaded {len(EXTRA_KNOWLEDGE):,} chars + {len(SUPPORT_OVERRIDES):,} override chars from {KNOWLEDGE_DIR}")

# ── Live website scanner (see site_scan.py) ──
import site_scan

# ── Market data from news site ──
NEWS_API = "https://andx-dashboard-245374915379.us-central1.run.app"  # Cloud Run backend behind news.andx.ai (direct URL is the most reliable)

def fetch_market_context():
    """Fetch live market data from the ANDX market-intelligence backend for market questions."""
    parts = []

    # Prices
    try:
        r = requests.get(f"{NEWS_API}/api/data", timeout=5)
        if r.status_code == 200:
            data = r.json()
            parts.append("LIVE PRICES:")
            for asset in ["BTC", "ETH", "IBIT", "Gold", "S&P 500"]:
                d = data.get(asset, {})
                if d.get("current"):
                    parts.append(f"  {asset}: ${d['current']:,.2f} (24h: {d.get('day_pct','?')}%, WoW: {d.get('wow_pct','?')}%, YTD: {d.get('ytd_pct','?')}%)")
    except Exception:
        pass

    # Fear & Greed + Dominance
    try:
        r = requests.get(f"{NEWS_API}/api/context", timeout=5)
        if r.status_code == 200:
            ctx = r.json()
            parts.append("\nMARKET CONTEXT:")
            if ctx.get("fear_greed_value"):
                parts.append(f"  Fear & Greed: {ctx['fear_greed_value']}/100 ({ctx.get('fear_greed_label', '')})")
            if ctx.get("btc_dominance"):
                parts.append(f"  BTC Dominance: {ctx['btc_dominance']}%")
            if ctx.get("eth_dominance"):
                parts.append(f"  ETH Dominance: {ctx['eth_dominance']}%")
    except Exception:
        pass

    # Technical indicators
    try:
        r = requests.get(f"{NEWS_API}/api/technical", timeout=5)
        if r.status_code == 200:
            tech = r.json()
            parts.append("\nTECHNICAL INDICATORS:")
            for asset in ["BTC", "ETH"]:
                t = tech.get(asset, {})
                if t:
                    line = f"  {asset}: RSI {t.get('rsi','?')}"
                    if t.get('macd'): line += f", MACD {t['macd']:.2f}"
                    if t.get('sma_50'): line += f", SMA50 ${t['sma_50']:,.0f}"
                    if t.get('sma_200'): line += f", SMA200 ${t['sma_200']:,.0f}"
                    if t.get('bb_pct_b') is not None: line += f", Bollinger %B {t['bb_pct_b']:.1f}"
                    parts.append(line)
    except Exception:
        pass

    # Signals
    try:
        r = requests.get(f"{NEWS_API}/api/signals", timeout=5)
        if r.status_code == 200:
            sig = r.json()
            signals = sig.get("signals", [])
            if signals:
                parts.append("\nMARKET SIGNALS:")
                for s in signals:
                    parts.append(f"  {s['name']}: {s.get('value', '--')} ({s['status']}) — {s['description']}")
    except Exception:
        pass

    # News headlines (top 5)
    try:
        r = requests.get(f"{NEWS_API}/api/news", timeout=5)
        if r.status_code == 200:
            news = r.json()
            items = news.get("items", [])[:5]
            if items:
                parts.append("\nLATEST NEWS:")
                for item in items:
                    parts.append(f"  - {item.get('title', '')} ({item.get('source', '')})")
    except Exception:
        pass

    # AI Insights
    try:
        r = requests.get(f"{NEWS_API}/api/insights", timeout=5)
        if r.status_code == 200:
            ins = r.json()
            parts.append("\nAI INSIGHTS:")
            if ins.get("risk_signal"):
                parts.append(f"  Risk Signal: {ins['risk_signal']}")
            if ins.get("institutional"):
                parts.append(f"  Institutional: {ins['institutional']}")
            if ins.get("key_levels"):
                parts.append(f"  Key Levels: {ins['key_levels']}")
    except Exception:
        pass

    return "\n".join(parts)

MARKET_KEYWORDS = ["btc", "bitcoin", "eth", "ethereum", "price", "market", "fear", "greed",
                   "bull", "bear", "trading", "crypto", "ibit", "gold", "s&p", "rally", "crash",
                   "dominance", "rsi", "macd", "signal", "sentiment", "buy", "sell", "news",
                   "headline", "technical", "analysis", "outlook", "trend", "support", "resistance"]

# ── Markdown normalizer ──
# The widget renders <strong> but not markdown. Haiku occasionally slips into **bold**,
# '# headings' or '* bullets' (especially on urgent security replies) — convert them.
_MD_BOLD = re.compile(r"\*\*(.+?)\*\*")
_MD_HEADING = re.compile(r"^\s{0,3}#{1,6}\s+", re.M)
_MD_BULLET = re.compile(r"^\s{0,3}[\*•]\s+", re.M)
def _normalize_markdown(text):
    text = _MD_BOLD.sub(r"<strong>\1</strong>", text)
    text = _MD_HEADING.sub("", text)
    text = _MD_BULLET.sub("- ", text)
    return text


# ── Follow-up + handoff extraction ──
def _extract_follow_ups(answer):
    lines = answer.split("\n")
    follow_ups = []
    handoff = False
    clean_lines = []
    for line in lines:
        stripped = line.strip()
        if stripped.startswith("FOLLOWUP:"):
            for piece in re.split(r"\s*/?\s*FOLLOWUP:\s*", stripped):
                q = piece.strip().strip("/").strip()
                if q:
                    follow_ups.append(q)
        elif stripped.upper() in ("HANDOFF", "HANDOFF:TRUE", "HANDOFF: TRUE") or stripped.upper().startswith("HANDOFF:"):
            val = stripped.split(":", 1)[1].strip().lower() if ":" in stripped else "true"
            if val in ("", "true", "yes", "1"):
                handoff = True
        else:
            clean_lines.append(line)
    while clean_lines and not clean_lines[-1].strip():
        clean_lines.pop()
    return "\n".join(clean_lines), follow_ups[:3], handoff


# ── Routes ──

@app.route("/")
def index():
    return send_from_directory(".", "preview.html")


@app.route("/mobile")
def mobile():
    return send_from_directory(".", "mobile.html")


@app.route("/andx-widget.js")
def widget_js():
    return send_from_directory(".", "andx-widget.js", mimetype="application/javascript")


@app.route("/andx-widget-v2.js")
def widget_js_v2():
    """Aurora Glass v2 widget (preview / not yet production)."""
    return send_from_directory(".", "andx-widget-v2.js", mimetype="application/javascript")


@app.route("/preview-v2")
@app.route("/preview-v2.html")
def preview_v2():
    """Standalone preview page for the v2 widget — loads it on a fake andx.ai-ish page."""
    return send_from_directory(".", "preview-v2.html")


@app.route("/xore.gif")
def xore_gif():
    """Animated XORE sphere icon for the FAB. ~3.4MB raster — cache hard."""
    resp = send_from_directory(".", "xore.gif", mimetype="image/gif")
    # Long cache (immutable asset) so it doesn't re-download on every page
    resp.headers["Cache-Control"] = "public, max-age=2592000, immutable"
    return resp


@app.route("/xore.png")
def xore_png():
    """High-res XORE sphere PNG for the FAB. Native 1645x1593, ~1MB."""
    resp = send_from_directory(".", "xore.png", mimetype="image/png")
    resp.headers["Cache-Control"] = "public, max-age=2592000, immutable"
    return resp


@app.route("/embed")
@app.route("/embed.html")
def embed():
    return send_from_directory(".", "embed.html")


@app.route("/fab-embed")
@app.route("/fab-embed.html")
def fab_embed():
    return send_from_directory(".", "fab-embed.html")


@app.route("/api/ask", methods=["POST", "OPTIONS"])
def api_ask():
    if request.method == "OPTIONS":
        return "", 200

    if not HAS_ANTHROPIC:
        return jsonify({"error": "AI not available"}), 503

    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not api_key:
        return jsonify({"error": "No API key configured"}), 503

    ip = request.headers.get("X-Forwarded-For", request.remote_addr or "").split(",")[0].strip()
    if not _rate_check(ip, limit=10, window=60):
        return jsonify({"error": "Rate limit exceeded. Please slow down."}), 429

    data = request.json or {}
    question = data.get("question", "").strip()[:500]
    chat_mode = data.get("mode", "beginner")
    history = data.get("history", [])
    reply_to = data.get("reply_to") or None

    if not question:
        return jsonify({"error": "No question provided"}), 400

    # Build conversation history
    history_block = ""
    if history:
        history_lines = ["CONVERSATION HISTORY:"]
        for i, ex in enumerate(history[-8:], 1):
            history_lines.append(f"[User {i}]: {ex.get('q', '')}")
            history_lines.append(f"[ANDX {i}]: {ex.get('a', '')[:400]}")
        history_block = "\n".join(history_lines) + "\n\n"

    # WhatsApp-style reply-to: if the user is replying to a specific earlier
    # message of ours, prepend a directive so the model quotes it and answers
    # in context.
    reply_to_block = ""
    if isinstance(reply_to, dict):
        preview = (reply_to.get("content_preview") or "")[:300]
        if preview:
            reply_to_block = (
                "REPLY-TO CONTEXT (CRITICAL):\n"
                "The user is replying directly to this earlier message of yours:\n"
                f"\"{preview}\"\n"
                "Begin your answer with one '> ' quoted line that paraphrases the relevant 6-12 words "
                "from that message (so the user sees the thread), then a blank line, then your fresh answer.\n\n"
            )

    system_prompt = f"""You are ANDX Support — a friendly, knowledgeable AI assistant on the ANDX platform (andx.ai).

{SUPPORT_OVERRIDES}

PRIMARY MISSION: Help users with ANDX platform questions — trading, fees, security, tokenization, team, sign up, app download, and anything about the company.
SECONDARY MISSION: If someone asks about market data, crypto prices, news, technical analysis, or signals — you CAN answer using the live data provided. But NEVER bring up market data yourself unless the user specifically asks about it.

KNOWLEDGE BASE:{ANDX_KNOWLEDGE}

COMPETITION AND TRADING-BOT KNOWLEDGE (student support — authoritative for the University Bot Trading Competition and the bot at bot.andx.ai):
{EXTRA_KNOWLEDGE}

CONVERSATION AWARENESS (CRITICAL):
- You have conversation history below. USE IT. If a user says "tell me more" or "what about that" or "how?" — look at what was just discussed and continue naturally.
- Never ask the user to repeat themselves. If they reference something from earlier in the chat, you should know what they mean.
- If a user sends a short follow-up like "and the fees?" after asking about trading, you should understand they mean trading fees.
- Respond like a real person having a conversation, not a search engine giving isolated answers.

COMPETITION SUPPORT RULES (apply whenever the user is a student, mentions a school, the competition, the trading bot, bot.andx.ai, API keys, the leaderboard, ROI, trading volume, the $100 starting balance, or a bot error):
- Answer from the COMPETITION AND TRADING-BOT KNOWLEDGE section. It overrides the generic ANDX answers for these topics (for example, the competition support email is support@andx.ai, and sign-up for the competition is bot.andx.ai/university).
- Before answering about dates, prizes, qualification or advancement, ask which school and which competition round the student is in, unless they already said so in the conversation. Schools have different schedules and prize announcements.
- Before troubleshooting a bot, establish whether it is the hosted cloud bot at bot.andx.ai or a downloaded / custom bot, unless already clear.
- NEVER ask for, and never accept, an API secret, password, one-time code, seed phrase or a screenshot of the API-key page. If one is pasted, tell the student to delete that key on ANDX and create a new one immediately.
- When a student reports an error, quote their exact error line first, then give the matched fix from the ERRORS list. If no error matches, ask for the last five Activity log lines as text with sensitive details removed.
- Never present a proposed extension, fresh-start week, prize or monthly format as already active. The competition currently runs college to college (see SUPPORT TEAM OVERRIDES). For any account-specific outcome (funding, elimination, missing volume, prize status, late entry, existing accounts, manual trades, multiple bots, withdrawals of starting capital) give the general rule and refer the student to support@andx.ai.
- Rule 11 (analytics redirect) does NOT apply to questions about the competition bot: its styles, settings, risk controls, why it is or isn't trading, why it is losing money, or how ROI, volume and loss limits are scored. Answer those directly from the competition knowledge.
- Troubleshooting checklists may run up to 300 words. Keep everything else concise.
- When YOU ask the student a clarifying question (school, round, cloud vs laptop bot), make the 3 FOLLOWUPs the likely answers they can tap, each on its OWN line, for example:
FOLLOWUP: I'm at USF
FOLLOWUP: I'm at Queens College
FOLLOWUP: I use the cloud bot at bot.andx.ai
- Trigger HANDOFF (see below) for missing competition funds, elimination disputes, suspected unauthorized access, or a technical outage that is costing the student trading volume.

OFF-TOPIC HANDLING:
- You ONLY help with ANDX, crypto markets, and related financial topics.
- If someone asks about something completely unrelated (cooking, sports, homework, coding, etc.), respond kindly: "I appreciate the question, but I'm specifically here to help with ANDX and the crypto markets. Is there anything about our platform I can help you with?"
- NEVER answer off-topic questions. Always redirect back to ANDX politely.
- If someone is rude or hostile, stay calm and professional. Do not engage with negativity.

FORMATTING RULES:
- Break your answer into short paragraphs of 2-3 sentences each
- Put TWO line breaks between paragraphs for clear visual separation
- For lists, put each item on its own line
- NEVER write one giant wall of text
- Use <strong> tags to highlight key numbers, names, and important info
- Keep each paragraph focused on ONE point

CRITICAL RULES:
1. NEVER use # headings or * asterisks. Only use <strong> tags for emphasis.
2. Answer concisely — under 200 words for support questions. For market data questions, up to 350 words.
3. If the user misspells words or asks vaguely, figure out what they mean. Never ask "what do you mean?"
4. STRICT RULE — NEVER FABRICATE OR GUESS: Before answering ANY question, check if the answer exists in your knowledge base, the competition knowledge, the live website snapshot, or the live market data provided. If the information is NOT explicitly in your knowledge base, DO NOT make up an answer. Instead say something like: "I don't have the specific details on that right now. For the most accurate and up-to-date information, I'd recommend reaching out to our team at support@andx.ai — they'll be able to help." This applies even if you think you know the answer — if it's not in the knowledge base, don't say it. This is critical for legal compliance.
5. Always be positive about ANDX. You represent the brand.
6. When someone asks for a shorter or simpler answer, give it. When they ask for more detail, expand.
7. If the user says "take me to", "open", "go to", "navigate to", or "redirect to" a page — respond with ONLY the URL and nothing else.
8. CRITICAL URL RULE: Every ANDX web property is on andx.ai — main site andx.ai, trading platform platform.andx.ai, tokenization rwa.andx.ai, trading bot bot.andx.ai, market intelligence news.andx.ai, AI analytics analytics.andx.ai, help center us-support.andx.ai. The only exception is the API docs at docs.andx.one. NEVER give a .global, andxus.io or andx.one web link. When the live snapshot's CURRENT LINK DIRECTORY has a matching link, use that exact link. The only support email is support@andx.ai.
9. If someone says "hi", "hello", "hey" — respond warmly and briefly, then ask how you can help with ANDX. Don't give a long introduction.
10. If someone asks the same question again, don't repeat yourself word for word. Give a fresh, shorter version.
11. TECHNICAL/FINANCIAL ANALYSIS REDIRECT: If a user asks a deeply technical or analytical financial question — things like "should I buy BTC now?", "what's the RSI on ETH?", "is this a good entry point?", "what's the price target?", "give me a chart analysis", "what indicators show?", "is this bullish or bearish?", trading strategy advice, portfolio recommendations, or any kind of investment advice — DO NOT answer the question yourself. Instead respond ONLY with: "For technical questions and financial advice, please visit our AI analytics engine at analytics.andx.ai" and nothing else. Do not include follow-ups for these responses. The widget will automatically render a button.

DIRECTING USERS TO PAGES:
- Sign up: platform.andx.ai/signup
- Log in: platform.andx.ai/login
- Tokenization: rwa.andx.ai (andx.ai/andx-tokenization) — all offerings: rwa.andx.ai/offerings
- Manila One: andx.ai/m1
- How it works: andx.ai/how-it-works
- Why ANDX: andx.ai/why-andx
- Fees: andx.ai/fees
- Live markets / prices: andx.ai/market
- Help Center: us-support.andx.ai — Contact form: andx.ai/contact-us
- Download app (Android): play.google.com/store/apps/details?id=one.andx.platform (or onelink.to/nfgq9a)
- Download app (iOS): apps.apple.com/us/app/andx-us-crypto-trading/id6754659164
- Market dashboard: news.andx.ai (NEVER news.andxus.io)
- AI Analytics Engine (technical/financial analysis): analytics.andx.ai
- Simulator: news.andx.ai/simulator
- Trade Ideas: news.andx.ai/trade-ideas
- Battle Mode: news.andx.ai/battle
- Signals: news.andx.ai/signals
- Trading bot dashboard: bot.andx.ai
- Competition signup: bot.andx.ai/university
- Competition leaderboard: platform.andx.ai/trading-competition — official rules: bot.andx.ai/university/rules
- Order history: platform.andx.ai/spot and platform.andx.ai/derivatives
- Support: support@andx.ai (phone 888-343-4394)
- Team: andx.ai/about-us
- News: andx.ai/news

FOLLOW-UPS: After your answer, add exactly 3 follow-ups. Each on its own line, prefixed with "FOLLOWUP: ".
Each MUST be a short question the USER would ask — something they can tap to learn more.
Make follow-ups RELEVANT to what was just discussed, not generic.
GOOD: "What are the trading fees?", "How does BitGo custody work?", "How do I download the app?"
BAD: "What devices do you want?", "Would you like to know more?", "What brings you here?"
The follow-ups are buttons the user taps — they must read like questions a customer would ask.

LIVE AGENT HANDOFF (VERY IMPORTANT):
You can escalate to a live human agent when the user needs one. To trigger this, add a line at the very end of your response:
HANDOFF: true

When to trigger HANDOFF — offer live agent if ANY of these apply:
1. EXPLICIT REQUEST: "talk to human", "real person", "live agent", "customer service", "speak to someone", "operator", "representative", "human support", "call me", "phone"
2. FRUSTRATION: "this isn't helping", "you don't understand", "useless", "stupid bot", "wtf", repeated ALL CAPS, multiple "!!!", profanity directed at the bot, "nevermind forget it"
3. CONFUSED/LOST: "I don't know what to do", "I'm stuck", "please help me", "I'm confused and need help", user repeating same question 3+ times
4. ACCOUNT/MONEY ISSUES: account locked/frozen, can't log in, missing funds, withdrawal stuck, deposit not showing, KYC rejected, security concerns, suspicious activity, refund request, chargeback, stolen funds, hacked account
5. LEGAL/COMPLIANCE: tax questions, legal dispute, formal complaint, regulator mention, threat of legal action

When you trigger handoff:
- Say something warm and reassuring: "Let me connect you with a live agent who can help with this directly. Tap the button below to chat — or you can call us directly at 888-343-4394 for immediate help."
- If the user seems frustrated, upset, or has an urgent/serious issue (account locked, money missing, security concern), ALWAYS explicitly mention the phone number 888-343-4394 in your response so they know they can call right now.
- Keep the message short — don't try to solve the problem yourself once you've decided to escalate
- Still include 3 FOLLOWUPs (they help the user think of what to ask the agent)
- End with HANDOFF: true on its own line

PHONE NUMBER: Our live support line is 888-343-4394. Mention this whenever:
- A user is frustrated, angry, or using urgent language
- Someone has an account lockout, missing funds, or security issue
- A user explicitly asks for phone support
- You're triggering HANDOFF for anything time-sensitive
Always format the phone number as "888-343-4394" in your responses.

Do NOT trigger handoff for:
- Basic questions you can answer (fees, tokenization, how to sign up, etc.)
- Market data or price questions
- Casual greetings
- Questions where the knowledge base has a clear answer

HANDOFF triggers should be genuine — don't offer it pre-emptively. Only when the user actually needs human help."""

    # Fetch live market data if the question is market-related
    market_block = ""
    is_market_q = any(k in question.lower() for k in MARKET_KEYWORDS)
    if is_market_q:
        market_ctx = fetch_market_context()
        if market_ctx:
            market_block = f"LIVE MARKET DATA (from ANDX Intelligence):\n{market_ctx}\n\n"

    user_msg = f"{market_block}{reply_to_block}{history_block}USER QUESTION: {question}"

    # Keep the website snapshot fresh without ever blocking a chat request
    if site_scan.is_stale():
        site_scan.refresh_in_background()
    snapshot_block = site_scan.prompt_block()

    # The big static prompt is sent as a cached block; the live snapshot (changes a
    # few times a day) goes in a second, uncached block so cache hits stay high.
    system_blocks = [{"type": "text", "text": system_prompt, "cache_control": {"type": "ephemeral"}}]
    if snapshot_block:
        system_blocks.append({"type": "text", "text": snapshot_block})

    try:
        client = anthropic.Anthropic(api_key=api_key)
        try:
            msg = client.messages.create(
                model="claude-haiku-4-5-20251001",
                max_tokens=900,
                system=system_blocks,
                messages=[{"role": "user", "content": user_msg}],
            )
        except TypeError:
            # very old SDK without block support — fall back to a plain string
            msg = client.messages.create(
                model="claude-haiku-4-5-20251001",
                max_tokens=900,
                system=system_prompt + ("\n\n" + snapshot_block if snapshot_block else ""),
                messages=[{"role": "user", "content": user_msg}],
            )
        raw_answer = msg.content[0].text
        # Force correct URL — AI sometimes hallucinates news.andxus.io
        for bad, good in (("news.andxus.io", "news.andx.ai"), ("support@andxus.io", "support@andx.ai"),
                          ("platform.andx.global", "platform.andx.ai"), ("rwa.andx.global", "rwa.andx.ai"),
                          ("news.andx.global", "news.andx.ai"), ("analytics.andx.global", "analytics.andx.ai"),
                          ("www.andx.global", "andx.ai"), ("andx.global", "andx.ai"), ("platform.andx.one", "platform.andx.ai")):
            raw_answer = raw_answer.replace(bad, good)
        answer, follow_ups, handoff = _extract_follow_ups(raw_answer)
        answer = _normalize_markdown(answer)
        return jsonify({
            "answer": answer,
            "follow_ups": follow_ups,
            "citations": [],
            "handoff_offer": handoff and _zoho_configured(),
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ── Agent availability ──
@app.route("/api/agent-status", methods=["GET", "OPTIONS"])
def api_agent_status():
    """Backend-determined agent availability (hours never exposed to client)."""
    if request.method == "OPTIONS":
        return "", 200
    return jsonify({
        "available": _agents_available_now(),
        "configured": _zoho_configured(),
    })


# ── Live operator handoff ──
@app.route("/api/handoff", methods=["POST", "OPTIONS"])
def api_handoff():
    if request.method == "OPTIONS":
        return "", 200

    ip = request.headers.get("X-Forwarded-For", request.remote_addr or "").split(",")[0].strip()
    # Tighter rate limit — handoff is expensive
    if not _rate_check("handoff|" + ip, limit=3, window=300):
        return jsonify({"ok": False, "message": "Too many handoff requests. Please wait a moment."}), 429

    if not _zoho_configured():
        # Fall back to email-only handoff so the widget still does something useful
        return jsonify({
            "ok": False,
            "message": "Live agent service is being set up. For now, please email support@andx.ai and we'll respond quickly."
        }), 503

    data = request.json or {}
    initial_message = (data.get("initial_message") or "").strip()[:5000]
    last_message = (data.get("last_message") or "").strip()[:1000]
    chat_history = data.get("history") or []
    user_email = (data.get("email") or "").strip()[:200]
    user_name = (data.get("name") or "").strip()[:120]
    page_url = (data.get("page_url") or "").strip()[:500]
    session_id = (data.get("session_id") or "").strip()[:100]

    # Email is REQUIRED. Even when an agent is online, network drops happen
    # and the agent needs a way back to the visitor. The widget gates this
    # client-side too, but enforce it server-side so direct API calls don't
    # bypass it.
    has_real_email = "@" in user_email and "." in user_email.split("@")[-1]
    if not has_real_email:
        return jsonify({
            "ok": False,
            "message": "Please enter your email so the agent can reach you."
        }), 400
    is_anonymous = False  # No anon path anymore

    primary_message = initial_message or last_message or "Live agent request"

    ok, ticket_id, err = zoho_create_ticket(
        user_message=primary_message,
        chat_history=chat_history,
        user_email=user_email,
        user_name=user_name,
        page_url=page_url,
        session_id=session_id,
    )

    if ok:
        # If the user typed a fresh query AND there's a recent bot exchange,
        # post the typed query as a follow-up comment so it shows in the thread.
        if initial_message and last_message and initial_message != last_message:
            try:
                zoho_add_user_message(ticket_id, initial_message)
            except Exception as e:
                print(f"[handoff] failed to append initial_message: {e}")

        token = _sign_ticket(ticket_id)
        agents_on = _agents_available_now()
        # Seed the heartbeat tracker so this visitor counts in the queue
        _heartbeat(str(ticket_id), email=user_email, agent_responded=False)
        if agents_on:
            msg = "You're connected. Keep typing here \u2014 a live agent will respond as soon as they pick up."
        else:
            msg = "Got it \u2014 your message has been sent. An agent will reply by email shortly. You can keep typing here too if you think of more details."
        return jsonify({
            "ok": True,
            "message": msg,
            "agents_available": agents_on,
            "ticket_id": str(ticket_id),
            "ticket_token": token,
            "start_ts": int(time.time()),
        })
    return jsonify({
        "ok": False,
        "message": "We're having trouble reaching a live agent right now. Please email support@andx.ai or call us at 888-343-4394 and we'll get back to you quickly."
    }), 502


@app.route("/api/handoff-message", methods=["POST", "OPTIONS"])
def api_handoff_message():
    """Append a user message to an existing live-agent ticket."""
    if request.method == "OPTIONS":
        return "", 200

    ip = request.headers.get("X-Forwarded-For", request.remote_addr or "").split(",")[0].strip()
    if not _rate_check("hmsg|" + ip, limit=60, window=60):
        return jsonify({"ok": False, "message": "Sending too fast. Please slow down."}), 429

    data = request.json or {}
    ticket_id = (data.get("ticket_id") or "").strip()[:40]
    token = (data.get("ticket_token") or "").strip()[:200]
    message = (data.get("message") or "").strip()[:5000]
    reply_to = data.get("reply_to") or None

    if not ticket_id or not token or not message:
        return jsonify({"ok": False, "message": "Missing fields."}), 400
    if not _verify_ticket_token(ticket_id, token):
        return jsonify({"ok": False, "message": "Invalid session."}), 403

    # Refresh heartbeat (visitor is actively typing) so the queue stays honest
    _heartbeat(ticket_id)

    # Prefix WhatsApp-style reply quote so the agent sees the thread in Zoho
    if isinstance(reply_to, dict):
        preview = (reply_to.get("content_preview") or "")[:200].replace("\n", " ").strip()
        if preview:
            message = f"↳ Replying to \"{preview}\":\n{message}"

    ok, _tid = zoho_add_user_message(ticket_id, message)
    if ok:
        return jsonify({"ok": True})
    return jsonify({
        "ok": False,
        "message": "Your message didn't go through. Please try again, or call us at 888-343-4394."
    }), 502


# ── Message reactions (👍 ❤️ 😂 😮 😢 👎) ──
_reaction_cache = {}  # (ticket_id, message_id) -> {"emoji": str, "ts": float}
_reaction_lock = threading.Lock()
REACTION_DEDUPE_TTL_SECONDS = 24 * 60 * 60

def _reaction_already_recorded(key, emoji):
    """Return True if (ticket_id, message_id) already has this exact emoji.
    Replaces older emoji on the same message; expires after 24h."""
    now = time.time()
    with _reaction_lock:
        # Prune
        for k in [k for k, v in _reaction_cache.items() if now - v.get("ts", 0) > REACTION_DEDUPE_TTL_SECONDS]:
            _reaction_cache.pop(k, None)
        prev = _reaction_cache.get(key)
        if prev and prev.get("emoji") == emoji:
            return True
        _reaction_cache[key] = {"emoji": emoji, "ts": now}
        return False

@app.route("/api/reaction", methods=["POST", "OPTIONS"])
def api_reaction():
    """Record a visitor reaction on a bot or agent message.

    For AI messages with 👎: returns a Claude-rephrased follow-up.
    For agent messages: posts a Zoho comment so the real agent sees it.
    """
    if request.method == "OPTIONS":
        return "", 200

    ip = request.headers.get("X-Forwarded-For", request.remote_addr or "").split(",")[0].strip()
    if not _rate_check("react|" + ip, limit=60, window=60):
        return jsonify({"ok": False}), 429

    data = request.json or {}
    message_id = (data.get("message_id") or "").strip()[:64]
    message_role = (data.get("message_role") or "").strip()[:20]  # "ai" | "agent"
    message_preview = (data.get("message_preview") or "").strip()[:500]
    reaction = (data.get("reaction") or "").strip()[:10]
    ticket_id = (data.get("ticket_id") or "").strip()[:40]
    token = (data.get("ticket_token") or "").strip()[:200]

    if not message_id or not reaction:
        return jsonify({"ok": False, "error": "missing_fields"}), 400

    allowed_emojis = ["\U0001f44d", "❤️", "\U0001f602", "\U0001f62e", "\U0001f622", "\U0001f44e"]
    # Also accept the bare red heart codepoint without the variation selector
    if reaction not in allowed_emojis and reaction != "❤":
        return jsonify({"ok": False, "error": "invalid_emoji"}), 400

    cache_key = (ticket_id or "_no_ticket", message_id)
    is_dupe = _reaction_already_recorded(cache_key, reaction)

    follow_up = None

    # AI message reactions
    if message_role == "ai":
        if reaction in ("\U0001f44e",) and not is_dupe:
            # Dislike → ask Claude to try again, more concretely
            try:
                follow_up = _ai_rephrase_after_dislike(
                    previous_answer=message_preview,
                    history=data.get("history") or [],
                    mode=(data.get("mode") or "beginner"),
                )
            except Exception as e:
                print(f"[reaction] rephrase exception: {e}")
                follow_up = "Sorry that wasn't helpful — could you tell me what part you'd like me to clarify, or want me to connect you with a live agent?"
        return jsonify({"ok": True, "follow_up": follow_up})

    # Agent message reactions — push a Zoho comment so the real agent sees it
    if message_role == "agent":
        if not ticket_id or not token:
            return jsonify({"ok": False, "error": "missing_ticket"}), 400
        if not _verify_ticket_token(ticket_id, token):
            return jsonify({"ok": False, "error": "bad_token"}), 403
        if not is_dupe:
            try:
                # Prefix with "<b>User message:</b>" so our own polling skips it
                # (otherwise the comment would round-trip back into the chat as
                # an "agent reply").
                preview = (message_preview or "")[:80]
                comment = f"[VISITOR REACTION] {reaction} on: \"{preview}\""
                zoho_add_user_message(ticket_id, comment)
            except Exception as e:
                print(f"[reaction] zoho comment exception: {e}")
        return jsonify({"ok": True, "follow_up": None})

    return jsonify({"ok": False, "error": "invalid_role"}), 400


def _ai_rephrase_after_dislike(previous_answer, history, mode):
    """Call Claude to rewrite the previous answer differently — concrete,
    simpler, or with an example. Returns the new text or None on failure."""
    if not HAS_ANTHROPIC:
        return None
    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not api_key:
        return None
    try:
        client = anthropic.Anthropic(api_key=api_key)
        ctx = ""
        if history:
            tail = history[-6:] if isinstance(history, list) else []
            for m in tail:
                if not isinstance(m, dict):
                    continue
                role = m.get("role", "user")
                content = (m.get("content") or "")[:500]
                ctx += f"{role}: {content}\n"
        prompt = (
            "The user just gave a thumbs-down to your previous answer. "
            "Try a fresh angle: simpler language, a concrete example, or a different framing. "
            "Don't apologize or repeat what you said — just deliver a better answer. "
            "Keep it concise (3-5 sentences)."
            f"\n\nYour previous answer was:\n{previous_answer}\n\n"
            f"Recent conversation:\n{ctx}\n\n"
            "Respond now."
        )
        resp = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=500,
            messages=[{"role": "user", "content": prompt}],
        )
        if resp and resp.content and len(resp.content) > 0:
            return resp.content[0].text.strip()
    except Exception as e:
        print(f"[reaction] anthropic call exception: {e}")
    return None


@app.route("/api/handoff-queue", methods=["GET", "OPTIONS"])
def api_handoff_queue():
    """Honest queue: counts only visitors who heartbeat within HEARTBEAT_FRESH_SECONDS.

    Response shape:
      - state: "queued" | "active" | "ended"
      - position: 1-indexed place among waiting visitors (only when queued)
      - total: number of waiting visitors (only when queued)
      - estimated_wait_min: rounded ETA based on position (only when queued)
      - agent_name: disguised name of the agent (only when active)
    """
    if request.method == "OPTIONS":
        return "", 200

    ip = request.headers.get("X-Forwarded-For", request.remote_addr or "").split(",")[0].strip()
    if not _rate_check("hq|" + ip, limit=60, window=60):
        return jsonify({"ok": False}), 429

    ticket_id = (request.args.get("ticket_id") or "").strip()[:40]
    token = (request.args.get("ticket_token") or "").strip()[:200]
    if not ticket_id or not token:
        return jsonify({"ok": False}), 400
    if not _verify_ticket_token(ticket_id, token):
        return jsonify({"ok": False}), 403

    # Refresh this visitor's heartbeat — they're actively asking about queue
    _heartbeat(ticket_id)

    snapshot = _snapshot_active_handoffs()
    me = snapshot.get(ticket_id)
    if not me:
        # Heartbeat tracker doesn't know us — ticket was ended (or server restarted).
        return jsonify({"ok": True, "state": "ended", "position": 0, "total": 0}), 200

    if me.get("agent_responded"):
        return jsonify({
            "ok": True,
            "state": "active",
            "position": 0,
            "total": 0,
            "agent_name": me.get("agent_name") or "Live Agent",
        }), 200

    # Waiting in queue: count visitors ahead of us by start time, ignoring those
    # who've already been picked up by an agent.
    waiting = [(tid, e) for tid, e in snapshot.items() if not e.get("agent_responded")]
    waiting.sort(key=lambda kv: kv[1].get("started", 0))
    position = 1
    for tid, _e in waiting:
        if tid == ticket_id:
            break
        position += 1
    total = len(waiting)
    eta_seconds = position * QUEUE_ETA_SECONDS_PER_PERSON
    estimated_wait_min = max(1, round(eta_seconds / 60))

    return jsonify({
        "ok": True,
        "state": "queued",
        "position": position,
        "total": total,
        "is_next": position == 1,
        "estimated_wait_min": estimated_wait_min,
    }), 200


@app.route("/api/handoff-end", methods=["POST", "OPTIONS"])
def api_handoff_end():
    """End a visitor's live-chat session: drop from heartbeat tracker AND mark
    the Zoho ticket as Closed so the queue immediately reflects the change."""
    if request.method == "OPTIONS":
        return "", 200

    # sendBeacon doesn't set Content-Type, so accept both JSON and form data
    data = request.get_json(silent=True) or {}
    if not data and request.data:
        try:
            data = _json.loads(request.data.decode("utf-8") or "{}")
        except Exception:
            data = {}

    ticket_id = (data.get("ticket_id") or "").strip()[:40]
    token = (data.get("ticket_token") or "").strip()[:200]
    if not ticket_id or not token:
        return jsonify({"ok": False}), 400
    if not _verify_ticket_token(ticket_id, token):
        return jsonify({"ok": False}), 403

    _drop_active_handoff(ticket_id)

    # Best-effort: PATCH Zoho ticket to Closed so the agent UI shows it resolved
    if _zoho_configured():
        try:
            tok = _zoho_access_token()
            if tok:
                requests.patch(
                    f"{ZOHO_API_DOMAIN}/api/v1/tickets/{ticket_id}",
                    headers={
                        "Authorization": f"Zoho-oauthtoken {tok}",
                        "orgId": ZOHO_ORG_ID,
                        "Content-Type": "application/json",
                    },
                    json={"status": "Closed"},
                    timeout=8,
                )
        except Exception as e:
            print(f"[handoff-end] zoho close exception: {e}")

    return jsonify({"ok": True}), 200


@app.route("/api/register-push-token", methods=["POST", "OPTIONS"])
def api_register_push_token():
    """Register a mobile device's FCM/APNs token so we can push agent replies
    even when the app is closed. Called from the native React Native widget on
    app open. Idempotent — safe to call repeatedly."""
    if request.method == "OPTIONS":
        return "", 200

    ip = request.headers.get("X-Forwarded-For", request.remote_addr or "").split(",")[0].strip()
    if not _rate_check("pushreg|" + ip, limit=30, window=60):
        return jsonify({"ok": False, "error": "rate_limited"}), 429

    data = request.get_json(silent=True) or {}
    session_id = (data.get("session_id") or "").strip()[:100]
    push_token = (data.get("push_token") or "").strip()[:500]
    platform = (data.get("platform") or "").strip().lower()
    ticket_id = (data.get("ticket_id") or "").strip()[:40]
    ticket_token = (data.get("ticket_token") or "").strip()[:200]
    device_id = (data.get("device_id") or "").strip()[:100]

    if not session_id or not push_token or platform not in ("ios", "android"):
        return jsonify({"ok": False, "error": "missing_fields"}), 400

    # If a ticket pair was provided, verify it. (Ticket binding is optional —
    # session_id alone is enough to receive pushes once a ticket exists.)
    if ticket_id and ticket_token and not _verify_ticket_token(ticket_id, ticket_token):
        return jsonify({"ok": False, "error": "bad_token"}), 403

    ok, err = push_store_token(
        session_id=session_id,
        push_token=push_token,
        platform=platform,
        ticket_id=ticket_id or None,
        ticket_token=ticket_token or None,
        device_id=device_id or None,
    )
    if not ok:
        return jsonify({"ok": False, "error": err or "store_failed"}), 503
    return jsonify({"ok": True}), 200


# Track which agent replies we've already emailed so polling doesn't fire dupes.
_emailed_replies = set()
_emailed_lock = threading.Lock()

def _email_agent_reply_async(ticket_id, reply):
    """Fire-and-forget SMTP email of an agent reply to the ticket's contact.

    This is the SMTP fallback that lets us bypass Zoho's outbound email channel
    (which requires Zoho-side admin config). As long as SMTP creds are set in
    env vars, the visitor gets an email copy of every agent reply.
    """
    rid = reply.get("id") or ""
    if not rid:
        return
    with _emailed_lock:
        if rid in _emailed_replies:
            return
        _emailed_replies.add(rid)
        # Cap memory growth — clear once we hit 5k entries
        if len(_emailed_replies) > 5000:
            _emailed_replies.clear()
            _emailed_replies.add(rid)

    if not _smtp_configured():
        return
    try:
        contact_email = _zoho_ticket_contact_email(ticket_id)
        if not contact_email:
            return
        # Skip the shared anonymous fallback address — those visitors didn't
        # give us their real email, so emailing the fallback would just spam our
        # own support inbox with copies of every agent reply.
        anon_addr = os.environ.get("ANON_CONTACT_EMAIL", "support@andx.ai").lower()
        if contact_email.lower() == anon_addr:
            return
        # Legacy guard for old tickets created with the fake .local domain
        if contact_email.endswith("@chat.andxus.local") or contact_email.endswith("@chat.andxus.io"):
            return
        agent_name = reply.get("agent_name") or "ANDX Support"
        content = (reply.get("content") or "").strip()
        if not content:
            return
        # Convert plain newlines to <br>; the content from Zoho is already plain text
        content_html = content.replace("\n", "<br>")
        subject = f"{agent_name} replied to your ANDX support chat"
        html = (
            "<div style=\"font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;"
            "max-width:560px;margin:0 auto;padding:24px;color:#1a1a2e;background:#fafafa\">"
            "<div style=\"background:#fff;padding:28px;border-radius:12px;border:1px solid #e8e6f0\">"
            f"<h2 style=\"color:#724dfb;margin:0 0 8px;font-size:20px\">A reply from {agent_name}</h2>"
            "<p style=\"color:#666;font-size:13px;margin:0 0 20px\">Your ANDX support agent has responded.</p>"
            "<div style=\"border-left:3px solid #724dfb;padding:14px 18px;margin:0 0 20px;background:#faf9ff;"
            f"font-size:15px;line-height:1.55;color:#1a1a2e;border-radius:0 6px 6px 0\">{content_html}</div>"
            "<p style=\"color:#888;font-size:12px;line-height:1.5;margin:24px 0 0;border-top:1px solid #eee;padding-top:16px\">"
            "Reply directly to this email or visit <a href=\"https://andx.ai\" style=\"color:#724dfb\">andx.ai</a> "
            "and open the chat to continue the conversation.</p>"
            "</div></div>"
        )
        ok, err = smtp_send_email(contact_email, subject, html)
        if not ok:
            print(f"[email] reply email failed for ticket {ticket_id}: {err}")
    except Exception as e:
        print(f"[email] reply email exception for ticket {ticket_id}: {e}")


@app.route("/api/handoff-poll", methods=["GET", "OPTIONS"])
def api_handoff_poll():
    """Poll for new agent replies on a ticket since a given timestamp."""
    if request.method == "OPTIONS":
        return "", 200

    ip = request.headers.get("X-Forwarded-For", request.remote_addr or "").split(",")[0].strip()
    # Polling is frequent, but a reasonable cap prevents abuse
    if not _rate_check("hpoll|" + ip, limit=120, window=60):
        return jsonify({"ok": False, "replies": []}), 429

    ticket_id = (request.args.get("ticket_id") or "").strip()[:40]
    token = (request.args.get("ticket_token") or "").strip()[:200]
    try:
        since_ts = int(request.args.get("since_ts") or "0")
    except ValueError:
        since_ts = 0

    if not ticket_id or not token:
        return jsonify({"ok": False, "replies": []}), 400
    if not _verify_ticket_token(ticket_id, token):
        return jsonify({"ok": False, "replies": []}), 403

    # Refresh heartbeat — the visitor is actively polling, so they're "in chat"
    _heartbeat(ticket_id)

    replies = zoho_fetch_agent_replies(ticket_id, since_ts=since_ts)
    if replies:
        # Mark this ticket as "active" (agent has replied) and remember the
        # disguised agent name for the live indicator pill.
        _heartbeat(ticket_id, agent_responded=True, agent_name=replies[-1].get("agent_name") or "Live Agent")
    # Fire SMTP emails in the background so the visitor gets a copy in their
    # inbox even after they close the tab — independent of Zoho's outbound
    # email channel (which often isn't configured on fresh Zoho Desk orgs).
    # Also fire FCM/APNs pushes to any registered mobile devices for this ticket.
    for reply in replies:
        threading.Thread(
            target=_email_agent_reply_async,
            args=(ticket_id, reply),
            daemon=True,
        ).start()
        if FCM_ENABLED:
            threading.Thread(
                target=_push_agent_reply_async,
                args=(ticket_id, reply),
                daemon=True,
            ).start()
    return jsonify({"ok": True, "replies": replies, "now_ts": int(time.time())})


@app.route("/api/handoff-transcript", methods=["POST", "OPTIONS"])
def api_handoff_transcript():
    """Email the full chat transcript to the ticket's registered email address."""
    if request.method == "OPTIONS":
        return "", 200

    ip = request.headers.get("X-Forwarded-For", request.remote_addr or "").split(",")[0].strip()
    if not _rate_check("htrans|" + ip, limit=4, window=300):
        return jsonify({"ok": False, "message": "Too many transcript requests. Please wait a few minutes."}), 429

    data = request.json or {}
    ticket_id = (data.get("ticket_id") or "").strip()[:40]
    token = (data.get("ticket_token") or "").strip()[:200]
    if not ticket_id or not token:
        return jsonify({"ok": False, "message": "Missing session info."}), 400
    if not _verify_ticket_token(ticket_id, token):
        return jsonify({"ok": False, "message": "Invalid session."}), 403

    ok, err = zoho_send_transcript(ticket_id)
    if ok:
        return jsonify({"ok": True, "message": "Transcript sent to your email."})
    # Friendly fallback
    if err == "no_contact_email":
        return jsonify({"ok": False, "message": "We don't have an email on file for this chat."}), 400
    return jsonify({"ok": False, "message": "Couldn't send the transcript right now. Please try again in a moment."}), 502


# ── Website scanner status / manual refresh ──
SITE_SCAN_TOKEN = os.environ.get("SITE_SCAN_TOKEN", "")

@app.route("/api/site-scan", methods=["GET", "POST", "OPTIONS"])
def api_site_scan():
    """GET: scanner status (no page content). POST: force a refresh — needs X-Scan-Token
    matching SITE_SCAN_TOKEN (set it on the service and point Cloud Scheduler here)."""
    if request.method == "OPTIONS":
        return "", 200
    if request.method == "GET":
        return jsonify(site_scan.status())
    token = request.headers.get("X-Scan-Token", "") or (request.get_json(silent=True) or {}).get("token", "")
    if not SITE_SCAN_TOKEN or token != SITE_SCAN_TOKEN:
        return jsonify({"ok": False, "error": "unauthorized"}), 403
    started = site_scan.refresh_in_background(force=True)
    return jsonify({"ok": True, "started": started, "note": "already running" if not started else "refresh started"})


@app.route("/api/site-scan/preview", methods=["GET"])
def api_site_scan_preview():
    """What the model currently sees (text). Token-protected because it reveals prompt content."""
    token = request.headers.get("X-Scan-Token", "") or request.args.get("token", "")
    if not SITE_SCAN_TOKEN or token != SITE_SCAN_TOKEN:
        return jsonify({"ok": False, "error": "unauthorized"}), 403
    return site_scan.prompt_block() or "(no snapshot yet)", 200, {"Content-Type": "text/plain; charset=utf-8"}


# ── Health check ──
@app.route("/health")
def health():
    st = site_scan.status()
    return jsonify({
        "status": "ok",
        "service": "andx-customer-service-bot",
        "zoho_configured": _zoho_configured(),
        "knowledge_chars": len(ANDX_KNOWLEDGE) + len(EXTRA_KNOWLEDGE),
        "site_scan_last_run": st.get("last_run"),
        "site_scan_stale": st.get("stale"),
    })


# Start the website scanner for every process (python app.py and gunicorn alike).
site_scan.start_scheduler()


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8081))
    print(f"ANDX Customer Service Bot running on port {port}")
    app.run(host="0.0.0.0", port=port, debug=False)
