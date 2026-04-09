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

# ── ANDX Knowledge Base ──
ANDX_KNOWLEDGE = """
ABOUT ANDX THE PLATFORM/COMPANY:
- ANDX Global is a licensed, regulated crypto exchange and digital finance platform serving 2,000,000+ users globally with 79,900 daily active traders and 99% uptime during peak volatility.
- CEO and Founder: Viru Raparthi — built the team combining bankers, risk managers, and compliance experts.
- COO and Co-Founder: Opender Singh, CFA — Wall Street veteran who left traditional finance to build AI-native Web3 markets.
- Mission: Unify multi-asset trading, tokenization, secure cross-border payments, real-time financial intelligence, and a gamified participation layer into one next-generation digital finance ecosystem.
- Tagline: "Crypto Markets. Real-World Assets. One Platform."
- Website: andxus.io
- AI Portal: andx.ai — adaptive intelligence systems powering smarter decisions in crypto and beyond. Features XORE AI assistant (launching soon).
- Global presence: ANDX operates in the United States (all 50 states), Brazil, Philippines, Turkey, and Dominican Republic with planned further expansion.
- Contact / Support: support@andxus.io
- App download (Android): Google Play — search "AndX Global Trading App" or use onelink.to/nfgq9a
- App download (iOS): Apple App Store — search "AndX Global Trading App"
- Trading platform login: platform.andx.one

TRADING FEATURES (andxus.io main page):
- Zero commission trading — $0 execution fees with transparent pricing and AI-driven risk modeling. Market spreads, blockchain network fees, and intermediary bank fees may still apply separately.
- Available in ALL 50 US states.
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
- KYC/AML compliance with encrypted data handling per global standards.
- Federal bank oversight via BitGo OCC Charter.

WHY CHOOSE ANDX OVER COMPETITORS:
- $0 commissions (most exchanges charge 0.1-0.5% per trade)
- All 50 states (many exchanges block certain states)
- BitGo custody with $250M insurance (most use less secure solutions)
- 1:1 reserves (no fractional reserve risk)
- Free ACH/wire (many charge $5-25 per transfer)
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
  - Novelty Tokens (NVT): Collectible and unique digital assets similar to RealAsset Tokens.
- Tokenization is SEC/BSP-aligned with audited smart contracts and encrypted identity management.
- Secondary liquidity available via ATS/exchanges or structured buybacks where permitted.

MANILA ONE PROJECT (featured on tokenization page):
- Also known as "Rizal de Manila" — a $100M land development project in Manila, Philippines.
- Token type: RealAsset Token (ART) — represents land, buildings, and infrastructure with capital appreciation + income potential.
- Target returns: 24% Preferred Return with 100% Target Return. These are expected investor return profiles, subject to change, and not a guaranteed offer or solicitation.
- Featured as ANDX's flagship real-world asset offering.
- Users can view full asset details and invest through the ANDX trading dashboard at platform.andx.one.
- In simple terms: Manila One lets you invest in a real $100M land development in the Philippines through a digital token. Instead of needing millions to buy property, you can participate with a smaller amount and potentially earn returns as the project develops. The token represents actual ownership in the underlying real estate asset.

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

ANDX AI PORTAL (andx.ai):
- andx.ai is the AI intelligence hub — "adaptive intelligence for crypto and beyond."
- XORE: AI assistant (coming soon) — conversational guidance to help users get started with ANDX.
- Tokenization portal: tokenization.andx.ai — dedicated portal for real-world asset tokenization.

ANDX ECOSYSTEM PRODUCTS:
- Exchange and Trading (andxus.io) — spot crypto trading, tokenized securities, real-world assets.
- Tokenization (tokenization.andx.ai) — converting real-world assets into blockchain tokens for fractional ownership and global liquidity.
- Payments — cryptocurrency-based payment solutions, including EV charging station integration.
- Cross-Border Transfers — frictionless on-chain remittances using the USDA1 stablecoin. Fast, low-cost international transfers.
- Gamification — engagement tools including contests, leaderboards, badges, and referral rewards to keep users active and learning.

DEPOSITS AND WITHDRAWALS:
- ACH deposits: free, no fees, credited upon settlement.
- Wire transfers: available same-day for rapid liquidity needs.
- Direct bank redemption on demand — withdraw to your linked bank account anytime.
- Self-custodial withdrawals supported — send crypto to your own wallet.
- No artificial withdrawal delays or hidden holds.

SUPPORTED ASSETS AND MARKETS:
- Crypto spot trading — from blue-chip coins to challenger alts. "If it has liquidity, it's accessible."
- Tokenized real-world assets (real estate, land, infrastructure).
- Global alternatives and institutional-grade real estate opportunities.

BETA FEATURES (AI Alpha — waitlist on andxus.io):
- Portfolio stress-testing tools — test how your portfolio would handle past market crashes.
- Real-time volatility-based alerts — get notified when market conditions change.
- Automated stop-loss recommendations based on actual volatility.
- Market analysis dashboards with plain-English insights.

PLATFORM INFRASTRUCTURE:
- Built on a globally-proven exchange engine — infrastructure is proven, not experimental.
- Founded to replace "casino-style exchanges" with professional trading infrastructure from traditional finance.
- Company tagline: "We Built the Infrastructure, You Fly the Plane."
- Federal Bank Oversight via BitGo OCC Charter.

GLOBAL PRESENCE:
- Over 2 million users globally.
- Available in all 50 US states.
- Operating in the United States, Brazil, Philippines, Turkey, and Dominican Republic with planned expansion.

RESOURCES AVAILABLE ON THE PLATFORM:
- Help Center: accessible from andxus.io footer.
- API Access: available for developers building on ANDX.
- System Status: live monitoring page for platform uptime.
- Contact support: support@andxus.io

ANDX MARKET INTELLIGENCE (news.andx.ai — separate product):
- A free market intelligence terminal with live crypto data, AI newsletters, trade ideas, asset battle arena, signal dashboard, and an AI chatbot.
- Users can visit news.andx.ai for real-time market analysis.
- Only mention this if someone specifically asks about market data, news, or the intelligence dashboard.

HELPFUL LINKS TO DIRECT USERS:
- Sign up / Create account: platform.andx.one
- Login: platform.andx.one/login
- Download app (Android): onelink.to/nfgq9a
- Download app (iOS): Search "AndX Global Trading App" on the Apple App Store
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


@app.route("/mobile")
def mobile():
    return send_from_directory(".", "mobile.html")


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
        for i, ex in enumerate(history[-8:], 1):
            history_lines.append(f"[User {i}]: {ex.get('q', '')}")
            history_lines.append(f"[ANDX {i}]: {ex.get('a', '')[:400]}")
        history_block = "\n".join(history_lines) + "\n\n"

    system_prompt = f"""You are ANDX Support — a friendly, knowledgeable AI assistant on the ANDX platform (andxus.io).

PRIMARY MISSION: Help users with ANDX platform questions — trading, fees, security, tokenization, team, sign up, app download, and anything about the company.
SECONDARY MISSION: If someone asks about market data, crypto prices, news, technical analysis, or signals — you CAN answer using the live data provided. But NEVER bring up market data yourself unless the user specifically asks about it.

KNOWLEDGE BASE:{ANDX_KNOWLEDGE}

CONVERSATION AWARENESS (CRITICAL):
- You have conversation history below. USE IT. If a user says "tell me more" or "what about that" or "how?" — look at what was just discussed and continue naturally.
- Never ask the user to repeat themselves. If they reference something from earlier in the chat, you should know what they mean.
- If a user sends a short follow-up like "and the fees?" after asking about trading, you should understand they mean trading fees.
- Respond like a real person having a conversation, not a search engine giving isolated answers.

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
4. STRICT RULE — NEVER FABRICATE OR GUESS: Before answering ANY question, check if the answer exists in your knowledge base or the live data provided. If the information is NOT explicitly in your knowledge base, DO NOT make up an answer. Instead say something like: "I don't have the specific details on that right now. For the most accurate and up-to-date information, I'd recommend reaching out to our team at support@andxus.io — they'll be able to help." This applies even if you think you know the answer — if it's not in the knowledge base, don't say it. This is critical for legal compliance.
5. Always be positive about ANDX. You represent the brand.
6. When someone asks for a shorter or simpler answer, give it. When they ask for more detail, expand.
7. If the user says "take me to", "open", "go to", "navigate to", or "redirect to" a page — respond with ONLY the URL and nothing else.
8. CRITICAL URL RULE: The news/market intelligence site is news.andx.ai — NEVER say news.andxus.io. The main ANDX website is andxus.io. These are DIFFERENT domains.
9. If someone says "hi", "hello", "hey" — respond warmly and briefly, then ask how you can help with ANDX. Don't give a long introduction.
10. If someone asks the same question again, don't repeat yourself word for word. Give a fresh, shorter version.
11. TECHNICAL/FINANCIAL ANALYSIS REDIRECT: If a user asks a deeply technical or analytical financial question — things like "should I buy BTC now?", "what's the RSI on ETH?", "is this a good entry point?", "what's the price target?", "give me a chart analysis", "what indicators show?", "is this bullish or bearish?", trading strategy advice, portfolio recommendations, or any kind of investment advice — DO NOT answer the question yourself. Instead respond ONLY with: "For technical questions and financial advice, please visit our AI analytics engine at analytics.andx.ai" and nothing else. Do not include follow-ups for these responses. The widget will automatically render a button.

DIRECTING USERS TO PAGES:
- Sign up: platform.andx.one
- Log in: platform.andx.one/login
- Tokenization: andxus.io/tokenization
- Why ANDX: andxus.io/why-andx
- Download app (Android): onelink.to/nfgq9a
- Download app (iOS): Search "AndX Global Trading App" on the Apple App Store
- Market dashboard: news.andx.ai (NEVER news.andxus.io)
- AI Analytics Engine (technical/financial analysis): analytics.andx.ai
- Simulator: news.andx.ai/simulator
- Trade Ideas: news.andx.ai/trade-ideas
- Battle Mode: news.andx.ai/battle
- Signals: news.andx.ai/signals
- Support: support@andxus.io
- Team: andxus.io/about-us

FOLLOW-UPS: After your answer, add exactly 3 follow-ups. Each on its own line, prefixed with "FOLLOWUP: ".
Each MUST be a short question the USER would ask — something they can tap to learn more.
Make follow-ups RELEVANT to what was just discussed, not generic.
GOOD: "What are the trading fees?", "How does BitGo custody work?", "How do I download the app?"
BAD: "What devices do you want?", "Would you like to know more?", "What brings you here?"
The follow-ups are buttons the user taps — they must read like questions a customer would ask."""

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
