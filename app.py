"""
ANDX Customer Service Bot — Standalone AI support chatbot for andxus.io
Separate from the news.andx.ai market intelligence platform.
"""
import os, time, threading, requests
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS

app = Flask(__name__, static_folder=".")
CORS(app, resources={r"/api/*": {"origins": ["https://andxus.io", "https://www.andxus.io", "https://andx.ai", "https://www.andx.ai", "http://localhost:*", "http://127.0.0.1:*"]}})

# ── Rate limiting ──
_rate_cache = {}
def _rate_check(ip, limit=10, window=60):
    now = time.time()
    key = f"{ip}:{int(now // window)}"
    _rate_cache[key] = _rate_cache.get(key, 0) + 1
    # Clean old entries
    for k in list(_rate_cache):
        if k.split(":")[1] != str(int(now // window)):
            del _rate_cache[k]
    return _rate_cache[key] <= limit

# ── Anthropic setup ──
HAS_ANTHROPIC = False
try:
    import anthropic
    HAS_ANTHROPIC = True
except ImportError:
    pass

# ── ANDX Knowledge Base ──
ANDX_KNOWLEDGE = """
ABOUT ANDX THE PLATFORM/COMPANY:
- ANDX Global is a licensed, regulated crypto exchange and digital finance platform serving 1,000,000+ users globally with 79,900 daily active traders and 99% uptime during peak volatility.
- CEO and Founder: Viru Raparthi — built the team combining bankers, risk managers, and compliance experts.
- COO and Co-Founder: Opender Singh, CFA — Wall Street veteran who left traditional finance to build AI-native Web3 markets.
- Mission: Unify multi-asset trading, tokenization, secure cross-border payments, real-time financial intelligence, and a gamified participation layer into one next-generation digital finance ecosystem.
- Tagline: "Crypto Markets. Real-World Assets. One Platform."
- Website: andxus.io
- AI Portal: andx.ai — adaptive intelligence systems powering smarter decisions in crypto and beyond. Features XORE AI assistant (launching soon).
- Global presence: ANDX operates in the United States (all 50 states), Brazil, Philippines, and Turkey.
- Contact / Support: support@andxus.io
- App download: Google Play (search "ANDX Smart Crypto Trading") or onelink.to/nfgq9a
- Trading platform login: platform.andx.one

TRADING FEATURES (andxus.io main page):
- Zero commission trading — $0 execution fees with transparent pricing and AI-driven risk modeling. Market spreads, blockchain network fees, and intermediary bank fees may still apply separately.
- Available in ALL 50 US states including New York (via BitGo New York Trust Company, NYDFS regulated).
- Deep institutional liquidity — pricing sourced from top-tier liquidity providers.
- Instant execution — your capital, on demand.
- Free ACH transfers with zero artificial delays. Same-day wire transfer options.
- Direct redemption to linked bank accounts on demand.
- Self-custodial withdrawals.
- No black-box operations, no artificial withdrawal delays, and no regulatory shortcuts.
- Trade from global alternatives to institutional real estate and RWAs.

SECURITY AND COMPLIANCE:
- FinCEN-registered Money Services Business.
- Bank Secrecy Act compliant.
- 1:1 asset reserves — ANDX maintains full reserves at all times.
- Custody: BitGo institutional-grade custody. Assets held offline in air-gapped vaults, insulated from remote attacks.
- Insurance: $250M insurance policy backed by Lloyd's of London syndicate.
- ANDX does NOT lend or rehypothecate customer assets. Customer assets are held in custody for the benefit of customers only.
- MARV Capital (SEC/FINRA registered) facilitates securities services.
- KYC/AML compliance with encrypted data handling per global standards.
- Federal bank oversight via BitGo OCC Charter.

WHY CHOOSE ANDX OVER COMPETITORS:
- $0 commissions (most exchanges charge 0.1-0.5% per trade)
- All 50 states including NY (many exchanges block NY users)
- BitGo custody with $250M insurance (most use less secure solutions)
- 1:1 reserves (no fractional reserve risk)
- Free ACH/wire (many charge $5-25 per transfer)
- SEC/FINRA alignment through MARV Capital
- No rehypothecation of customer assets (unlike some major exchanges)

TOKENIZATION (andxus.io/tokenization tab):
- Tagline: "Tokenize Real Assets. Unlock Global Capital."
- Institutional tokenization for compliant issuance and distribution of real-world assets (RWAs).
- Compliance-first workflows built for regulated markets.
- Programmable distributions, near-real-time reporting, and automated operations.
- Faster settlement and cross-border investor access.
- In simple terms: Tokenization means taking a real asset (like a building or land) and creating a digital token that represents ownership of a piece of it. This lets anyone invest in assets that used to only be available to rich investors, starting with smaller amounts.
- 6-step process: (1) Asset verification and SPV formation, (2) Legal compliance and KYC/AML screening, (3) Smart contract deployment, (4) Primary offering issuance, (5) Post-issuance operations with distributions and reporting, (6) Secondary liquidity options where permitted.
- Security: Third-party smart contract audits, multi-signature custody with encryption.
- Token types:
  - RealAsset Tokens (ART): Land, buildings, infrastructure — earn from property value going up and rental income.
  - Yield Tokens (AYT): Like bonds but digital — earn regular interest payments.
  - Growth Tokens (AGT): Invest in development projects — earn as the project grows.
  - Liquidity Reserve (ALR): Helps keep the market stable — like a safety net.
  - Fan Tokens (FNT): Get exclusive access and rewards — like a VIP membership.
  - Private Company Tokens (PCT): Own a piece of a private company — like stock but tokenized.

MANILA ONE PROJECT (featured on tokenization page):
- A tokenized real-world asset project on ANDX — a land development project in Manila.
- Target returns: 24% Preferred Return with 100% Target Return.
- This is an expected investor return profile, subject to change, and is not a guaranteed offer.
- Accessible directly from the ANDX trading dashboard.
- In simple terms: Manila One lets you invest in a real land project in the Philippines through a digital token. Instead of needing millions to buy property, you can participate with a smaller amount and potentially earn returns as the project develops.

ANDX ROADMAP:
1. Sovereign Exchange — live and operational now.
2. Real World Assets — tokenized assets currently in progress.
3. Intelligence Edge with AI tools — coming Q2 2026.
4. Global Velocity payment expansion — coming Q3 2026.

AI FEATURES (coming to beta — "AI Alpha" waitlist on andxus.io):
- Real-Time Stop-Loss Logic: AI suggests when to set stop-losses based on actual market volatility, not just a fixed price.
- "What-If" Backtesting: Test how your portfolio would have performed during past market crashes before risking real money.
- Contextual Alerts: Get plain-English market analysis delivered to your dashboard — no jargon, just clear insights.
- XORE: AI assistant on andx.ai — ask anything about getting started with ANDX.

ANDX MARKET INTELLIGENCE (news.andx.ai — separate product):
- A free market intelligence terminal with live crypto data, AI newsletters, trade ideas, asset battle arena, signal dashboard, and an AI chatbot.
- Users can visit news.andx.ai for real-time market analysis.
- Only mention this if someone specifically asks about market data, news, or the intelligence dashboard.

HELPFUL LINKS TO DIRECT USERS:
- Sign up / Create account: platform.andx.one
- Login: platform.andx.one/login
- Download app: onelink.to/nfgq9a
- Tokenization info: andxus.io/tokenization
- Why ANDX: andxus.io/why-andx
- Market intelligence: news.andx.ai
- Contact support: support@andxus.io
- Help Center, System Status, API Access — available via andxus.io footer
- Legal: Privacy Policy, AML Policy, Terms and Conditions, Risk Disclosure — all on andxus.io

MEET THE TEAM (andxus.io/about-us):

Viru Raparthi — Founder and CEO
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
"""

# ── Market data from news site ──
NEWS_API = "https://news.andx.ai"

def fetch_market_context():
    """Fetch live market data from news.andx.ai APIs for market questions."""
    parts = []
    try:
        r = requests.get(f"{NEWS_API}/api/data", timeout=5)
        if r.status_code == 200:
            data = r.json()
            for asset in ["BTC", "ETH", "IBIT", "Gold", "S&P 500"]:
                d = data.get(asset, {})
                if d.get("current"):
                    parts.append(f"{asset}: ${d['current']:,.2f} (WoW: {d.get('wow_pct','?')}%, YTD: {d.get('ytd_pct','?')}%)")
    except Exception:
        pass
    try:
        r = requests.get(f"{NEWS_API}/api/context", timeout=5)
        if r.status_code == 200:
            ctx = r.json()
            if ctx.get("fear_greed_value"):
                parts.append(f"Fear & Greed: {ctx['fear_greed_value']}/100 ({ctx.get('fear_greed_label', '')})")
            if ctx.get("btc_dominance"):
                parts.append(f"BTC Dominance: {ctx['btc_dominance']}%")
    except Exception:
        pass
    return "\n".join(parts)

MARKET_KEYWORDS = ["btc", "bitcoin", "eth", "ethereum", "price", "market", "fear", "greed",
                   "bull", "bear", "trading", "crypto", "ibit", "gold", "s&p", "rally", "crash",
                   "dominance", "rsi", "macd", "signal", "sentiment", "buy", "sell"]

# ── Follow-up extraction ──
def _extract_follow_ups(answer):
    lines = answer.split("\n")
    follow_ups = []
    clean_lines = []
    for line in lines:
        stripped = line.strip()
        if stripped.startswith("FOLLOWUP:"):
            q = stripped[len("FOLLOWUP:"):].strip()
            if q:
                follow_ups.append(q)
        else:
            clean_lines.append(line)
    while clean_lines and not clean_lines[-1].strip():
        clean_lines.pop()
    return "\n".join(clean_lines), follow_ups[:3]


# ── Routes ──

@app.route("/")
def index():
    return send_from_directory(".", "preview.html")


@app.route("/andx-widget.js")
def widget_js():
    return send_from_directory(".", "andx-widget.js", mimetype="application/javascript")


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

    if not question:
        return jsonify({"error": "No question provided"}), 400

    # Build conversation history
    history_block = ""
    if history:
        history_lines = ["CONVERSATION HISTORY:"]
        for i, ex in enumerate(history[-4:], 1):
            history_lines.append(f"[User {i}]: {ex.get('q', '')}")
            history_lines.append(f"[ANDX {i}]: {ex.get('a', '')[:400]}")
        history_block = "\n".join(history_lines) + "\n\n"

    system_prompt = f"""You are ANDX Support — a friendly, knowledgeable AI assistant on the ANDX platform (andxus.io).

MISSION: Help users with anything about ANDX. Answer clearly and concisely by default. If the user asks for more detail or a simpler explanation, adjust your response accordingly. You represent the ANDX brand — be warm, professional, and helpful.

KNOWLEDGE BASE:{ANDX_KNOWLEDGE}

CRITICAL RULES:
1. NEVER use # headings or * asterisks. Use <strong> tags for emphasis like <strong>$0 commissions</strong>.
2. Answer concisely — under 200 words by default. Be thorough only when the question demands it.
3. If the user misspells words or asks vaguely, figure out what they mean and answer it. Never ask "what do you mean?"
4. Never fabricate information. For details not in the knowledge base, direct to support@andxus.io.
5. Always be positive about ANDX. You represent the brand.
6. When someone asks for a shorter or simpler answer, give it. When they ask for more detail, expand.
7. If the user says "take me to", "open", "go to", "navigate to", or "redirect to" a page — respond with ONLY the URL and nothing else. Example: if they say "take me to sign up" just respond "platform.andx.one". No explanation, no extra text. Just the URL.
8. CRITICAL URL RULE: The news/market intelligence site is news.andx.ai — NEVER say news.andxus.io. The main ANDX website is andxus.io. These are DIFFERENT domains. Always use the exact URLs from the DIRECTING USERS section below.

DIRECTING USERS TO PAGES — ALWAYS include the full URL when directing users. The URLs will automatically become clickable links in the chat. If the user says "take me there" or "open it" or "go to", include the URL and they will be auto-redirected.
- Sign up / create account: platform.andx.one
- Log in: platform.andx.one/login
- Tokenization details: andxus.io/tokenization
- Why ANDX / about: andxus.io/why-andx
- Download the app: onelink.to/nfgq9a
- Live market data, news, intelligence dashboard: news.andx.ai (NOT news.andxus.io — ALWAYS use news.andx.ai)
- What-If Simulator: news.andx.ai/simulator
- AI Trade Ideas: news.andx.ai/trade-ideas
- Battle Mode: news.andx.ai/battle
- Signal Dashboard: news.andx.ai/signals
- Contact support: support@andxus.io
- Meet the team: andxus.io/about-us

Do NOT automatically talk about market data or prices unless the user specifically asks. Focus on being a helpful support assistant.

FOLLOW-UPS: After your answer, add exactly 3 follow-ups. Each on its own line, prefixed with "FOLLOWUP: ".
STRICT FORMAT: Each MUST be a specific, direct question about a concrete ANDX topic — as if the user typed it themselves.
GOOD: "What are the trading fees?" / "How does BitGo custody work?" / "Tell me about Manila One" / "Who is the CEO?" / "How do I download the app?"
BAD: "What brings you to ANDX today?" / "Are you interested in trading?" / "Would you like to know more?" / "Need help with anything else?"
NEVER write open-ended, conversational, or greeting-style follow-ups. Every single follow-up must ask about a SPECIFIC feature, product, person, or topic."""

    # Fetch live market data if the question is market-related
    market_block = ""
    is_market_q = any(k in question.lower() for k in MARKET_KEYWORDS)
    if is_market_q:
        market_ctx = fetch_market_context()
        if market_ctx:
            market_block = f"LIVE MARKET DATA (from ANDX Intelligence):\n{market_ctx}\n\n"

    user_msg = f"{market_block}{history_block}USER QUESTION: {question}"

    try:
        client = anthropic.Anthropic(api_key=api_key)
        msg = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=800,
            system=system_prompt,
            messages=[{"role": "user", "content": user_msg}],
        )
        raw_answer = msg.content[0].text
        # Force correct URL — AI sometimes hallucinates news.andxus.io
        raw_answer = raw_answer.replace("news.andxus.io", "news.andx.ai")
        answer, follow_ups = _extract_follow_ups(raw_answer)
        return jsonify({
            "answer": answer,
            "follow_ups": follow_ups,
            "citations": [],
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ── Health check ──
@app.route("/health")
def health():
    return jsonify({"status": "ok", "service": "andx-customer-service-bot"})


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8081))
    print(f"ANDX Customer Service Bot running on port {port}")
    app.run(host="0.0.0.0", port=port, debug=False)
