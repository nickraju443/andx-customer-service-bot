/**
 * ANDX Support Chat Widget v3.0 — Complete Rewrite
 * Drop-in embeddable customer service bot for andxus.io
 * Usage: <script src="https://YOUR-BOT-URL/andx-widget.js"></script>
 */
(function () {
  'use strict';

  if (window.__andxWidgetLoaded) return;
  window.__andxWidgetLoaded = true;

  /* ── Config ─────────────────────────────────────────── */
  var API_BASE = window.ANDX_BOT_URL || 'https://andx-bot-245374915379.us-central1.run.app';
  var isOpen = false;
  var isMinimized = false;
  var isStreaming = false;
  var fabSuppressClick = false; // set after a bubble drag so the trailing click doesn't toggle
  var pendingAskController = null; // AbortController for the in-flight /api/ask
  var chatMode = 'beginner';
  var chatHistory = [];
  // Restore prior chat history so a page refresh mid-conversation doesn't wipe it
  try {
    var savedHistory = sessionStorage.getItem('andxChatHistory');
    if (savedHistory) {
      var parsedHistory = JSON.parse(savedHistory);
      if (Array.isArray(parsedHistory)) chatHistory = parsedHistory.slice(-50);
    }
  } catch (e) {}
  function saveChatHistory() {
    try {
      sessionStorage.setItem('andxChatHistory', JSON.stringify(chatHistory.slice(-50)));
    } catch (e) {}
  }
  function newMessageId() {
    try {
      if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    } catch (e) {}
    return 'm-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }
  // Active reply-to context (set by long-press → Reply, cleared on send/cancel)
  var pendingReplyTo = null;
  var sessionId = 'widget-' + Math.random().toString(36).substr(2, 9);
  var particleRAF = null;
  var particles = [];
  var userInteracted = false;

  /* Live-agent session */
  var liveAgent = {
    active: false,
    ticketId: '',
    ticketToken: '',
    sinceTs: 0,
    pollTimer: null,
    queueTimer: null,
    queueCardEl: null,
    agentName: 'Live Agent',
    email: '',
    name: '',
    agentResponded: false
  };
  /* Try to restore previous session so page refresh doesn't kick the user out.
     Drop sessions that haven't seen activity in >2h — they're almost certainly
     abandoned and would otherwise wedge the pill into a no-op state. */
  try {
    var saved = sessionStorage.getItem('andxLiveAgent');
    if (saved) {
      var parsed = JSON.parse(saved);
      var savedAt = parsed && parsed.savedAt ? parsed.savedAt : (parsed && parsed.sinceTs ? parsed.sinceTs * 1000 : 0);
      var staleMs = Date.now() - savedAt;
      // 30 min: long enough to survive a refresh + bathroom break, short
      // enough that an abandoned ticket doesn't wedge the next session.
      var isStale = !savedAt || staleMs > (30 * 60 * 1000);
      if (parsed && parsed.ticketId && parsed.ticketToken && !isStale) {
        liveAgent.active = true;
        liveAgent.ticketId = parsed.ticketId;
        liveAgent.ticketToken = parsed.ticketToken;
        liveAgent.sinceTs = parsed.sinceTs || 0;
        liveAgent.agentName = parsed.agentName || 'Live Agent';
        liveAgent.email = parsed.email || '';
        liveAgent.name = parsed.name || '';
      } else if (isStale) {
        sessionStorage.removeItem('andxLiveAgent');
      }
    }
  } catch (e) {}
  function saveLiveAgent() {
    try {
      if (liveAgent.active) {
        sessionStorage.setItem('andxLiveAgent', JSON.stringify({
          ticketId: liveAgent.ticketId,
          ticketToken: liveAgent.ticketToken,
          sinceTs: liveAgent.sinceTs,
          agentName: liveAgent.agentName,
          email: liveAgent.email,
          name: liveAgent.name,
          savedAt: Date.now()
        }));
      } else {
        sessionStorage.removeItem('andxLiveAgent');
      }
    } catch (e) {}
  }

  /* drag state */
  var dragState = {
    active: false,
    startX: 0, startY: 0,
    panelX: 0, panelY: 0,
    offsetX: 0, offsetY: 0,
    moved: false
  };

  /* ── SVG Icons ──────────────────────────────────────── */
  // XORE sphere PNG (high-res, native 1645x1593) as the FAB background, with
  // "Ask AI" text overlaid via crisp CSS so it stays sharp at any DPI.
  var CHAT_ICON = [
    // srcset with higher densities tells the browser to render at native res
    '<img class="andx-fab-img" src="' + API_BASE + '/xore.png"',
    '     srcset="' + API_BASE + '/xore.png 1x, ' + API_BASE + '/xore.png 2x, ' + API_BASE + '/xore.png 3x"',
    '     alt="" draggable="false" decoding="sync">',
    '<span class="andx-fab-label">Ask AI</span>'
  ].join(' ');
  var CLOSE_ICON = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.6" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';

  /* ── CSS ─────────────────────────────────────────────── */
  var css = document.createElement('style');
  css.textContent = `
/* Animations */
@keyframes andxBreath{0%,100%{box-shadow:0 4px 20px rgba(114,77,251,.3),0 0 30px rgba(114,77,251,.15)}50%{box-shadow:0 4px 28px rgba(114,77,251,.5),0 0 50px rgba(114,77,251,.25)}}
@keyframes andxPulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.5);opacity:.6}}
@keyframes andxBubbleGlow{0%,100%{box-shadow:0 0 6px rgba(114,77,251,.05)}50%{box-shadow:0 0 14px rgba(114,77,251,.15)}}
@keyframes andxBlink{0%,50%{opacity:1}51%,100%{opacity:0}}
@keyframes andxBounce{0%,80%,100%{transform:translateY(0)}40%{transform:translateY(-6px)}}
@keyframes andxMsgIn{0%{opacity:0;transform:translateY(16px)}60%{transform:translateY(-3px)}100%{opacity:1;transform:translateY(0)}}
@keyframes andxPanelIn{0%{opacity:0;transform:scale(.92) translateY(12px)}100%{opacity:1;transform:scale(1) translateY(0)}}
@keyframes andxPanelOut{0%{opacity:1;transform:scale(1) translateY(0)}100%{opacity:0;transform:scale(.92) translateY(12px)}}
@keyframes andxTooltipIn{0%{opacity:0;transform:translateY(6px)}100%{opacity:1;transform:translateY(0)}}
@keyframes andxHeaderDot{0%{transform:translate(0,0)}50%{transform:translate(var(--dx),var(--dy))}100%{transform:translate(0,0)}}
@keyframes andxGradBorder{0%{background-position:0% 50%}50%{background-position:100% 50%}100%{background-position:0% 50%}}

/* FAB */
/* FAB: XORE sphere PNG fills the entire button, "Ask AI" text overlays it. */
#andx-fab{position:fixed;bottom:24px;right:24px;width:68px;height:68px;border-radius:50%;background:#0a0a1a;border:none;cursor:pointer;z-index:10000;display:flex;align-items:center;justify-content:center;animation:andxBreath 3s ease-in-out infinite;transition:transform .2s ease;box-shadow:0 6px 24px rgba(114,77,251,.5),0 0 0 1px rgba(255,255,255,.06);overflow:hidden;padding:0;-webkit-tap-highlight-color:transparent;touch-action:none;user-select:none;-webkit-user-select:none}
#andx-fab:hover{transform:scale(1.07)}
#andx-fab.andx-fab-dragging,#andx-fab.andx-fab-dragging:hover{animation:none;transition:none;cursor:grabbing;transform:scale(1.04);box-shadow:0 10px 32px rgba(114,77,251,.6),0 0 0 1px rgba(255,255,255,.1)}
#andx-fab svg{pointer-events:none}
#andx-fab .andx-fab-img{position:absolute;top:0;left:0;width:100%;height:100%;display:block;border-radius:50%;object-fit:cover;user-select:none;-webkit-user-drag:none;pointer-events:none;-webkit-backface-visibility:hidden;backface-visibility:hidden;transform:translateZ(0);will-change:transform}
@supports (image-rendering:high-quality){#andx-fab .andx-fab-img{image-rendering:high-quality}}
#andx-fab .andx-fab-label{position:relative;z-index:2;color:#fff;font-weight:800;font-size:13px;letter-spacing:.6px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;text-shadow:0 1px 4px rgba(8,4,28,.85),0 0 12px rgba(114,77,251,.55);pointer-events:none;line-height:1;user-select:none;white-space:nowrap;transition:opacity .2s ease}
/* Open state: keep the sphere visible (consistent look), dim the label, show close X */
#andx-fab.andx-open-state .andx-fab-label{opacity:0}
#andx-fab.andx-open-state .andx-fab-img{filter:brightness(0.55) saturate(1.1)}
#andx-fab.andx-open-state svg{position:relative;z-index:3;filter:drop-shadow(0 2px 6px rgba(0,0,0,.6))}
#andx-fab .andx-fab-close{position:absolute;inset:0;z-index:3;display:flex;align-items:center;justify-content:center;pointer-events:none;animation:andxMsgIn .2s ease}

/* Tooltip */
#andx-tooltip{position:fixed;bottom:88px;right:24px;background:#1a1430;color:#fff;font-size:13px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;padding:10px 16px;border-radius:10px;border:1px solid rgba(114,77,251,.25);box-shadow:0 4px 20px rgba(0,0,0,.4);z-index:10001;cursor:pointer;animation:andxTooltipIn .3s ease;white-space:nowrap}
#andx-tooltip.andx-tt-left::after{left:22px;right:auto}
#andx-tooltip.andx-tt-below::after{top:-7px;bottom:auto;border-right:none;border-bottom:none;border-left:1px solid rgba(114,77,251,.25);border-top:1px solid rgba(114,77,251,.25)}
#andx-tooltip::after{content:'';position:absolute;bottom:-7px;right:22px;width:12px;height:12px;background:#1a1430;border-right:1px solid rgba(114,77,251,.25);border-bottom:1px solid rgba(114,77,251,.25);transform:rotate(45deg)}

/* Panel */
#andx-panel{position:fixed;bottom:92px;right:24px;width:420px;height:620px;min-width:320px;min-height:350px;max-width:600px;max-height:82vh;background:#08061a;border:1px solid rgba(114,77,251,.3);border-radius:18px;z-index:10000;display:none;flex-direction:column;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;resize:both}
#andx-panel.andx-open{display:flex;animation:andxPanelIn .28s ease forwards}
#andx-panel.andx-closing{animation:andxPanelOut .2s ease forwards}
#andx-panel::before{content:'';position:absolute;inset:-1px;border-radius:17px;padding:1px;background:linear-gradient(var(--andx-ba,0deg),#724dfb,#1de4d3,#724dfb);background-size:300% 300%;animation:andxGradBorder 4s ease infinite;-webkit-mask:linear-gradient(#fff 0 0) content-box,linear-gradient(#fff 0 0);-webkit-mask-composite:xor;mask-composite:exclude;pointer-events:none;z-index:0}

/* Particle canvas */
#andx-particles{display:none}

/* Header */
#andx-header{position:relative;z-index:1;display:flex;align-items:center;gap:12px;padding:16px 16px;background:linear-gradient(135deg,rgba(114,77,251,.18),rgba(29,228,211,.05));border-bottom:2px solid;border-image:linear-gradient(90deg,#724dfb,#1de4d3) 1;cursor:grab;user-select:none;-webkit-user-select:none;touch-action:none;flex-shrink:0;overflow:hidden}
#andx-header.andx-grabbing{cursor:grabbing}
.andx-hdr-dots{position:absolute;width:4px;height:4px;border-radius:50%;background:rgba(114,77,251,.35);pointer-events:none}
.andx-avatar{width:42px;height:42px;border-radius:50%;background:linear-gradient(135deg,#724dfb,#1de4d3);display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:#fff;flex-shrink:0;box-shadow:0 0 20px rgba(114,77,251,.4),0 0 40px rgba(29,228,211,.15)}
.andx-avatar-sm{width:24px;height:24px;font-size:9px;flex-shrink:0}
.andx-hdr-info{flex:1;min-width:0}
.andx-hdr-title{font-size:16px;font-weight:700;color:#fff;line-height:1.2}
.andx-hdr-sub{font-size:11px;color:rgba(255,255,255,.5);line-height:1.3;display:flex;align-items:center;gap:6px}
.andx-online{color:#22c55e;font-size:10px;font-weight:600}
.andx-status{width:7px;height:7px;border-radius:50%;background:#22c55e;animation:andxPulse 2s ease infinite;flex-shrink:0;display:inline-block}
.andx-hdr-btns{display:flex;gap:12px;flex-shrink:0;align-items:center}
.andx-hdr-btn{cursor:pointer;transition:all .15s;font-family:inherit}
/* Clear: outlined text button in accent color */
.andx-hdr-btn[data-action="clear"]{background:transparent;border:1px solid rgba(114,77,251,.55);color:#b08aff;font-size:13px;font-weight:600;padding:8px 16px;border-radius:8px;min-width:68px;min-height:36px;letter-spacing:.2px}
.andx-hdr-btn[data-action="clear"]:hover{background:rgba(114,77,251,.10);border-color:#b08aff;color:#fff}
/* Close: icon-only circle, subtle fill, visually distinct */
.andx-hdr-btn[data-action="close"]{background:rgba(255,255,255,.06);border:none;color:rgba(255,255,255,.75);font-size:16px;font-weight:600;width:36px;height:36px;border-radius:50%;padding:0;display:flex;align-items:center;justify-content:center}
.andx-hdr-btn[data-action="close"]:hover{background:rgba(255,255,255,.12);color:#fff}
.andx-hdr-btn:hover{background:rgba(255,255,255,.12);color:#fff;border-color:rgba(255,255,255,.25)}

/* Thread */
#andx-thread{position:relative;z-index:1;flex:1;overflow-y:auto;padding:16px 14px;display:flex;flex-direction:column;gap:12px;scroll-behavior:smooth}
#andx-thread::-webkit-scrollbar{width:4px}
#andx-thread::-webkit-scrollbar-track{background:transparent}
#andx-thread::-webkit-scrollbar-thumb{background:rgba(114,77,251,.3);border-radius:4px}

/* Welcome */
.andx-welcome{text-align:center;padding:20px;display:flex;flex-direction:column;justify-content:center;align-items:center;height:100%}
.andx-welcome-text{margin-top:auto;padding-top:40px}
.andx-welcome h3{font-size:24px;font-weight:800;margin:0 0 10px;color:#724dfb}
.andx-welcome p{color:rgba(255,255,255,.5);font-size:13px;margin:0;line-height:1.5}
.andx-chips{display:flex;gap:8px;padding:0 12px;margin-top:auto;margin-bottom:8px;width:100%;flex-wrap:nowrap}
.andx-chip{background:rgba(114,77,251,.1);border:1px solid rgba(114,77,251,.3);color:rgba(200,180,255,.9);font-size:11px;padding:10px 8px;border-radius:10px;cursor:pointer;transition:all .2s;font-family:inherit;text-align:center;display:flex;align-items:center;justify-content:center;line-height:1.3;flex:1;min-width:0}
.andx-chip:hover{transform:translateY(-2px);box-shadow:0 4px 14px rgba(114,77,251,.25);background:rgba(114,77,251,.2);border-color:rgba(114,77,251,.5)}
.andx-chip[data-locked="1"]{opacity:.4;pointer-events:none;transform:none}

/* Scroll-to-latest floating button */
#andx-scroll-latest{position:absolute;right:14px;bottom:88px;z-index:5;background:linear-gradient(135deg,#724dfb,#9d7dff);color:#fff;border:none;border-radius:18px;padding:6px 12px 6px 10px;font-size:11px;font-weight:600;font-family:inherit;cursor:pointer;display:none;align-items:center;gap:5px;box-shadow:0 4px 14px rgba(114,77,251,.4);animation:andxMsgIn .25s ease}
#andx-scroll-latest.visible{display:inline-flex}
#andx-scroll-latest svg{width:12px;height:12px;stroke:#fff;stroke-width:2.5;fill:none;stroke-linecap:round;stroke-linejoin:round}
#andx-scroll-latest .andx-sl-count{background:#fff;color:#724dfb;border-radius:10px;font-size:10px;padding:1px 6px;font-weight:700;margin-left:2px}

/* Bubble timestamp */
.andx-ts{font-size:9.5px;color:rgba(255,255,255,.32);margin-top:3px;letter-spacing:.2px;padding:0 4px}
.andx-msg-user .andx-ts{text-align:right}

/* Retry button on error bubbles */
.andx-retry-btn{display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:600;color:#724dfb;background:rgba(114,77,251,.08);border:1px solid rgba(114,77,251,.3);padding:5px 11px;border-radius:14px;cursor:pointer;font-family:inherit;margin-top:8px;transition:all .15s}
.andx-retry-btn:hover{background:rgba(114,77,251,.18);border-color:rgba(114,77,251,.55);transform:translateY(-1px)}
.andx-retry-btn svg{width:11px;height:11px;stroke:#724dfb;stroke-width:2.2;fill:none;stroke-linecap:round;stroke-linejoin:round}

/* Reaction pill on bubbles */
.andx-reaction-pill{display:inline-flex;align-items:center;gap:2px;font-size:13px;background:rgba(20,12,40,.7);border:1px solid rgba(114,77,251,.35);border-radius:12px;padding:2px 7px;margin-top:-4px;line-height:1;align-self:flex-end;animation:andxMsgIn .25s ease;cursor:default;user-select:none}
.andx-msg-user .andx-reaction-pill{align-self:flex-end}

/* Reaction palette popover */
.andx-react-palette{position:fixed;z-index:10005;display:flex;gap:4px;padding:6px 8px;background:#1a1430;border:1px solid rgba(114,77,251,.45);border-radius:22px;box-shadow:0 8px 26px rgba(0,0,0,.55);animation:andxMsgIn .15s ease;font-family:inherit}
.andx-react-emoji{font-size:22px;line-height:1;padding:4px 6px;border-radius:50%;cursor:pointer;transition:transform .12s ease,background .12s}
.andx-react-emoji:hover,.andx-react-emoji:active{transform:scale(1.25);background:rgba(114,77,251,.18)}
.andx-react-divider{width:1px;background:rgba(114,77,251,.25);margin:4px 4px}
.andx-react-action{font-size:12px;color:#cfc3ff;background:transparent;border:none;font-family:inherit;cursor:pointer;padding:0 8px;border-radius:14px;display:flex;align-items:center;gap:4px}
.andx-react-action:hover{background:rgba(114,77,251,.18);color:#fff}

/* Reply-to pill above input */
.andx-reply-pill{display:flex;align-items:flex-start;gap:8px;padding:8px 10px;margin:0 14px 6px 14px;background:rgba(114,77,251,.12);border-left:3px solid #724dfb;border-radius:6px 8px 8px 6px;font-size:12px;color:#cfc3ff;animation:andxMsgIn .18s ease}
.andx-reply-pill-body{flex:1;min-width:0}
.andx-reply-pill-label{font-size:10px;font-weight:700;color:#9b8aff;letter-spacing:.4px;text-transform:uppercase;margin-bottom:2px}
.andx-reply-pill-text{font-size:12px;color:#e9e6ff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.andx-reply-pill-x{background:transparent;border:none;color:#9b8aff;cursor:pointer;font-size:16px;padding:0 4px;line-height:1;font-family:inherit}
.andx-reply-pill-x:hover{color:#fff}

/* Reply quote inside bot/agent bubble (rendered from "> ..." lines) */
.andx-quote-block{border-left:2px solid #1de4d3;padding:4px 0 4px 10px;margin:0 0 8px 0;color:rgba(255,255,255,.6);font-size:13px;font-style:italic;line-height:1.4}

/* Live-with-agent status pill at top of thread */
.andx-live-pill{display:flex;align-items:center;justify-content:center;gap:8px;margin:0 14px 10px;padding:8px 14px;background:linear-gradient(135deg,rgba(29,228,211,.16),rgba(29,228,211,.05));border:1px solid rgba(29,228,211,.4);border-radius:22px;font-size:12px;font-weight:600;color:#bff5ec;letter-spacing:.2px;animation:andxMsgIn .25s ease}
.andx-live-pill-dot{width:8px;height:8px;border-radius:50%;background:#1de4d3;box-shadow:0 0 8px #1de4d3;animation:andxPulse 1.4s ease-in-out infinite}

/* Queue card ETA chip */
.andx-queue-eta{display:inline-flex;align-items:center;gap:4px;font-size:11px;color:#bff5ec;background:rgba(29,228,211,.10);border:1px solid rgba(29,228,211,.35);padding:3px 8px;border-radius:11px;margin-top:4px}

/* Email-gate mini-card before instant connect */
.andx-email-gate{margin:10px 14px 0;padding:14px;border-radius:12px;background:linear-gradient(135deg,rgba(114,77,251,.10),rgba(29,228,211,.04));border:1px solid rgba(114,77,251,.28);box-sizing:border-box;animation:andxMsgIn .2s ease}
.andx-email-gate-title{font-size:13px;font-weight:700;color:#e9e6ff;margin:0 0 4px}
.andx-email-gate-sub{font-size:11.5px;color:#b6a8ff;margin:0 0 10px;line-height:1.4}
.andx-email-gate input{width:100%;padding:10px 12px;border-radius:9px;background:rgba(20,12,40,.6);border:1px solid rgba(114,77,251,.3);color:#fff;font-size:14px;font-family:inherit;outline:none;box-sizing:border-box;margin-bottom:8px}
.andx-email-gate input:focus{border-color:#724dfb;box-shadow:0 0 0 2px rgba(114,77,251,.2)}
.andx-email-gate button{width:100%;padding:11px;border-radius:9px;background:linear-gradient(135deg,#724dfb,#5a3dd9);color:#fff;font-weight:700;font-size:14px;border:none;cursor:pointer;font-family:inherit;transition:all .2s}
.andx-email-gate button:hover{transform:translateY(-1px);box-shadow:0 6px 18px rgba(114,77,251,.45)}
.andx-email-gate-err{font-size:11px;color:#ff8e8e;margin:4px 0;display:none}

/* Agent typing indicator (live mode) */
.andx-agent-typing{display:flex;gap:8px;align-items:flex-end;margin-top:6px;animation:andxMsgIn .25s ease}
.andx-agent-typing .andx-bubble-agent{padding:10px 14px!important;display:inline-flex;gap:4px;align-items:center}
.andx-agent-typing .andx-bubble-agent span{width:6px;height:6px;border-radius:50%;background:#1de4d3;animation:andxBounce 1.2s infinite}
.andx-agent-typing .andx-bubble-agent span:nth-child(2){animation-delay:.15s}
.andx-agent-typing .andx-bubble-agent span:nth-child(3){animation-delay:.3s}

/* Message rows */
.andx-msg{display:flex;gap:8px;animation:andxMsgIn .35s ease;max-width:100%}
.andx-msg-user{flex-direction:row-reverse}
.andx-msg-ai{flex-direction:row;align-items:flex-start}

/* Sender label */
.andx-sender{font-size:10px;color:rgba(255,255,255,.4);margin-bottom:3px;display:flex;align-items:center;gap:5px}
.andx-sender::before{content:'';width:6px;height:6px;border-radius:50%;background:#22c55e;display:inline-block}

/* Bubbles — adaptive sizing so short messages stay tight, long ones wrap naturally */
.andx-bubble{padding:9px 14px;font-size:14px;line-height:1.45;word-break:break-word;width:fit-content;max-width:100%;box-sizing:border-box;display:block}
.andx-bubble-user{
  background:linear-gradient(135deg,#7d56ff,#9d7dff);
  color:#fff;
  border-radius:18px 18px 5px 18px;
  box-shadow:0 2px 10px rgba(114,77,251,.32),inset 0 1px 0 rgba(255,255,255,.14);
  padding:9px 14px;
  font-weight:500;
}
.andx-bubble-ai{
  background:linear-gradient(135deg,rgba(114,77,251,.10),rgba(20,16,40,.85));
  color:rgba(255,255,255,.94);
  border-radius:5px 18px 18px 18px;
  border:1px solid rgba(114,77,251,.18);
  box-shadow:0 1px 6px rgba(0,0,0,.2);
}
.andx-bubble-ai strong{color:#1de4d3}
.andx-bubble-user strong{color:#fff}
.andx-bubble-ai a{color:#1de4d3;text-decoration:underline}
.andx-bubble-ai a:hover{color:#5ef0e3}

/* AI content column — inline-flex so the column itself shrinks to its widest child */
.andx-ai-col{display:inline-flex;flex-direction:column;align-items:flex-start;max-width:80%;min-width:0}

/* User column: wraps the bubble + timestamp tightly, right-aligns inside */
.andx-user-col{display:inline-flex;flex-direction:column;align-items:flex-end;max-width:78%;min-width:0}

/* Typing */
.andx-typing{display:flex;gap:5px;padding:10px 16px;align-items:center}
.andx-typing span{width:7px;height:7px;border-radius:50%;background:#724dfb;animation:andxBounce 1.2s ease infinite}
.andx-typing span:nth-child(2){animation-delay:.15s}
.andx-typing span:nth-child(3){animation-delay:.3s}

/* Cursor */
.andx-cursor{display:inline;animation:andxBlink 1s step-end infinite;color:#1de4d3;font-weight:300}

/* Follow-ups */
.andx-followups{display:flex;flex-wrap:wrap;gap:6px;margin-top:4px;padding-left:32px}
.andx-fu{background:transparent;border:1px solid rgba(114,77,251,.3);color:rgba(200,180,255,.8);font-size:11px;padding:5px 12px;border-radius:16px;cursor:pointer;transition:all .2s;font-family:inherit}
.andx-fu:hover{transform:translateY(-1px);box-shadow:0 3px 10px rgba(114,77,251,.2);border-color:rgba(114,77,251,.5);color:#fff}

/* Input bar */
#andx-input-bar{position:relative;z-index:1;display:flex;gap:10px;padding:12px 14px;margin:0 12px 12px;border-radius:14px;background:rgba(114,77,251,.06);border:1px solid rgba(114,77,251,.2);flex-shrink:0;transition:box-shadow .2s}
#andx-input-bar:focus-within{box-shadow:0 0 0 2px rgba(114,77,251,.2),0 0 20px rgba(114,77,251,.08)}
#andx-input{flex:1;background:transparent;border:none;color:#fff;font-size:14px;padding:6px 4px;outline:none;font-family:inherit}
#andx-input::placeholder{color:rgba(255,255,255,.3)}
#andx-send{background:transparent;border:2px solid rgba(114,77,251,.45);color:#724dfb;width:42px;height:42px;border-radius:50%;cursor:pointer;transition:all .2s;display:flex;align-items:center;justify-content:center;flex-shrink:0;padding:0}
#andx-send.andx-send-ready{background:linear-gradient(135deg,#724dfb,#9d7dff);border-color:transparent;box-shadow:0 4px 16px rgba(114,77,251,.4)}
#andx-send.andx-send-ready svg{stroke:#fff}
#andx-send:hover{background:rgba(114,77,251,.15)}
#andx-send.andx-send-ready:hover{transform:translateY(-1px);box-shadow:0 6px 20px rgba(114,77,251,.5)}
#andx-send svg{stroke:#724dfb;transition:stroke .15s}
#andx-send:disabled{opacity:.4;cursor:default}

/* Minimized */
#andx-panel.andx-minimized #andx-thread,
#andx-panel.andx-minimized #andx-input-bar,
#andx-panel.andx-minimized #andx-particles{display:none}
#andx-panel.andx-minimized{height:auto!important;min-height:auto;resize:none}

/* FAB badge */
.andx-fab-badge{position:absolute;top:-2px;left:-2px;width:18px;height:18px;border-radius:50%;background:#08061a;border:1px solid rgba(114,77,251,0.4);display:flex;align-items:center;justify-content:center;gap:2px}
.andx-fab-badge-dot{width:3px;height:3px;border-radius:50%;background:#724dfb;animation:andxBounce 1.2s infinite}
.andx-fab-badge-dot:nth-child(2){animation-delay:0.15s}
.andx-fab-badge-dot:nth-child(3){animation-delay:0.3s}

/* Action buttons */
.andx-w-actions{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px;padding-left:32px}
.andx-w-action-btn{font-size:10px;padding:5px 12px;border-radius:16px;background:linear-gradient(135deg,#724dfb,#1de4d3);color:#fff;border:none;cursor:pointer;font-weight:600;transition:all 0.2s;font-family:inherit}
.andx-w-action-btn:hover{box-shadow:0 4px 12px rgba(114,77,251,0.3);transform:translateY(-1px)}

/* Live agent handoff */
.andx-handoff-wrap{margin:10px auto 0;padding:14px;border-radius:14px;background:linear-gradient(135deg,rgba(114,77,251,.10),rgba(29,228,211,.05));border:1px solid rgba(114,77,251,.22);box-sizing:border-box;width:calc(100% - 24px);max-width:420px}
.andx-handoff-status-row{display:flex;align-items:center;gap:10px;padding:11px 13px;border-radius:10px;background:rgba(20,12,40,.55);border:1px solid rgba(114,77,251,.2);margin:0 0 14px 0;text-align:left}
.andx-handoff-status-dot{width:9px;height:9px;border-radius:50%;background:#1de4d3;box-shadow:0 0 8px #1de4d3;flex-shrink:0}
.andx-handoff-status-dot.closed{background:#ff9e6d;box-shadow:0 0 8px #ff9e6d}
.andx-handoff-status-dot.loading{background:#9d8aff;box-shadow:0 0 8px #9d8aff;animation:andxPulse 1.2s ease-in-out infinite}
.andx-handoff-status-text{flex:1;min-width:0;font-size:13px;line-height:1.4;color:#e9e6ff;word-break:break-word}
.andx-handoff-status-text strong{color:#fff;font-weight:700;display:block;margin-bottom:3px;font-size:13.5px}
.andx-handoff-status-text span{color:#b6a8ff;font-size:11.5px;display:block}
.andx-handoff-section{display:flex;flex-direction:column;gap:6px}
.andx-handoff-btn{width:100%;padding:13px 14px;border-radius:10px;background:linear-gradient(135deg,#724dfb,#5a3dd9);color:#fff;border:none;cursor:pointer;font-weight:700;font-size:14px;font-family:inherit;transition:all .2s;display:flex;align-items:center;justify-content:center;gap:8px;box-sizing:border-box;line-height:1.2;margin-top:4px}
.andx-handoff-btn:hover{transform:translateY(-1px);box-shadow:0 6px 18px rgba(114,77,251,.45)}
.andx-handoff-btn:disabled{opacity:.5;cursor:not-allowed;transform:none;box-shadow:none}
.andx-handoff-btn.email-mode{background:linear-gradient(135deg,#1de4d3,#0fb8a8);color:#0b0020}
.andx-handoff-status{font-size:12px;color:#cfc3ff;margin-top:10px;line-height:1.45;text-align:center}
.andx-handoff-form{display:flex;flex-direction:column;gap:14px;margin:0}
.andx-handoff-label{font-size:11px;color:#b6a8ff;font-weight:600;letter-spacing:.3px;text-transform:uppercase}
.andx-handoff-input{width:100%;padding:11px 12px;border-radius:9px;background:rgba(20,12,40,.6);border:1px solid rgba(114,77,251,.3);color:#fff;font-size:14px;font-family:inherit;outline:none;box-sizing:border-box;transition:border-color .15s,box-shadow .15s;display:block}
.andx-handoff-input:focus{border-color:#724dfb;box-shadow:0 0 0 2px rgba(114,77,251,.2)}
.andx-handoff-input::placeholder{color:rgba(182,168,255,.5)}
.andx-handoff-textarea{min-height:84px;resize:vertical;line-height:1.45;font-family:inherit}
.andx-handoff-err{font-size:11px;color:#ff8e8e;margin:0;display:none}

/* Persistent "Speak to live agent" pill */
.andx-agent-pill-bar{display:flex;justify-content:center;gap:6px;padding:6px 12px 2px;border-top:1px solid rgba(114,77,251,.12);flex-wrap:wrap}
.andx-agent-pill{display:inline-flex;align-items:center;gap:6px;font-size:11px;color:#b6a8ff;background:rgba(114,77,251,.08);border:1px solid rgba(114,77,251,.22);padding:5px 12px;border-radius:14px;cursor:pointer;font-family:inherit;transition:all .15s;text-decoration:none}
.andx-agent-pill:hover{background:rgba(114,77,251,.18);color:#fff;border-color:rgba(114,77,251,.45)}
.andx-agent-pill svg{width:12px;height:12px;stroke:currentColor}
.andx-agent-pill.call{background:rgba(29,228,211,.08);border-color:rgba(29,228,211,.28);color:#8de8dc}
.andx-agent-pill.call:hover{background:rgba(29,228,211,.2);color:#fff;border-color:rgba(29,228,211,.55)}

/* Queue card */
.andx-queue-wrap{margin:10px 32px 0 32px;padding:14px 16px;border-radius:14px;background:linear-gradient(135deg,rgba(114,77,251,.18),rgba(29,228,211,.1));border:1px solid rgba(114,77,251,.35);position:relative;overflow:hidden}
.andx-queue-wrap::before{content:'';position:absolute;top:0;left:-100%;width:100%;height:2px;background:linear-gradient(90deg,transparent,#1de4d3,transparent);animation:andxQueueScan 2.4s linear infinite}
@keyframes andxQueueScan{0%{left:-100%}100%{left:100%}}
.andx-queue-head{display:flex;align-items:center;gap:8px;font-size:11px;font-weight:700;color:#b6a8ff;letter-spacing:.5px;text-transform:uppercase;margin-bottom:10px}
.andx-queue-head::before{content:'';width:8px;height:8px;border-radius:50%;background:#1de4d3;box-shadow:0 0 10px #1de4d3;animation:andxPulse 1.4s ease-in-out infinite}
.andx-queue-pos{display:flex;align-items:baseline;gap:6px;color:#fff;font-weight:700;font-size:22px;line-height:1}
.andx-queue-pos-num{font-size:34px;background:linear-gradient(135deg,#724dfb,#1de4d3);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;font-weight:800}
.andx-queue-pos-label{font-size:12px;color:#b6a8ff;font-weight:500}
.andx-queue-next{color:#1de4d3;font-size:16px;font-weight:700;text-transform:none;letter-spacing:0}
.andx-queue-wait{font-size:11px;color:#8f85c7;margin-top:6px}
.andx-queue-dots{display:inline-flex;gap:3px;margin-left:6px}
.andx-queue-dots span{width:4px;height:4px;border-radius:50%;background:#1de4d3;animation:andxBounce 1.2s infinite}
.andx-queue-dots span:nth-child(2){animation-delay:.15s}
.andx-queue-dots span:nth-child(3){animation-delay:.3s}

/* Transcript button (in live-agent mode) */
.andx-transcript-btn{display:inline-flex;align-items:center;gap:6px;font-size:11px;color:#b6a8ff;background:rgba(114,77,251,.08);border:1px solid rgba(114,77,251,.22);padding:5px 12px;border-radius:14px;cursor:pointer;font-family:inherit;transition:all .15s;margin-left:6px}
.andx-transcript-btn:hover{background:rgba(114,77,251,.2);color:#fff;border-color:rgba(114,77,251,.5)}
.andx-transcript-btn svg{width:12px;height:12px;stroke:currentColor}
.andx-transcript-btn:disabled{opacity:.5;cursor:not-allowed}
.andx-transcript-toast{position:absolute;bottom:calc(100% + 8px);left:50%;transform:translateX(-50%);background:#1a1430;color:#1de4d3;font-size:11px;font-weight:600;padding:7px 12px;border-radius:8px;border:1px solid rgba(29,228,211,.3);white-space:nowrap;box-shadow:0 4px 14px rgba(0,0,0,.4);z-index:10}

/* Live agent mode — differentiate agent bubbles + header */
.andx-live-badge{display:inline-flex;align-items:center;gap:4px;font-size:10px;font-weight:700;color:#0b0020;background:linear-gradient(135deg,#1de4d3,#0fb8a8);padding:2px 8px;border-radius:10px;margin-left:8px;letter-spacing:.3px;text-transform:uppercase}
.andx-live-badge::before{content:'';width:6px;height:6px;border-radius:50%;background:#0b0020;animation:andxPulse 1.5s ease-in-out infinite}
.andx-bubble-agent{background:linear-gradient(135deg,rgba(29,228,211,.12),rgba(29,228,211,.03))!important;border:1px solid rgba(29,228,211,.30)!important;color:#e9fffc!important;border-radius:5px 18px 18px 18px!important;padding:9px 14px!important;font-size:14px;line-height:1.45;box-shadow:0 1px 8px rgba(29,228,211,.10)}
.andx-row-agent{margin-top:6px}
.andx-row-agent .andx-sender{font-size:10.5px;color:#8de8dc;font-weight:700;letter-spacing:.4px;text-transform:uppercase;margin-bottom:4px}
.andx-row-agent .andx-sender::before{background:#1de4d3;box-shadow:0 0 6px #1de4d3}
.andx-live-avatar{background:linear-gradient(135deg,#1de4d3,#0fb8a8)!important;color:#0b0020!important}
.andx-end-live{display:block;margin:10px auto 0;font-size:10px;color:#726a95;background:none;border:1px dashed rgba(114,77,251,.3);padding:4px 10px;border-radius:12px;cursor:pointer;font-family:inherit}
.andx-end-live:hover{color:#fff;border-color:rgba(114,77,251,.6)}

/* Call-or-email divider inside handoff card */
.andx-handoff-call{margin-top:12px;padding:11px 13px;border-radius:10px;background:rgba(29,228,211,.08);border:1px solid rgba(29,228,211,.25);display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}
.andx-handoff-call-text{font-size:12px;color:#b6a8ff;line-height:1.4;flex:1;min-width:140px}
.andx-handoff-call-text strong{color:#8de8dc;font-size:13.5px;letter-spacing:.3px;display:block;margin-top:2px}
.andx-handoff-call-btn{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:700;color:#fff;background:linear-gradient(135deg,#1de4d3,#0fb8a8);border:none;padding:8px 14px;border-radius:14px;cursor:pointer;text-decoration:none;font-family:inherit;flex-shrink:0}
.andx-handoff-call-btn:hover{transform:translateY(-1px);box-shadow:0 4px 12px rgba(29,228,211,.3)}
.andx-handoff-divider{text-align:center;font-size:10px;color:#726a95;margin:14px 0 10px;letter-spacing:1.2px;text-transform:uppercase;font-weight:600;position:relative}
.andx-handoff-divider::before,.andx-handoff-divider::after{content:'';position:absolute;top:50%;width:calc(50% - 22px);height:1px;background:rgba(114,77,251,.18)}
.andx-handoff-divider::before{left:0}
.andx-handoff-divider::after{right:0}

/* Welcome-screen "live agent" option */
.andx-welcome-agent{margin-top:10px;text-align:center}
.andx-welcome-agent-link{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:#b6a8ff;background:rgba(114,77,251,.1);border:1px solid rgba(114,77,251,.28);padding:7px 14px;border-radius:16px;cursor:pointer;font-family:inherit;transition:all .2s}
.andx-welcome-agent-link:hover{background:rgba(114,77,251,.22);color:#fff;transform:translateY(-1px)}

/* Tablet */
@media(min-width:501px) and (max-width:1024px){
  #andx-fab{bottom:90px;right:24px}
  #andx-tooltip{bottom:154px;right:24px}
  #andx-panel{bottom:158px;right:24px}
}

/* Mobile */
@media(max-width:500px){
  #andx-fab{width:62px;height:62px;bottom:90px;right:16px}
  #andx-fab .andx-fab-label{font-size:12px;letter-spacing:.5px}
  #andx-tooltip{bottom:150px;right:16px;font-size:12px}
  #andx-panel{width:100vw;height:100dvh;right:0;bottom:0;top:0;left:0;max-height:100dvh;border-radius:0;resize:none}
  #andx-panel::before{border-radius:0}
  .andx-chip{font-size:11px;padding:10px 8px}
  /* Handoff card tightens up on small screens */
  .andx-handoff-wrap{margin:10px 10px 0 10px;padding:13px}
  .andx-handoff-status-row{padding:10px 11px}
  .andx-handoff-status-text{font-size:13px}
  .andx-handoff-input{font-size:15px;padding:11px 12px}
  .andx-handoff-textarea{min-height:84px}
  .andx-handoff-btn{padding:13px 14px;font-size:15px}
  .andx-handoff-call-text{flex:1 1 100%;min-width:0}
  .andx-handoff-call-btn{flex:0 0 auto;margin-left:auto}
}
`;
  document.head.appendChild(css);

  /* ── Build DOM ───────────────────────────────────────── */

  // FAB
  var fab = document.createElement('button');
  fab.id = 'andx-fab';
  fab.innerHTML = CHAT_ICON;
  fab.setAttribute('aria-label', 'Open ANDX chat');
  fab.onclick = function () {
    if (fabSuppressClick) { fabSuppressClick = false; return; }
    toggleWidget();
  };
  document.body.appendChild(fab);

  // Tooltip — cycles a few friendly nudges over time so visitors notice the bot
  var TOOLTIP_MESSAGES = [
    'Need help?',
    'Ask AI anything',
    'Questions? Ask away',
    'I can help — tap to chat',
    'Curious about ANDX?'
  ];
  var _tooltipCycleCount = 0;
  function showTooltip(text) {
    if (isOpen) return;
    // Don't stack — clear any existing tip first
    var existing = document.getElementById('andx-tooltip');
    if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

    var tt = document.createElement('div');
    tt.id = 'andx-tooltip';
    tt.textContent = text || TOOLTIP_MESSAGES[_tooltipCycleCount % TOOLTIP_MESSAGES.length];
    tt.onclick = function () {
      if (tt.parentNode) tt.parentNode.removeChild(tt);
      toggleWidget();
    };
    document.body.appendChild(tt);
    positionTooltip(tt);
    setTimeout(function () {
      if (tt.parentNode) {
        tt.style.transition = 'opacity .4s ease, transform .4s ease';
        tt.style.opacity = '0';
        tt.style.transform = 'translateY(6px)';
        setTimeout(function () { if (tt.parentNode) tt.parentNode.removeChild(tt); }, 420);
      }
    }, 5500);
    _tooltipCycleCount++;
  }
  // First nudge appears 3s after page load
  setTimeout(function () { showTooltip(); }, 3000);
  // Subsequent nudges every ~45s while the chat is closed and visitor hasn't
  // interacted yet. Stops after 4 cycles so we're not annoying.
  setInterval(function () {
    if (isOpen || userInteracted) return;
    if (_tooltipCycleCount >= 5) return;
    showTooltip();
  }, 45000);

  // Panel
  var panel = document.createElement('div');
  panel.id = 'andx-panel';
  panel.innerHTML = [
    '<canvas id="andx-particles"></canvas>',

    '<div id="andx-header">',
    '  <span class="andx-hdr-dots" style="top:8px;left:30%;--dx:12px;--dy:6px;animation:andxHeaderDot 6s ease infinite"></span>',
    '  <span class="andx-hdr-dots" style="top:28px;left:60%;--dx:-8px;--dy:10px;animation:andxHeaderDot 8s ease infinite 1s"></span>',
    '  <span class="andx-hdr-dots" style="top:14px;left:82%;--dx:6px;--dy:-8px;animation:andxHeaderDot 7s ease infinite 2s"></span>',
    '  <div class="andx-hdr-info">',
    '    <div class="andx-hdr-title">ANDX Intelligence</div>',
    '    <div class="andx-hdr-sub"><span class="andx-status"></span> <span class="andx-online">Online</span></div>',
    '  </div>',
    '  <div class="andx-hdr-btns">',
    '    <button class="andx-hdr-btn" data-action="clear">Clear</button>',
    '    <button class="andx-hdr-btn" data-action="close">\u2715</button>',
    '  </div>',
    '</div>',

    '<div id="andx-thread"></div>',

    '<div class="andx-agent-pill-bar">',
    '  <button class="andx-agent-pill" id="andx-agent-pill" type="button">',
    '    <svg viewBox="0 0 24 24" fill="none" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
    '    Chat with a live agent',
    '  </button>',
    '  <a class="andx-agent-pill call" id="andx-call-pill" href="tel:+18883434394">',
    '    <svg viewBox="0 0 24 24" fill="none" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.86 19.86 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.86 19.86 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>',
    '    Call 888-343-4394',
    '  </a>',
    '</div>',

    '<button id="andx-scroll-latest" type="button" title="Jump to latest">',
    '  <svg viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>',
    '  <span class="andx-sl-label">New</span>',
    '  <span class="andx-sl-count" id="andx-sl-count" style="display:none">0</span>',
    '</button>',

    '<div id="andx-input-bar">',
    '  <input id="andx-input" type="text" placeholder="Ask ANDX anything..." autocomplete="off">',
    '  <button id="andx-send"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg></button>',
    '</div>',

    ''
  ].join('\n');
  document.body.appendChild(panel);

  /* ── Element refs ────────────────────────────────────── */
  var header = document.getElementById('andx-header');
  var thread = document.getElementById('andx-thread');
  var input = document.getElementById('andx-input');
  var sendBtn = document.getElementById('andx-send');
  var canvas = document.getElementById('andx-particles');
  var ctx = canvas.getContext('2d');
  var agentPill = document.getElementById('andx-agent-pill');
  if (agentPill) {
    agentPill.onclick = function () { requestLiveAgent(''); };
  }

  /* ── Header button clicks ────────────────────────────── */
  header.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-action]');
    if (!btn) return;
    e.stopPropagation();
    var action = btn.getAttribute('data-action');
    if (action === 'clear') __andxClear();
    else if (action === 'min') __andxMinimize();
    else if (action === 'close') __andxClose();
  });

  /* ── Input events ────────────────────────────────────── */
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      __andxSend();
    }
  });
  // Visual cue: send button glows when there's something to send
  input.addEventListener('input', function () {
    if (input.value.trim()) sendBtn.classList.add('andx-send-ready');
    else sendBtn.classList.remove('andx-send-ready');
  });
  sendBtn.addEventListener('click', function () {
    __andxSend();
    sendBtn.classList.remove('andx-send-ready');
  });

  // Scroll-to-latest pill: appears when user scrolls up while messages append
  thread.addEventListener('scroll', function () {
    if (!isUserScrolledUp()) hideScrollLatest();
  });
  var scrollLatestBtn = document.getElementById('andx-scroll-latest');
  if (scrollLatestBtn) {
    scrollLatestBtn.addEventListener('click', function () {
      thread.scrollTop = thread.scrollHeight;
      hideScrollLatest();
    });
  }

  /* ── Drag helper (mouse + touch + pen via Pointer Events) ── */
  // After a real drag, browsers can still fire a click at the release point
  // (on whatever page element is under the finger). Swallow it.
  var swallowClicksUntil = 0;
  document.addEventListener('click', function (e) {
    if (Date.now() < swallowClicksUntil) { e.stopImmediatePropagation(); e.stopPropagation(); e.preventDefault(); }
  }, true);

  function attachDrag(handle, opts) {
    var st = { active: false, moved: false, startX: 0, startY: 0, id: null };
    var THRESH = opts.threshold || 5;
    function pt(e) {
      if (e.touches && e.touches.length) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
      if (e.changedTouches && e.changedTouches.length) return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
      return { x: e.clientX, y: e.clientY };
    }
    function down(e) {
      if (typeof e.button === 'number' && e.button !== 0) return;
      if (opts.enabled && !opts.enabled()) return;
      if (opts.ignore && opts.ignore(e)) return;
      var p = pt(e);
      st.active = true; st.moved = false; st.startX = p.x; st.startY = p.y;
      st.id = (typeof e.pointerId === 'number') ? e.pointerId : null;
      if (opts.onStart) opts.onStart(e);
      if (e.type !== 'touchstart' && e.cancelable) e.preventDefault();
    }
    function move(e) {
      if (!st.active) return;
      if (st.id !== null && typeof e.pointerId === 'number' && e.pointerId !== st.id) return;
      var p = pt(e);
      var dx = p.x - st.startX, dy = p.y - st.startY;
      if (!st.moved) {
        if (Math.abs(dx) < THRESH && Math.abs(dy) < THRESH) return;
        st.moved = true;
        if (opts.onDragStart) opts.onDragStart(e);
      }
      if (e.cancelable) e.preventDefault();
      opts.onMove(dx, dy, e);
    }
    function up(e) {
      if (!st.active) return;
      if (st.id !== null && typeof e.pointerId === 'number' && e.pointerId !== st.id) return;
      st.active = false;
      var moved = st.moved;
      st.moved = false;
      if (moved) swallowClicksUntil = Date.now() + 350;
      var cancelled = /cancel/.test(e.type || '');
      if (opts.onEnd) opts.onEnd(moved, e, cancelled);
    }
    if (window.PointerEvent) {
      handle.addEventListener('pointerdown', down);
      document.addEventListener('pointermove', move, { passive: false });
      document.addEventListener('pointerup', up);
      document.addEventListener('pointercancel', up);
    } else {
      handle.addEventListener('mousedown', down);
      document.addEventListener('mousemove', move);
      document.addEventListener('mouseup', up);
      handle.addEventListener('touchstart', down, { passive: true });
      document.addEventListener('touchmove', move, { passive: false });
      document.addEventListener('touchend', up);
      document.addEventListener('touchcancel', up);
    }
    return st;
  }

  function isMobileLayout() { return window.innerWidth <= 500; }

  /* ── Panel drag (by header, desktop/tablet only) ─────── */
  var panelDragOrigin = { x: 0, y: 0 };
  attachDrag(header, {
    enabled: function () { return !isMobileLayout(); },
    ignore: function (e) { return !!(e.target.closest('[data-action]') || e.target.closest('button') || e.target.closest('a')); },
    onDragStart: function () {
      var rect = panel.getBoundingClientRect();
      panelDragOrigin.x = rect.left;
      panelDragOrigin.y = rect.top;
      panel.style.left = rect.left + 'px';
      panel.style.top = rect.top + 'px';
      panel.style.right = 'auto';
      panel.style.bottom = 'auto';
      header.classList.add('andx-grabbing');
    },
    onMove: function (dx, dy) {
      var newX = panelDragOrigin.x + dx;
      var newY = panelDragOrigin.y + dy;
      // Keep on screen
      newX = Math.max(0, Math.min(newX, window.innerWidth - 100));
      newY = Math.max(0, Math.min(newY, window.innerHeight - 60));
      panel.style.left = newX + 'px';
      panel.style.top = newY + 'px';
    },
    onEnd: function () { header.classList.remove('andx-grabbing'); }
  });

  /* ── FAB drag: move the bubble anywhere, snaps to nearest side, remembered ── */
  var FAB_POS_KEY = 'andxFabPos';
  var FAB_MARGIN = 16;
  var fabCustomPos = false;
  var fabDragOrigin = { x: 0, y: 0 };

  function fabSize() {
    return { w: fab.offsetWidth || 68, h: fab.offsetHeight || 68 };
  }
  function clampFab(x, y) {
    var sz = fabSize();
    return {
      x: Math.max(FAB_MARGIN, Math.min(x, window.innerWidth - sz.w - FAB_MARGIN)),
      y: Math.max(FAB_MARGIN, Math.min(y, window.innerHeight - sz.h - FAB_MARGIN))
    };
  }
  function applyFabPos(x, y, animate) {
    var c = clampFab(x, y);
    if (animate) {
      fab.style.transition = 'left .25s ease, top .25s ease, transform .2s ease';
      setTimeout(function () { fab.style.transition = ''; }, 280);
    }
    fab.style.left = c.x + 'px';
    fab.style.top = c.y + 'px';
    fab.style.right = 'auto';
    fab.style.bottom = 'auto';
    fabCustomPos = true;
    return c;
  }
  function snapFab(animate) {
    var rect = fab.getBoundingClientRect();
    var sz = fabSize();
    var onLeft = (rect.left + rect.width / 2) < window.innerWidth / 2;
    var x = onLeft ? FAB_MARGIN : window.innerWidth - sz.w - FAB_MARGIN;
    var c = applyFabPos(x, rect.top, animate);
    try {
      var travel = Math.max(1, window.innerHeight - sz.h - FAB_MARGIN * 2);
      localStorage.setItem(FAB_POS_KEY, JSON.stringify({
        side: onLeft ? 'left' : 'right',
        yRatio: (c.y - FAB_MARGIN) / travel
      }));
    } catch (e) {}
  }
  function restoreFabPos() {
    var saved = null;
    try { saved = JSON.parse(localStorage.getItem(FAB_POS_KEY) || 'null'); } catch (e) {}
    if (!saved || typeof saved.yRatio !== 'number') return;
    var sz = fabSize();
    var x = saved.side === 'left' ? FAB_MARGIN : window.innerWidth - sz.w - FAB_MARGIN;
    var travel = Math.max(1, window.innerHeight - sz.h - FAB_MARGIN * 2);
    var y = FAB_MARGIN + Math.max(0, Math.min(1, saved.yRatio)) * travel;
    applyFabPos(x, y, false);
  }

  /* Panel + tooltip anchor to the bubble once it has been moved */
  function positionPanel() {
    if (isMobileLayout()) {
      // Fullscreen on phones — let the CSS handle it
      panel.style.left = ''; panel.style.top = ''; panel.style.right = ''; panel.style.bottom = '';
      return;
    }
    if (!fabCustomPos) {
      panel.style.left = ''; panel.style.top = '';
      panel.style.right = '24px'; panel.style.bottom = '92px';
      return;
    }
    var fr = fab.getBoundingClientRect();
    var pw = panel.offsetWidth || 420;
    var ph = panel.offsetHeight || 620;
    var gap = 12, m = 12;
    var vw = window.innerWidth, vh = window.innerHeight;
    var fabOnLeft = (fr.left + fr.width / 2) < vw / 2;
    var left = fabOnLeft ? fr.left : fr.right - pw;
    var top;
    if (fr.top - gap - ph >= m) {
      top = fr.top - gap - ph;                    // above the bubble
    } else if (fr.bottom + gap + ph <= vh - m) {
      top = fr.bottom + gap;                      // below the bubble
    } else {
      // Not enough room above or below — sit beside it
      left = fabOnLeft ? fr.right + gap : fr.left - gap - pw;
      top = Math.max(m, Math.min(fr.top, vh - m - ph));
    }
    left = Math.max(m, Math.min(left, vw - pw - m));
    top = Math.max(m, Math.min(top, vh - ph - m));
    panel.style.left = left + 'px';
    panel.style.top = top + 'px';
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
  }
  function positionTooltip(tt) {
    if (!tt || !fabCustomPos) return;
    var fr = fab.getBoundingClientRect();
    var th = tt.offsetHeight || 40;
    var fabOnLeft = (fr.left + fr.width / 2) < window.innerWidth / 2;
    tt.classList.toggle('andx-tt-left', fabOnLeft);
    if (fabOnLeft) { tt.style.left = fr.left + 'px'; tt.style.right = 'auto'; }
    else { tt.style.right = (window.innerWidth - fr.right) + 'px'; tt.style.left = 'auto'; }
    var top = fr.top - 10 - th;
    var below = top < 8;
    if (below) top = fr.bottom + 10;
    tt.classList.toggle('andx-tt-below', below);
    tt.style.top = top + 'px';
    tt.style.bottom = 'auto';
  }

  attachDrag(fab, {
    threshold: 6,
    onDragStart: function () {
      var rect = fab.getBoundingClientRect();
      fabDragOrigin.x = rect.left;
      fabDragOrigin.y = rect.top;
      fab.style.transition = 'none';
      fab.classList.add('andx-fab-dragging');
      var tt = document.getElementById('andx-tooltip');
      if (tt && tt.parentNode) tt.parentNode.removeChild(tt);
    },
    onMove: function (dx, dy) {
      applyFabPos(fabDragOrigin.x + dx, fabDragOrigin.y + dy, false);
    },
    onEnd: function (moved, e, cancelled) {
      fab.classList.remove('andx-fab-dragging');
      fab.style.transition = '';
      if (moved) {
        snapFab(true);
        if (isOpen) positionPanel();
        return;
      }
      if (cancelled) return;
      // Plain press + release = toggle. Ignore the click event that follows so we
      // don't toggle twice; keyboard activation still comes through fab.onclick.
      fabSuppressClick = true;
      setTimeout(function () { fabSuppressClick = false; }, 400);
      toggleWidget();
    }
  });

  restoreFabPos();

  window.addEventListener('resize', function () {
    if (fabCustomPos) restoreFabPos();
    if (isOpen) positionPanel();
  });

  /* ── Particle system ─────────────────────────────────── */
  function initParticles() {
    particles = [];
    var w = canvas.width;
    var h = canvas.height;
    for (var i = 0; i < 40; i++) {
      var isPurple = Math.random() > 0.4;
      particles.push({
        x: Math.random() * w,
        y: Math.random() * h,
        r: 1 + Math.random() * 1.5,
        baseR: 1 + Math.random() * 1.5,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        color: isPurple ? 'rgba(114,77,251,0.25)' : 'rgba(29,228,211,0.18)',
        pulse: Math.random() > 0.6,
        phase: Math.random() * Math.PI * 2
      });
    }
  }

  function resizeCanvas() {
    var rect = panel.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
  }

  function animateParticles() {
    if (!isOpen || isMinimized) { particleRAF = null; return; }

    var w = canvas.width;
    var h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    var now = Date.now() / 1000;

    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      p.x += p.vx;
      p.y += p.vy;

      if (p.x < 0 || p.x > w) p.vx *= -1;
      if (p.y < 0 || p.y > h) p.vy *= -1;

      p.x = Math.max(0, Math.min(w, p.x));
      p.y = Math.max(0, Math.min(h, p.y));

      var r = p.baseR;
      if (p.pulse) {
        r = p.baseR + Math.sin(now * 1.5 + p.phase) * 0.8;
      }
      p.r = r;

      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.fill();
    }

    // Connection lines
    for (var i = 0; i < particles.length; i++) {
      for (var j = i + 1; j < particles.length; j++) {
        var dx = particles[i].x - particles[j].x;
        var dy = particles[i].y - particles[j].y;
        var dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 70) {
          ctx.beginPath();
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.strokeStyle = 'rgba(114,77,251,' + (0.04 * (1 - dist / 70)) + ')';
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }
      }
    }

    particleRAF = requestAnimationFrame(animateParticles);
  }

  /* ── Welcome screen ──────────────────────────────────── */
  function getStarterChips() {
    var path = window.location.pathname.toLowerCase();
    if (path.includes('tokenization') || path.includes('rwa')) {
      return ['What is tokenization?', 'Tell me about Manila One', 'What token types are available?', 'How is it regulated?'];
    } else if (path.includes('why-andx') || path.includes('about')) {
      return ['What makes ANDX different?', 'How is ANDX regulated?', 'Who is the CEO?', 'What is BitGo custody?'];
    } else if (path.includes('market') || path.includes('trade') || path.includes('trading')) {
      return ['What can I trade on ANDX?', 'What are the trading fees?', 'How fast are withdrawals?', 'Is there a mobile app?'];
    } else if (path.includes('security') || path.includes('compliance') || path.includes('legal')) {
      return ['Is my money safe?', 'What licenses does ANDX hold?', 'How is custody handled?', 'How do you handle KYC?'];
    } else if (path.includes('signup') || path.includes('sign-up') || path.includes('register') || path.includes('login') || path.includes('account')) {
      return ['How do I sign up?', 'What documents do I need?', 'How long does verification take?', 'What countries are supported?'];
    } else if (path.includes('contact') || path.includes('support') || path.includes('help')) {
      return ['I need to speak to an agent', 'My account is locked', 'How do I withdraw funds?', 'Reset my password'];
    } else if (path.includes('developer') || path.includes('api') || path.includes('docs')) {
      return ['Do you have an API?', 'How do I get API keys?', 'What is the rate limit?', 'Are there code examples?'];
    } else if (path.includes('fees') || path.includes('pricing')) {
      return ['What are the trading fees?', 'Are there deposit fees?', 'What about withdrawal fees?', 'Any hidden costs?'];
    } else {
      return ['How is ANDX different?', 'Is ANDX safe and regulated?', 'What are the trading fees?', 'How does tokenization work?'];
    }
  }

  function showWelcome() {
    var html = '<div class="andx-welcome" id="andx-w-welcome"><div class="andx-welcome-text"><h3>Welcome to ANDX Support</h3><p>Ask us anything about our platform, features, security, or getting started</p></div><div class="andx-w-chips andx-chips"></div></div>';
    thread.innerHTML = html;
    var chips = getStarterChips();
    var chipsEl = document.querySelector('.andx-w-chips');
    if (chipsEl) {
      chipsEl.innerHTML = chips.map(function(c) {
        return '<span class="andx-chip andx-w-chip">' + c + '</span>';
      }).join('');
      chipsEl.querySelectorAll('.andx-w-chip').forEach(function(el) {
        el.onclick = function() { window.__andxChip(el); };
      });
    }
  }

  /* ── Manually trigger handoff from pill/welcome link ──── */
  function requestLiveAgent(lastMessage) {
    // If already in live mode, don't duplicate — just refocus input
    if (liveAgent.active) {
      try { input.focus(); } catch (e) {}
      return;
    }

    // Clear welcome screen if visible
    var welcome = document.getElementById('andx-w-welcome');
    if (welcome) welcome.remove();

    // Figure out last user message (used as ticket context only)
    var msg = lastMessage;
    if (!msg) {
      for (var i = chatHistory.length - 1; i >= 0; i--) {
        if (chatHistory[i].role === 'user') { msg = chatHistory[i].content; break; }
      }
    }
    if (!msg) msg = '';

    var alreadyActive = thread.querySelector('.andx-handoff-wrap[data-live="1"]');
    if (alreadyActive) { scrollToBottom(); return; }

    fetchAgentStatus().then(function (online) {
      if (online) {
        // ONLINE: still ALWAYS gate on email — agents need a way to follow
        // up if the connection drops. After email is captured, instant connect.
        showEmailGateThenConnect(msg);
      } else {
        // OFFLINE: show the leave-a-message form. Message + email both required.
        var row = appendBubble('ai', 'No agents are available right now. Leave your message below and we’ll reply by email shortly.');
        var bubble = row.querySelector('.andx-bubble-ai');
        if (bubble) {
          streamReveal(bubble, function () {
            renderHandoffCard(thread, msg, true);
          });
        } else {
          renderHandoffCard(thread, msg, true);
        }
        scrollToBottom();
      }
    });
  }

  /* Mandatory email gate: tiny one-field card before instant connect */
  function showEmailGateThenConnect(msg) {
    // Skip the gate if we already have an email from a previous handoff this session
    var savedEmail = '';
    try { savedEmail = sessionStorage.getItem('andxLastEmail') || ''; } catch (e) {}

    var card = document.createElement('div');
    card.className = 'andx-email-gate';
    card.innerHTML =
      '<div class="andx-email-gate-title">Quick — your email</div>' +
      '<div class="andx-email-gate-sub">So the agent can follow up if the chat drops. Required.</div>' +
      '<input type="email" inputmode="email" autocomplete="email" placeholder="you@example.com" value="' + escapeHtml(savedEmail) + '">' +
      '<div class="andx-email-gate-err">Please enter a valid email.</div>' +
      '<button type="button">Start live chat</button>';
    thread.appendChild(card);
    scrollToBottom();
    var emailInput = card.querySelector('input');
    var errEl = card.querySelector('.andx-email-gate-err');
    var btn = card.querySelector('button');
    setTimeout(function () { try { emailInput.focus(); } catch (e) {} }, 80);

    function submit() {
      var email = (emailInput.value || '').trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
        errEl.style.display = 'block';
        emailInput.focus();
        return;
      }
      errEl.style.display = 'none';
      btn.disabled = true;
      btn.textContent = 'Connecting…';
      try { sessionStorage.setItem('andxLastEmail', email); } catch (e) {}
      // Replace the gate card with a connecting bubble and proceed
      card.remove();
      var connectingRow = appendBubble('ai', 'Connecting you to a live agent…');
      var connectingBubble = connectingRow.querySelector('.andx-bubble-ai');
      var payload = {
        initial_message: '',
        last_message: msg,
        email: email,
        name: '',
        history: chatHistory.slice(-20).map(function (m) {
          return { role: m.role, content: m.content };
        }),
        page_url: (typeof window !== 'undefined' && window.location) ? window.location.href : '',
        session_id: sessionId
      };
      fetch(API_BASE + '/api/handoff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (res) {
          if (res.j && res.j.ok) {
            if (connectingBubble) {
              connectingBubble.innerHTML = 'You’re connected. An agent will be with you shortly — just type your question below.';
            }
            enterLiveAgentMode({
              ticketId: res.j.ticket_id,
              ticketToken: res.j.ticket_token,
              startTs: res.j.start_ts || Math.floor(Date.now() / 1000),
              email: email,
              name: ''
            });
          } else if (connectingBubble) {
            connectingBubble.textContent = (res.j && res.j.message) || 'We had trouble reaching a live agent. Please try again or call 888-343-4394.';
          }
          scrollToBottom();
        })
        .catch(function () {
          if (connectingBubble) {
            connectingBubble.textContent = 'Connection error. Please try again or call 888-343-4394.';
          }
          scrollToBottom();
        });
    }

    btn.onclick = submit;
    emailInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); submit(); }
    });
  }

  /* ── Toggle / Open / Close ───────────────────────────── */
  function toggleWidget() {
    userInteracted = true;
    if (isOpen) {
      __andxClose();
    } else {
      // Remove tooltip if present
      var tt = document.getElementById('andx-tooltip');
      if (tt) tt.remove();

      isOpen = true;
      isMinimized = false;
      panel.classList.remove('andx-minimized', 'andx-closing');
      panel.classList.add('andx-open');

      // Lock background scroll on mobile
      if (window.innerWidth <= 500) document.body.style.overflow = 'hidden';

      // Place the panel next to the bubble (wherever the user has dragged it)
      positionPanel();

      // Append the close X on top of the sphere instead of replacing the sphere
      var existingClose = fab.querySelector('.andx-fab-close');
      if (!existingClose) {
        var closeWrap = document.createElement('span');
        closeWrap.className = 'andx-fab-close';
        closeWrap.innerHTML = CLOSE_ICON;
        fab.appendChild(closeWrap);
      }
      fab.classList.add('andx-open-state');

      // Particles
      resizeCanvas();
      initParticles();
      if (!particleRAF) particleRAF = requestAnimationFrame(animateParticles);

      // Show welcome only if there's truly nothing to restore. If we have
      // saved chat history or an active live-agent session, replay instead.
      if (chatHistory.length === 0 && !liveAgent.active) {
        showWelcome();
      } else if (thread.children.length === 0) {
        replayChatHistory();
        if (liveAgent.active) {
          // Apply live-agent UI now that the panel + thread exist
          applyLiveAgentHeader(true);
          try { input.setAttribute('placeholder', 'Message the live agent…'); } catch (e) {}
          addEndLiveButton();
          if (!liveAgent.agentResponded) {
            renderQueueCard();
            startQueuePolling();
          }
          startLiveAgentPolling();
        }
      }

      setTimeout(function () { input.focus(); }, 100);
    }
  }

  /* Replay persisted chat history into the thread (used after page refresh) */
  function replayChatHistory() {
    if (!chatHistory || !chatHistory.length) return;
    for (var i = 0; i < chatHistory.length; i++) {
      var m = chatHistory[i];
      if (!m || !m.content) continue;
      if (m.role === 'user') {
        renderUserBubble(m.content, m.ts, m.id, m.reactions);
      } else if (m.role === 'agent') {
        renderAgentBubble(m.content, m.agent_name || liveAgent.agentName || 'Live Agent', m.ts, m.id, m.reactions);
      } else {
        renderAiBubble(m.content, m.ts, m.id, m.reactions);
      }
    }
    scrollToBottom();
  }

  function reactionPillHtml(reactions) {
    if (!reactions || !reactions.length) return '';
    var unique = {};
    for (var i = 0; i < reactions.length; i++) unique[reactions[i]] = true;
    var emojis = Object.keys(unique).join('');
    return '<div class="andx-reaction-pill" data-reaction-pill="1">' + emojis + '</div>';
  }

  function renderUserBubble(text, ts, id, reactions) {
    var row = document.createElement('div');
    row.className = 'andx-msg andx-msg-user';
    var mid = id || newMessageId();
    row.setAttribute('data-msg-id', mid);
    var tsStr = formatTime(ts || Date.now());
    row.innerHTML =
      '<div class="andx-user-col">' +
      '  <div class="andx-bubble andx-bubble-user" data-msg-id="' + mid + '" data-msg-role="user">' + escapeHtml(text) + '</div>' +
      reactionPillHtml(reactions) +
      '  <div class="andx-ts">' + tsStr + '</div>' +
      '</div>';
    thread.appendChild(row);
  }
  function renderAiBubble(html, ts, id, reactions) {
    var row = document.createElement('div');
    row.className = 'andx-msg andx-msg-ai';
    var mid = id || newMessageId();
    row.setAttribute('data-msg-id', mid);
    row.innerHTML =
      '<div class="andx-avatar andx-avatar-sm">AI</div>' +
      '<div class="andx-ai-col">' +
      '  <div class="andx-sender">ANDX AI</div>' +
      '  <div class="andx-bubble andx-bubble-ai" data-msg-id="' + mid + '" data-msg-role="ai">' + html + '</div>' +
      reactionPillHtml(reactions) +
      '  <div class="andx-ts">' + formatTime(ts || Date.now()) + '</div>' +
      '</div>';
    thread.appendChild(row);
  }
  function renderAgentBubble(text, agentName, ts, id, reactions) {
    var row = document.createElement('div');
    row.className = 'andx-msg andx-msg-ai andx-row-agent';
    var mid = id || newMessageId();
    row.setAttribute('data-msg-id', mid);
    var name = (agentName || 'Live Agent').trim();
    var initials = name.split(/\s+/).map(function (x) { return x.charAt(0); }).join('').slice(0, 2).toUpperCase() || 'LA';
    var safe = escapeHtml(text).replace(/\n\n+/g, '<br><br>').replace(/\n/g, '<br>');
    row.innerHTML =
      '<div class="andx-avatar andx-avatar-sm andx-live-avatar">' + escapeHtml(initials) + '</div>' +
      '<div class="andx-ai-col">' +
      '  <div class="andx-sender">' + escapeHtml(name) + '</div>' +
      '  <div class="andx-bubble andx-bubble-ai andx-bubble-agent" data-msg-id="' + mid + '" data-msg-role="agent">' + linkifyUrls(safe) + '</div>' +
      reactionPillHtml(reactions) +
      '  <div class="andx-ts">' + formatTime(ts || Date.now()) + '</div>' +
      '</div>';
    thread.appendChild(row);
  }

  function __andxClose() {
    if (!isOpen) return;
    panel.classList.add('andx-closing');
    setTimeout(function () {
      panel.classList.remove('andx-open', 'andx-closing', 'andx-minimized');
      isOpen = false;
      isMinimized = false;
      document.body.style.overflow = '';
      // Just hide the close X — keep the sphere in place
      var closeWrap = fab.querySelector('.andx-fab-close');
      if (closeWrap) closeWrap.remove();
      fab.classList.remove('andx-open-state');
      if (particleRAF) { cancelAnimationFrame(particleRAF); particleRAF = null; }
    }, 200);
  }

  function __andxMinimize() {
    isMinimized = !isMinimized;
    if (isMinimized) {
      panel.classList.add('andx-minimized');
      if (particleRAF) { cancelAnimationFrame(particleRAF); particleRAF = null; }
    } else {
      panel.classList.remove('andx-minimized');
      resizeCanvas();
      if (!particleRAF) particleRAF = requestAnimationFrame(animateParticles);
    }
  }

  function __andxClear() {
    // Cancel anything in flight so a slow response can't append a ghost bubble
    // to the brand-new welcome screen.
    if (pendingAskController) {
      try { pendingAskController.abort(); } catch (e) {}
      pendingAskController = null;
    }
    try { cancelCurrentStream(); } catch (e) {}
    isStreaming = false;
    if (sendBtn) sendBtn.disabled = false;
    var fabBadge = document.getElementById('andx-fab-badge');
    if (fabBadge) fabBadge.remove();

    // Hard reset: drop chat history AND any live-agent session so the user
    // gets back to the AI bot welcome screen no matter what state they were in.
    if (liveAgent.active) {
      try { exitLiveAgentMode(false); } catch (e) {}
    }
    chatHistory = [];
    saveChatHistory();
    try { sessionStorage.removeItem('andxLiveAgent'); } catch (e) {}
    try { sessionStorage.removeItem('andxChatHistory'); } catch (e) {}
    if (thread) thread.innerHTML = '';
    showWelcome();
  }

  /* ── Bubbles ─────────────────────────────────────────── */
  // appendBubble stamps a stable message id on the bubble so long-press +
  // reactions can identify which message the user is interacting with.
  function appendBubble(role, html, msgId) {
    // Clear welcome if present
    var welcome = thread.querySelector('.andx-welcome');
    if (welcome) welcome.remove();

    var row = document.createElement('div');
    row.className = 'andx-msg andx-msg-' + role;
    var ts = formatTime(Date.now());
    var mid = msgId || newMessageId();
    row.setAttribute('data-msg-id', mid);

    if (role === 'user') {
      row.innerHTML =
        '<div class="andx-user-col">' +
        '  <div class="andx-bubble andx-bubble-user" data-msg-id="' + mid + '" data-msg-role="user">' + escapeHtml(html) + '</div>' +
        '  <div class="andx-ts">' + ts + '</div>' +
        '</div>';
    } else {
      row.innerHTML =
        '<div class="andx-avatar andx-avatar-sm">AI</div>' +
        '<div class="andx-ai-col">' +
        '  <div class="andx-sender">ANDX AI</div>' +
        '  <div class="andx-bubble andx-bubble-ai" data-msg-id="' + mid + '" data-msg-role="ai">' + html + '</div>' +
        '  <div class="andx-ts">' + ts + '</div>' +
        '</div>';
    }

    thread.appendChild(row);
    scrollToBottom();
    return row;
  }

  function formatTime(ms) {
    try {
      var d = new Date(ms);
      var h = d.getHours();
      var m = d.getMinutes();
      var ampm = h >= 12 ? 'PM' : 'AM';
      h = h % 12 || 12;
      return h + ':' + (m < 10 ? '0' + m : m) + ' ' + ampm;
    } catch (e) { return ''; }
  }

  function appendTyping() {
    var row = document.createElement('div');
    row.className = 'andx-msg andx-msg-ai';
    row.id = 'andx-typing-row';
    row.innerHTML =
      '<div class="andx-avatar andx-avatar-sm">AI</div>' +
      '<div class="andx-ai-col">' +
      '  <div class="andx-sender">ANDX AI</div>' +
      '  <div class="andx-bubble andx-bubble-ai andx-typing"><span></span><span></span><span></span></div>' +
      '</div>';
    thread.appendChild(row);
    scrollToBottom();
  }

  function removeTyping() {
    var el = document.getElementById('andx-typing-row');
    if (el) el.remove();
  }

  function renderFollowUps(suggestions) {
    if (!suggestions || !suggestions.length) return;
    var wrap = document.createElement('div');
    wrap.className = 'andx-followups';
    for (var i = 0; i < suggestions.length; i++) {
      var btn = document.createElement('button');
      btn.className = 'andx-fu';
      btn.textContent = suggestions[i];
      btn.onclick = (function (text, parentWrap) {
        return function () {
          if (isStreaming || pendingAskController) return;
          // Once any follow-up is clicked, retire the whole row so a fast second
          // click can't fire a parallel /api/ask.
          parentWrap.style.pointerEvents = 'none';
          parentWrap.style.opacity = '0.5';
          input.value = text;
          __andxSend();
        };
      })(suggestions[i], wrap);
      wrap.appendChild(btn);
    }
    thread.appendChild(wrap);
    scrollToBottom();
  }

  /* ── Stream reveal (word-by-word) ────────────────────── */
  var _cancelStream = false;

  function cancelCurrentStream() {
    _cancelStream = true;
  }

  function streamReveal(bubbleEl, onDone) {
    _cancelStream = false;
    var fullHTML = bubbleEl.innerHTML;
    bubbleEl.innerHTML = '';

    var tokens = [];
    var re = /(<[^>]+>)|(\s+)|([^\s<]+)/g;
    var m;
    while ((m = re.exec(fullHTML)) !== null) {
      tokens.push(m[0]);
    }

    var idx = 0;
    var current = '';
    var cursor = '<span class="andx-cursor">|</span>';

    function step() {
      if (_cancelStream) {
        bubbleEl.innerHTML = current || fullHTML;
        if (onDone) onDone();
        return;
      }
      if (idx >= tokens.length) {
        bubbleEl.innerHTML = current;
        if (onDone) onDone();
        return;
      }
      current += tokens[idx];
      idx++;
      bubbleEl.innerHTML = current + cursor;
      scrollToBottom();
      if (tokens[idx - 1] && tokens[idx - 1].charAt(0) === '<') {
        step();
      } else {
        setTimeout(step, 80);
      }
    }
    step();
  }

  /* ── URL linkification ───────────────────────────────── */
  function linkifyUrls(text) {
    // Full https:// URLs
    text = text.replace(/(https?:\/\/[^\s<)"]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
    // Bare domains: platform.andx.one, andxus.io/*, news.andx.ai
    text = text.replace(/(?<![/"'>])\b((?:platform\.andx\.one|analytics\.andx\.ai|(?:news\.)?andxus\.io)(?:\/[^\s<)"]*)?)/g, function (match) {
      return '<a href="https://' + match + '" target="_blank" rel="noopener">' + match + '</a>';
    });
    return text;
  }

  /* ── WhatsApp-ish helpers: reactions, reply-to, quote rendering ────── */
  var REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '👎'];

  function findHistoryById(id) {
    if (!id) return null;
    for (var i = 0; i < chatHistory.length; i++) {
      if (chatHistory[i] && chatHistory[i].id === id) return chatHistory[i];
    }
    return null;
  }

  // Convert leading "> ..." lines into a styled quote block at the top of bot answers.
  function renderQuoteBlocks(html) {
    if (!html || html.indexOf('&gt;') === -1 && html.indexOf('>') === -1) return html;
    // Detect a leading group of '> ' lines (separated by <br>)
    // Note: linkifyUrls runs before this; html may already contain <br>
    var pieces = html.split(/<br\s*\/?>(?:<br\s*\/?>)?/i);
    var quote = [];
    var rest = [];
    var inQuote = true;
    for (var i = 0; i < pieces.length; i++) {
      var p = pieces[i].trim();
      if (inQuote && /^(?:&gt;|>)\s*/.test(p)) {
        quote.push(p.replace(/^(?:&gt;|>)\s*/, ''));
      } else {
        if (p === '' && inQuote) continue;
        inQuote = false;
        rest.push(pieces[i]);
      }
    }
    if (!quote.length) return html;
    var quoteHtml = '<div class="andx-quote-block">' + quote.join('<br>') + '</div>';
    return quoteHtml + rest.join('<br><br>');
  }

  /* Long-press detector — touch + mouse, fires onLongPress(targetBubble) */
  function attachLongPress(onLongPress) {
    var pressTimer = null;
    var startX = 0, startY = 0;
    var fired = false;

    function start(e) {
      var bubble = e.target.closest && e.target.closest('.andx-bubble[data-msg-role]');
      if (!bubble) return;
      var role = bubble.getAttribute('data-msg-role');
      // Only AI/agent/user bubbles are reactable; user can also reply to own — but
      // for now, only allow long-press on AI/agent bubbles (those are what users
      // would reply to or react to).
      if (role !== 'ai' && role !== 'agent') return;
      fired = false;
      var pt = (e.touches && e.touches[0]) || e;
      startX = pt.clientX; startY = pt.clientY;
      pressTimer = setTimeout(function () {
        fired = true;
        if (navigator && navigator.vibrate) try { navigator.vibrate(20); } catch (er) {}
        onLongPress(bubble);
      }, 350);
    }
    function move(e) {
      if (!pressTimer) return;
      var pt = (e.touches && e.touches[0]) || e;
      var dx = (pt.clientX || 0) - startX;
      var dy = (pt.clientY || 0) - startY;
      if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
        clearTimeout(pressTimer); pressTimer = null;
      }
    }
    function end() {
      if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
    }

    thread.addEventListener('touchstart', start, { passive: true });
    thread.addEventListener('touchmove', move, { passive: true });
    thread.addEventListener('touchend', end);
    thread.addEventListener('mousedown', start);
    thread.addEventListener('mousemove', move);
    thread.addEventListener('mouseup', end);
    thread.addEventListener('mouseleave', end);
    // Suppress contextmenu on long-pressed bubbles to keep palette tidy
    thread.addEventListener('contextmenu', function (e) {
      var bubble = e.target.closest && e.target.closest('.andx-bubble[data-msg-role]');
      if (bubble) { e.preventDefault(); onLongPress(bubble); }
    });
  }

  /* Reaction palette popover */
  function showReactionPalette(bubble) {
    closeReactionPalette();
    var msgId = bubble.getAttribute('data-msg-id');
    var msgRole = bubble.getAttribute('data-msg-role'); // ai | agent
    var rect = bubble.getBoundingClientRect();
    var pal = document.createElement('div');
    pal.className = 'andx-react-palette';
    pal.id = 'andx-react-palette';
    var html = '';
    for (var i = 0; i < REACTION_EMOJIS.length; i++) {
      html += '<span class="andx-react-emoji" data-emoji="' + REACTION_EMOJIS[i] + '">' + REACTION_EMOJIS[i] + '</span>';
    }
    html += '<div class="andx-react-divider"></div>';
    html += '<button class="andx-react-action" data-action="reply">↶ Reply</button>';
    pal.innerHTML = html;
    document.body.appendChild(pal);

    // Position above the bubble, clamped to viewport
    var palRect = pal.getBoundingClientRect();
    var top = rect.top - palRect.height - 8;
    if (top < 8) top = rect.bottom + 8;
    var left = rect.left + (rect.width / 2) - (palRect.width / 2);
    left = Math.max(8, Math.min(left, window.innerWidth - palRect.width - 8));
    pal.style.top = top + 'px';
    pal.style.left = left + 'px';

    // Close on outside click
    setTimeout(function () {
      document.addEventListener('mousedown', outsideHandler, { once: false });
      document.addEventListener('touchstart', outsideHandler, { once: false, passive: true });
    }, 50);
    function outsideHandler(e) {
      if (!pal.contains(e.target)) {
        closeReactionPalette();
        document.removeEventListener('mousedown', outsideHandler);
        document.removeEventListener('touchstart', outsideHandler);
      }
    }

    // Click handlers
    pal.addEventListener('click', function (e) {
      var emojiEl = e.target.closest('[data-emoji]');
      var actionEl = e.target.closest('[data-action]');
      if (emojiEl) {
        var emoji = emojiEl.getAttribute('data-emoji');
        applyReaction(bubble, msgId, msgRole, emoji);
        closeReactionPalette();
      } else if (actionEl && actionEl.getAttribute('data-action') === 'reply') {
        startReplyTo(msgId, msgRole, bubble);
        closeReactionPalette();
      }
    });
  }
  function closeReactionPalette() {
    var pal = document.getElementById('andx-react-palette');
    if (pal && pal.parentNode) pal.parentNode.removeChild(pal);
  }

  function applyReaction(bubble, msgId, msgRole, emoji) {
    if (!msgId || !emoji) return;
    var entry = findHistoryById(msgId);
    if (entry) {
      entry.reactions = [emoji]; // last emoji wins (one reaction per message)
      saveChatHistory();
    }
    // Render pill next to bubble
    renderReactionOnBubble(bubble, emoji);

    // POST to backend
    var preview = (bubble.textContent || '').slice(0, 200);
    var historyTail = chatHistory.slice(-6).map(function (m) { return { role: m.role, content: m.content }; });
    fetch(API_BASE + '/api/reaction', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message_id: msgId,
        message_role: msgRole,
        message_preview: preview,
        reaction: emoji,
        ticket_id: liveAgent.active ? liveAgent.ticketId : '',
        ticket_token: liveAgent.active ? liveAgent.ticketToken : '',
        history: historyTail,
        mode: chatMode
      })
    })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (j && j.follow_up) {
          var aiMid = newMessageId();
          var html = renderQuoteBlocks(linkifyUrls(escapeHtml(j.follow_up).replace(/\n\n+/g, '<br><br>').replace(/\n/g, '<br>')));
          var row = appendBubble('ai', html, aiMid);
          chatHistory.push({ id: aiMid, role: 'assistant', content: j.follow_up, ts: Date.now() });
          saveChatHistory();
          var b = row.querySelector('.andx-bubble-ai');
          if (b) streamReveal(b, function () {});
        }
      })
      .catch(function () {});
  }

  function renderReactionOnBubble(bubble, emoji) {
    // Find the parent col (.andx-user-col or .andx-ai-col) and insert/replace the pill
    var col = bubble.parentElement;
    if (!col) return;
    var existing = col.querySelector('.andx-reaction-pill');
    if (existing) existing.remove();
    var pill = document.createElement('div');
    pill.className = 'andx-reaction-pill';
    pill.setAttribute('data-reaction-pill', '1');
    pill.textContent = emoji;
    // Insert after the bubble, before the timestamp
    var ts = col.querySelector('.andx-ts');
    if (ts) col.insertBefore(pill, ts);
    else col.appendChild(pill);
  }

  /* Reply-to pill above input */
  function startReplyTo(msgId, msgRole, bubble) {
    var preview = (bubble.textContent || '').slice(0, 160);
    pendingReplyTo = {
      id: msgId,
      role: msgRole,
      content_preview: preview
    };
    showReplyToPill(preview);
    try { input.focus(); } catch (e) {}
  }
  function showReplyToPill(preview) {
    hideReplyToPill();
    var pill = document.createElement('div');
    pill.className = 'andx-reply-pill';
    pill.id = 'andx-reply-pill';
    pill.innerHTML =
      '<div class="andx-reply-pill-body">' +
      '  <div class="andx-reply-pill-label">Replying to</div>' +
      '  <div class="andx-reply-pill-text"></div>' +
      '</div>' +
      '<button class="andx-reply-pill-x" type="button" title="Cancel reply">×</button>';
    pill.querySelector('.andx-reply-pill-text').textContent = preview;
    pill.querySelector('.andx-reply-pill-x').onclick = function () {
      pendingReplyTo = null;
      hideReplyToPill();
    };
    var bar = document.getElementById('andx-input-bar');
    if (bar && bar.parentNode) bar.parentNode.insertBefore(pill, bar);
  }
  function hideReplyToPill() {
    var pill = document.getElementById('andx-reply-pill');
    if (pill && pill.parentNode) pill.parentNode.removeChild(pill);
  }

  // Wire long-press to the reaction palette
  attachLongPress(showReactionPalette);

  /* ── Send message ────────────────────────────────────── */
  function __andxSend() {
    var question = input.value.trim();
    if (!question) return;

    // ── Live-agent branch: route messages to the ticket, not the AI ──
    if (liveAgent.active) {
      input.value = '';
      var liveMid = newMessageId();
      appendBubble('user', question, liveMid);
      var liveReplyTo = pendingReplyTo;
      pendingReplyTo = null;
      hideReplyToPill();
      chatHistory.push({ id: liveMid, role: 'user', content: question, ts: Date.now(), reply_to: liveReplyTo || undefined }); saveChatHistory();

      fetch(API_BASE + '/api/handoff-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticket_id: liveAgent.ticketId,
          ticket_token: liveAgent.ticketToken,
          message: question,
          reply_to: liveReplyTo || undefined
        })
      })
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (res) {
          if (!res.j || !res.j.ok) {
            appendBubble('ai', (res.j && res.j.message) ||
              'Your message didn\u2019t go through. Please try again or call 888-343-4394.');
          }
        })
        .catch(function () {
          appendBubble('ai', 'Connection hiccup. Please try again or call 888-343-4394.');
        });

      // Make sure polling is running
      startLiveAgentPolling();
      return;
    }

    // Block if a previous request/stream is still in flight. This stops the
    // double-chip glitch where two answers come back from one click sequence.
    if (isStreaming || pendingAskController) {
      return;
    }

    input.value = '';
    isStreaming = true;
    userInteracted = true;
    sendBtn.disabled = true;

    // Hide welcome chips so a fast second-tap can't fire another send
    var welcomeEl = document.getElementById('andx-w-welcome');
    if (welcomeEl) welcomeEl.remove();

    // FAB typing badge
    var badge = document.createElement('div');
    badge.className = 'andx-fab-badge';
    badge.id = 'andx-fab-badge';
    badge.innerHTML = '<div class="andx-fab-badge-dot"></div><div class="andx-fab-badge-dot"></div><div class="andx-fab-badge-dot"></div>';
    fab.appendChild(badge);

    var userMid = newMessageId();
    appendBubble('user', question, userMid);
    var askReplyTo = pendingReplyTo;
    pendingReplyTo = null;
    hideReplyToPill();
    chatHistory.push({ id: userMid, role: 'user', content: question, ts: Date.now(), reply_to: askReplyTo || undefined }); saveChatHistory();
    appendTyping();

    var autoNav = /\b(take me|open|go to|navigate)\b/i.test(question);

    var controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    pendingAskController = controller;

    fetch(API_BASE + '/api/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question: question,
        mode: chatMode,
        session_id: sessionId,
        history: chatHistory.slice(-10),
        reply_to: askReplyTo || undefined
      }),
      signal: controller ? controller.signal : undefined
    })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      // If Clear (or another reset) ran while we were waiting, drop the response
      if (pendingAskController !== controller) return;
      pendingAskController = null;

      removeTyping();
      var fabBadge = document.getElementById('andx-fab-badge');
      if (fabBadge) fabBadge.remove();
      var answer = data.answer || data.response || 'Sorry, something went wrong.';
      answer = answer.replace(/\n\n+/g, '<br><br>').replace(/\n/g, '<br>');
      var linked = renderQuoteBlocks(linkifyUrls(answer));

      var aiMid = newMessageId();
      var row = appendBubble('ai', linked, aiMid);
      var bubble = row.querySelector('.andx-bubble-ai');

      chatHistory.push({ id: aiMid, role: 'assistant', content: answer, ts: Date.now() }); saveChatHistory();

      streamReveal(bubble, function () {
        isStreaming = false;
        sendBtn.disabled = false;
        renderActionButtons(linked, thread);
        if (data.handoff_offer) {
          renderHandoffCard(thread, question);
        }
        renderFollowUps(data.follow_ups || data.followUps || []);

        // Auto-navigate
        if (autoNav) {
          var urlMatch = answer.match(/https?:\/\/[^\s<)"]+/);
          if (!urlMatch) {
            var domainMatch = answer.match(/(?:platform\.andx\.one|analytics\.andx\.ai|(?:news\.)?andx\.ai|(?:news\.)?andxus\.io|onelink\.to\/nfgq9a)(?:\/[^\s<)")]*)?/);
            if (domainMatch) urlMatch = ['https://' + domainMatch[0]];
          }
          if (urlMatch) {
            setTimeout(function () { window.open(urlMatch[0], '_blank'); }, 1500);
          }
        }
      });
    })
    .catch(function (err) {
      // Aborted by Clear \u2192 silently drop, the cleanup already ran in __andxClear
      if (err && err.name === 'AbortError') { return; }
      if (pendingAskController === controller) pendingAskController = null;
      removeTyping();
      var fabBadge = document.getElementById('andx-fab-badge');
      if (fabBadge) fabBadge.remove();
      appendErrorBubble('Connection error \u2014 couldn\u2019t reach ANDX.', question);
      isStreaming = false;
      sendBtn.disabled = false;
    });
  }

  // Error bubble with a Retry button. `originalQuestion` is re-sent on click.
  function appendErrorBubble(message, originalQuestion) {
    var row = document.createElement('div');
    row.className = 'andx-msg andx-msg-ai';
    row.innerHTML =
      '<div class="andx-avatar andx-avatar-sm">AI</div>' +
      '<div class="andx-ai-col">' +
      '  <div class="andx-sender">ANDX AI</div>' +
      '  <div class="andx-bubble andx-bubble-ai"></div>' +
      '</div>';
    var bubble = row.querySelector('.andx-bubble-ai');
    bubble.textContent = message;
    if (originalQuestion) {
      var retry = document.createElement('button');
      retry.className = 'andx-retry-btn';
      retry.type = 'button';
      retry.innerHTML = '<svg viewBox="0 0 24 24"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg> Retry';
      retry.onclick = function () {
        if (isStreaming || pendingAskController) return;
        retry.disabled = true;
        retry.style.opacity = '.4';
        // Drop the error bubble and resend the original question
        row.remove();
        input.value = originalQuestion;
        __andxSend();
      };
      bubble.appendChild(document.createElement('br'));
      bubble.appendChild(retry);
    }
    thread.appendChild(row);
    scrollToBottom();
  }

  /* ── Helpers ─────────────────────────────────────────── */
  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function scrollToBottom(force) {
    // If the user scrolled up to read older messages, don't yank them down —
    // just bump the "New ↓" button instead. force=true overrides (e.g. on send).
    if (!force && isUserScrolledUp()) {
      bumpNewMessages();
      return;
    }
    thread.scrollTop = thread.scrollHeight;
    hideScrollLatest();
  }

  function isUserScrolledUp() {
    if (!thread) return false;
    var distance = thread.scrollHeight - thread.clientHeight - thread.scrollTop;
    return distance > 80; // px
  }

  var _newMsgCount = 0;
  function bumpNewMessages() {
    _newMsgCount++;
    var btn = document.getElementById('andx-scroll-latest');
    var count = document.getElementById('andx-sl-count');
    if (btn) btn.classList.add('visible');
    if (count) {
      count.textContent = String(_newMsgCount);
      count.style.display = 'inline-block';
    }
  }
  function hideScrollLatest() {
    _newMsgCount = 0;
    var btn = document.getElementById('andx-scroll-latest');
    var count = document.getElementById('andx-sl-count');
    if (btn) btn.classList.remove('visible');
    if (count) { count.textContent = '0'; count.style.display = 'none'; }
  }

  /* ── Action buttons below AI responses ────────────────── */
  function renderActionButtons(html, targetThread) {
    var urlMap = [
      { pattern: 'platform.andx.one/login', label: 'Log In', url: 'https://platform.andx.one/login' },
      { pattern: 'platform.andx.one', label: 'Sign Up', url: 'https://platform.andx.one' },
      { pattern: 'andxus.io/tokenization', label: 'View Tokenization', url: 'https://andxus.io/tokenization' },
      { pattern: 'andxus.io/about-us', label: 'Meet the Team', url: 'https://andxus.io/about-us' },
      { pattern: 'andxus.io/why-andx', label: 'Why ANDX', url: 'https://andxus.io/why-andx' },
      { pattern: 'analytics.andx.ai', label: 'Open AI Analytics', url: 'https://analytics.andx.ai' },
      { pattern: 'news.andx.ai', label: 'Market Dashboard', url: 'https://news.andx.ai' },
      { pattern: 'onelink.to/nfgq9a', label: 'Download App', url: 'https://onelink.to/nfgq9a' },
    ];
    var found = [];
    urlMap.forEach(function(u) {
      if (html.includes(u.pattern) && !found.some(function(f) { return f.label === u.label; })) {
        found.push(u);
      }
    });
    if (!found.length) return;
    var wrap = document.createElement('div');
    wrap.className = 'andx-w-actions';
    found.forEach(function(u) {
      var btn = document.createElement('button');
      btn.className = 'andx-w-action-btn';
      btn.textContent = u.label;
      btn.onclick = function() { window.open(u.url, '_blank'); };
      wrap.appendChild(btn);
    });
    targetThread.appendChild(wrap);
    scrollToBottom();
  }

  /* ── Live agent handoff card ─────────────────────────── */
  var PHONE_ICON_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.86 19.86 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.86 19.86 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>';
  var SEND_ICON_SVG = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>';
  var EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  /* Agent availability — backend-determined. Cached for the session. */
  var _agentStatus = { available: null, fetchedAt: 0, inflight: null };
  function fetchAgentStatus() {
    var now = Date.now();
    // Cache for 60s to avoid hammering the endpoint when the panel re-renders
    if (_agentStatus.available !== null && (now - _agentStatus.fetchedAt) < 60000) {
      return Promise.resolve(_agentStatus.available);
    }
    if (_agentStatus.inflight) return _agentStatus.inflight;
    _agentStatus.inflight = fetch(API_BASE + '/api/agent-status', { method: 'GET' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        _agentStatus.inflight = null;
        if (j && typeof j.available === 'boolean') {
          _agentStatus.available = j.available;
          _agentStatus.fetchedAt = Date.now();
          return j.available;
        }
        // Fallback: assume available so users can still submit a query
        _agentStatus.available = true;
        _agentStatus.fetchedAt = Date.now();
        return true;
      })
      .catch(function () {
        _agentStatus.inflight = null;
        _agentStatus.available = true;
        _agentStatus.fetchedAt = Date.now();
        return true;
      });
    return _agentStatus.inflight;
  }
  function buildStatusRow(state) {
    // state: 'loading' | 'online' | 'offline' | 'offline-confirm'
    var dotClass;
    if (state === 'offline' || state === 'offline-confirm') dotClass = 'closed';
    else if (state === 'loading') dotClass = 'loading';
    else dotClass = '';
    var headline, sub;
    if (state === 'loading') {
      headline = 'Checking agent availability…';
      sub = '';
    } else if (state === 'online') {
      headline = 'An agent is available now';
      sub = 'Send a message to start a real-time chat.';
    } else if (state === 'offline-confirm') {
      headline = 'Message received';
      sub = 'An agent will reply by email shortly.';
    } else {
      headline = 'No agents available right now';
      sub = 'Leave your message and an agent will reply by email.';
    }
    return '<div class="andx-handoff-status-row">' +
           '<span class="andx-handoff-status-dot ' + dotClass + '"></span>' +
           '<div class="andx-handoff-status-text">' +
           '<strong>' + headline + '</strong>' +
           (sub ? '<span>' + sub + '</span>' : '') +
           '</div></div>';
  }

  function renderHandoffCard(targetThread, lastMessage, skipConfirm) {
    // Don't double-render if one is already active in this conversation turn
    var existing = targetThread.querySelector('.andx-handoff-wrap[data-live="1"]');
    if (existing) return;

    var wrap = document.createElement('div');
    wrap.className = 'andx-handoff-wrap';
    wrap.setAttribute('data-live', '1');
    wrap.innerHTML =
      buildStatusRow('loading') +
      '<div class="andx-handoff-form-host"></div>' +
      '<div class="andx-handoff-status" style="display:none"></div>';
    targetThread.appendChild(wrap);
    scrollToBottom();

    var formHost = wrap.querySelector('.andx-handoff-form-host');
    var status = wrap.querySelector('.andx-handoff-status');

    fetchAgentStatus().then(function (online) {
      var newRow = document.createElement('div');
      newRow.innerHTML = buildStatusRow(online ? 'online' : 'offline');
      var rep = newRow.firstChild;
      var old = wrap.querySelector('.andx-handoff-status-row');
      if (old && rep) old.parentNode.replaceChild(rep, old);
      showContactForm(online);
    });

    function showContactForm(online) {
      formHost.innerHTML = '';
      var btnLabel = online
        ? (SEND_ICON_SVG + ' Start live chat')
        : (SEND_ICON_SVG + ' Send message');
      var msgPlaceholder = online
        ? 'How can we help? (you can keep typing once chat starts)'
        : 'Type your question — an agent will reply by email';
      var btnExtraClass = online ? '' : ' email-mode';

      var form = document.createElement('div');
      form.className = 'andx-handoff-form';
      form.innerHTML =
        '<div class="andx-handoff-section">' +
        '  <div class="andx-handoff-label">Your message</div>' +
        '  <textarea class="andx-handoff-input andx-handoff-textarea" data-field="message" placeholder="' + msgPlaceholder + '" rows="3"></textarea>' +
        '</div>' +
        '<div class="andx-handoff-section">' +
        '  <div class="andx-handoff-label">' + (online ? 'Email (optional)' : 'Email (required so we can reply)') + '</div>' +
        '  <input class="andx-handoff-input" data-field="email" type="email" placeholder="' + (online ? 'you@example.com (optional)' : 'you@example.com') + '" autocomplete="email" inputmode="email">' +
        '</div>' +
        '<div class="andx-handoff-section">' +
        '  <div class="andx-handoff-label">Name (optional)</div>' +
        '  <input class="andx-handoff-input" data-field="name" type="text" placeholder="Your name" autocomplete="name">' +
        '</div>' +
        '<div class="andx-handoff-err" data-err="1">Please type a short message so the agent knows what to help with.</div>' +
        '<button class="andx-handoff-btn' + btnExtraClass + '" type="button" data-step="submit">' + btnLabel + '</button>' +
        // Phone line shares hours with chat — only surface it when agents are on shift.
        (online
          ? ('<div class="andx-handoff-divider">or call now</div>' +
             '<div class="andx-handoff-call">' +
             '  <div class="andx-handoff-call-text">Prefer to talk?<strong>888-343-4394</strong></div>' +
             '  <a class="andx-handoff-call-btn" href="tel:+18883434394">' + PHONE_ICON_SVG + ' Call</a>' +
             '</div>')
          : '');
      formHost.appendChild(form);

      var msgInput = form.querySelector('[data-field="message"]');
      var emailInput = form.querySelector('[data-field="email"]');
      var nameInput = form.querySelector('[data-field="name"]');
      var errEl = form.querySelector('[data-err="1"]');
      var submitBtn = form.querySelector('[data-step="submit"]');

      // Pre-fill with the user's last bot message so the agent has context,
      // but the user can edit before sending.
      if (lastMessage && lastMessage !== 'User requested to speak with a live agent.') {
        try { msgInput.value = lastMessage; } catch (e) {}
      }

      setTimeout(function () {
        try { (msgInput.value ? emailInput : msgInput).focus(); } catch (e) {}
      }, 80);

      emailInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); submitBtn.click(); }
      });
      nameInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); submitBtn.click(); }
      });

      submitBtn.onclick = function () {
        var email = emailInput.value.trim();
        var name = nameInput.value.trim();
        var message = msgInput.value.trim();

        // Message always required. Email required ONLY when offline — that's
        // the only way the agent can reach the visitor when they reply later.
        // Online: email is optional (chat happens live in the bubble).
        var msgOK = message.length >= 2;
        var emailRequired = !online;
        var emailFilled = !!email;
        var emailLooksValid = EMAIL_RX.test(email);
        var emailOK = emailRequired
          ? (emailFilled && emailLooksValid)
          : (!emailFilled || emailLooksValid);

        if (!msgOK) {
          errEl.textContent = 'Please type a short message so the agent knows what to help with.';
          errEl.style.display = 'block';
          msgInput.focus();
          return;
        }
        if (!emailOK) {
          if (emailRequired && !emailFilled) {
            errEl.textContent = 'Please enter your email so the agent can reply to you.';
          } else {
            errEl.textContent = 'That email doesn\'t look valid — please double-check it.';
          }
          errEl.style.display = 'block';
          emailInput.focus();
          return;
        }
        errEl.style.display = 'none';

        submitBtn.disabled = true;
        msgInput.disabled = true;
        emailInput.disabled = true;
        nameInput.disabled = true;
        submitBtn.innerHTML = SEND_ICON_SVG + (online ? ' Connecting…' : ' Sending…');

        status.style.display = 'block';
        status.textContent = online
          ? 'One moment while we reach an agent…'
          : 'Sending your message to the support team…';

        var payload = {
          initial_message: message,
          last_message: lastMessage || message,
          email: email,
          name: name,
          history: chatHistory.slice(-20).map(function (m) {
            return { role: m.role, content: m.content };
          }),
          page_url: (typeof window !== 'undefined' && window.location) ? window.location.href : '',
          session_id: sessionId
        };

        fetch(API_BASE + '/api/handoff', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        })
          .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
          .then(function (res) {
            wrap.setAttribute('data-live', '0');
            if (res.j && res.j.ok) {
              form.remove();
              // Replace the status row with a "received" banner instead of a title rewrite
              var statusRow = wrap.querySelector('.andx-handoff-status-row');
              if (statusRow) {
                var newRow = document.createElement('div');
                newRow.innerHTML = buildStatusRow(res.j.agents_available ? 'online' : 'offline-confirm');
                if (newRow.firstChild) statusRow.parentNode.replaceChild(newRow.firstChild, statusRow);
              }
              status.textContent = res.j.message || (res.j.agents_available
                ? 'A live agent will be with you shortly.'
                : 'Got it — an agent will reply by email shortly.');
              if (res.j.agents_available) {
                enterLiveAgentMode({
                  ticketId: res.j.ticket_id,
                  ticketToken: res.j.ticket_token,
                  startTs: res.j.start_ts || Math.floor(Date.now() / 1000),
                  email: email,
                  name: name
                });
              }
              // Offline path: ticket is in Zoho, agent will reply via email.
              // We do NOT enter live-agent mode so the AI chat resumes normally.
            } else {
              submitBtn.disabled = false;
              msgInput.disabled = false;
              emailInput.disabled = false;
              nameInput.disabled = false;
              submitBtn.innerHTML = SEND_ICON_SVG + ' Try again';
              status.textContent = (res.j && res.j.message) || 'We had trouble sending that. Please email support@andxus.io or call 888-343-4394.';
            }
            scrollToBottom();
          })
          .catch(function () {
            wrap.setAttribute('data-live', '0');
            submitBtn.disabled = false;
            msgInput.disabled = false;
            emailInput.disabled = false;
            nameInput.disabled = false;
            submitBtn.innerHTML = SEND_ICON_SVG + ' Try again';
            status.textContent = 'Connection error. Please email support@andxus.io and we\'ll respond quickly.';
            scrollToBottom();
          });
      };

      scrollToBottom();
    }
  }

  /* ── Live-agent mode: enter, exit, poll, render replies ──── */
  function enterLiveAgentMode(opts) {
    liveAgent.active = true;
    liveAgent.ticketId = opts.ticketId || '';
    liveAgent.ticketToken = opts.ticketToken || '';
    liveAgent.sinceTs = opts.startTs || Math.floor(Date.now() / 1000);
    liveAgent.email = opts.email || '';
    liveAgent.name = opts.name || '';
    liveAgent.agentResponded = false;
    saveLiveAgent();
    applyLiveAgentHeader(true);
    try { input.setAttribute('placeholder', 'Message the live agent\u2026'); } catch (e) {}
    addEndLiveButton();
    renderQueueCard();
    startQueuePolling();
    startLiveAgentPolling();
    // Ask once for browser notification permission so unfocused-tab alerts can fire
    ensureNotificationPermission();
  }

  function exitLiveAgentMode(showNote) {
    // Best-effort: tell the backend to close this Zoho ticket so we free up
    // the visitor's queue spot for everyone else immediately.
    if (liveAgent.ticketId && liveAgent.ticketToken) {
      try {
        var endPayload = JSON.stringify({
          ticket_id: liveAgent.ticketId,
          ticket_token: liveAgent.ticketToken,
        });
        // keepalive lets the request survive even if we're tearing the panel down
        fetch(API_BASE + '/api/handoff-end', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: endPayload,
          keepalive: true,
        }).catch(function () {});
      } catch (e) {}
    }
    if (liveAgent.pollTimer) {
      clearInterval(liveAgent.pollTimer);
      liveAgent.pollTimer = null;
    }
    if (liveAgent.queueTimer) {
      clearInterval(liveAgent.queueTimer);
      liveAgent.queueTimer = null;
    }
    removeQueueCard();
    hideLiveWithAgentPill();
    liveAgent.active = false;
    liveAgent.ticketId = '';
    liveAgent.ticketToken = '';
    liveAgent.sinceTs = 0;
    liveAgent.agentResponded = false;
    saveLiveAgent();
    applyLiveAgentHeader(false);
    try { input.setAttribute('placeholder', 'Ask ANDX anything...'); } catch (e) {}
    var btn = document.getElementById('andx-end-live');
    if (btn) btn.remove();
    var tbtn = document.getElementById('andx-transcript-btn');
    if (tbtn) tbtn.remove();
    if (showNote) {
      appendBubble('ai', 'You\u2019re back with the AI assistant. Ask anything \u2014 I\u2019m here to help.');
    }
  }

  function applyLiveAgentHeader(on) {
    try {
      var titleEl = document.querySelector('.andx-hdr-title');
      var onlineEl = document.querySelector('.andx-online');
      if (titleEl && onlineEl) {
        var existing = document.getElementById('andx-live-badge');
        if (on) {
          if (!existing) {
            var b = document.createElement('span');
            b.id = 'andx-live-badge';
            b.className = 'andx-live-badge';
            b.textContent = 'Live agent';
            titleEl.appendChild(b);
          }
          onlineEl.textContent = 'Connected';
        } else {
          if (existing) existing.remove();
          onlineEl.textContent = 'Online';
        }
      }
      // Toggle the persistent "Chat with live agent" pill — hide it while already live
      var pillBar = document.querySelector('.andx-agent-pill-bar');
      var agentPillEl = document.getElementById('andx-agent-pill');
      if (agentPillEl) agentPillEl.style.display = on ? 'none' : '';
      // Keep the call pill visible always so users can still call from live mode
      if (pillBar && on) {
        pillBar.style.justifyContent = 'center';
      }
    } catch (e) {}
  }

  function addEndLiveButton() {
    // Add a small action row with End chat + Email transcript buttons
    if (document.getElementById('andx-live-actions')) return;
    var row = document.createElement('div');
    row.id = 'andx-live-actions';
    row.style.cssText = 'text-align:center;margin-top:10px;display:flex;gap:6px;justify-content:center;flex-wrap:wrap';

    var endBtn = document.createElement('button');
    endBtn.id = 'andx-end-live';
    endBtn.className = 'andx-end-live';
    endBtn.type = 'button';
    endBtn.textContent = 'End live chat';
    endBtn.style.margin = '0';
    endBtn.onclick = function () {
      if (confirm('End the live chat and return to the AI assistant?')) {
        exitLiveAgentMode(true);
      }
    };

    row.appendChild(endBtn);
    thread.appendChild(row);
  }

  /* ── Queue card ─────────────────────────────────────── */
  function renderQueueCard() {
    if (liveAgent.queueCardEl) return;
    var el = document.createElement('div');
    el.className = 'andx-queue-wrap';
    el.innerHTML =
      '<div class="andx-queue-head">Live agent queue</div>' +
      '<div class="andx-queue-body">' +
      '  <div class="andx-queue-pos">' +
      '    <span class="andx-queue-pos-num">\u2026</span>' +
      '    <span class="andx-queue-pos-label">Checking your place in line</span>' +
      '  </div>' +
      '  <div class="andx-queue-wait">Looking up wait time<span class="andx-queue-dots"><span></span><span></span><span></span></span></div>' +
      '</div>';
    thread.appendChild(el);
    liveAgent.queueCardEl = el;
    scrollToBottom();
  }

  function updateQueueCard(data) {
    // New backend response: state = "queued" | "active" | "ended"
    var state = data.state || (data.active ? 'active' : (data.in_queue ? 'queued' : 'ended'));

    if (state === 'active') {
      // Agent picked up — remove queue card, show "Live with X" pill
      removeQueueCard();
      showLiveWithAgentPill(data.agent_name || liveAgent.agentName || 'Live Agent');
      return;
    }
    if (state === 'ended') {
      // Ticket closed (e.g. another tab pressed Clear) — exit live mode safely
      removeQueueCard();
      if (liveAgent.active) {
        try { exitLiveAgentMode(true); } catch (e) {}
      }
      return;
    }

    var el = liveAgent.queueCardEl;
    if (!el) return;
    var body = el.querySelector('.andx-queue-body');
    if (!body) return;
    if (data.is_next) {
      body.innerHTML =
        '<div class="andx-queue-pos">' +
        '  <span class="andx-queue-next">You’re next!</span>' +
        '</div>' +
        '<div class="andx-queue-wait">A live agent will pick up your chat any moment<span class="andx-queue-dots"><span></span><span></span><span></span></span></div>';
    } else {
      var pos = data.position || 1;
      var total = data.total || pos;
      var eta = data.estimated_wait_min;
      var etaPill = eta ? ('<span class="andx-queue-eta">⏱ ~' + eta + ' min</span>') : '';
      body.innerHTML =
        '<div class="andx-queue-pos">' +
        '  <span class="andx-queue-pos-num">#' + pos + '</span>' +
        '  <span class="andx-queue-pos-label">of ' + total + ' in line</span>' +
        '</div>' +
        etaPill +
        '<div class="andx-queue-wait">We’ll connect you as soon as an agent is free' +
        '<span class="andx-queue-dots"><span></span><span></span><span></span></span></div>';
    }
    scrollToBottom();
  }

  /* "Live with {agent}" status pill — shown above the thread once agent picks up */
  function showLiveWithAgentPill(agentName) {
    if (document.getElementById('andx-live-pill')) return;
    var pill = document.createElement('div');
    pill.className = 'andx-live-pill';
    pill.id = 'andx-live-pill';
    pill.innerHTML =
      '<span class="andx-live-pill-dot"></span>' +
      '<span>Live with <strong>' + escapeHtml(agentName) + '</strong></span>';
    if (thread.firstChild) thread.insertBefore(pill, thread.firstChild);
    else thread.appendChild(pill);
  }
  function hideLiveWithAgentPill() {
    var pill = document.getElementById('andx-live-pill');
    if (pill && pill.parentNode) pill.parentNode.removeChild(pill);
  }

  function removeQueueCard() {
    if (liveAgent.queueCardEl) {
      liveAgent.queueCardEl.style.transition = 'opacity .3s ease, transform .3s ease';
      liveAgent.queueCardEl.style.opacity = '0';
      liveAgent.queueCardEl.style.transform = 'translateY(-6px)';
      var el = liveAgent.queueCardEl;
      setTimeout(function () { if (el && el.parentNode) el.parentNode.removeChild(el); }, 320);
      liveAgent.queueCardEl = null;
    }
  }

  function startQueuePolling() {
    if (liveAgent.queueTimer) return;
    var tick = function () {
      if (!liveAgent.active || !liveAgent.ticketId || liveAgent.agentResponded) {
        if (liveAgent.queueTimer) {
          clearInterval(liveAgent.queueTimer);
          liveAgent.queueTimer = null;
        }
        removeQueueCard();
        return;
      }
      var q = '?ticket_id=' + encodeURIComponent(liveAgent.ticketId) +
              '&ticket_token=' + encodeURIComponent(liveAgent.ticketToken);
      fetch(API_BASE + '/api/handoff-queue' + q, { method: 'GET' })
        .then(function (r) { return r.json(); })
        .then(function (j) {
          if (!j || !j.ok) return;
          if (j.state === 'active') {
            liveAgent.agentResponded = true;
            if (j.agent_name) liveAgent.agentName = j.agent_name;
          }
          updateQueueCard(j);
        })
        .catch(function () {});
    };
    tick();
    liveAgent.queueTimer = setInterval(tick, 10000);
  }

  /* ── Transcript request ─────────────────────────────── */
  function requestTranscript(btn) {
    if (!liveAgent.active || !liveAgent.ticketId) return;
    if (btn.disabled) return;
    btn.disabled = true;
    var original = btn.innerHTML;
    btn.innerHTML = 'Sending\u2026';

    // Show a small toast above the button
    var toast = btn.querySelector('.andx-transcript-toast');
    if (toast) toast.remove();

    fetch(API_BASE + '/api/handoff-transcript', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ticket_id: liveAgent.ticketId,
        ticket_token: liveAgent.ticketToken
      })
    })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (res) {
        btn.innerHTML = original;
        var t = document.createElement('span');
        t.className = 'andx-transcript-toast';
        if (res.j && res.j.ok) {
          t.style.color = '#1de4d3';
          t.style.borderColor = 'rgba(29,228,211,.4)';
          t.textContent = '\u2713 Sent to ' + (liveAgent.email || 'your email');
          btn.style.position = 'relative';
          btn.appendChild(t);
          setTimeout(function () { if (t && t.parentNode) t.parentNode.removeChild(t); btn.disabled = false; }, 4000);
        } else {
          t.style.color = '#ff8e8e';
          t.style.borderColor = 'rgba(255,142,142,.4)';
          t.textContent = (res.j && res.j.message) || 'Couldn\u2019t send transcript';
          btn.style.position = 'relative';
          btn.appendChild(t);
          setTimeout(function () { if (t && t.parentNode) t.parentNode.removeChild(t); btn.disabled = false; }, 4000);
        }
      })
      .catch(function () {
        btn.innerHTML = original;
        btn.disabled = false;
      });
  }

  /* ── Unfocused-tab alerts: title flash + browser notification + soft beep ── */
  var _origTitle = (typeof document !== 'undefined') ? document.title : '';
  var _titleFlashTimer = null;
  var _unreadCount = 0;

  function flashTitle() {
    if (!document.hidden) return;
    _unreadCount++;
    if (_titleFlashTimer) return;
    var on = true;
    _titleFlashTimer = setInterval(function () {
      if (!document.hidden) { stopTitleFlash(); return; }
      document.title = on ? ('(' + _unreadCount + ') New message — ANDX') : _origTitle;
      on = !on;
    }, 1000);
  }
  function stopTitleFlash() {
    if (_titleFlashTimer) { clearInterval(_titleFlashTimer); _titleFlashTimer = null; }
    _unreadCount = 0;
    document.title = _origTitle;
  }
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) stopTitleFlash();
    });
  }

  // Soft beep using Web Audio (no external file needed)
  function playBeep() {
    try {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      var ctx2 = new Ctx();
      var osc = ctx2.createOscillator();
      var gain = ctx2.createGain();
      osc.type = 'sine';
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, ctx2.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.18, ctx2.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx2.currentTime + 0.35);
      osc.connect(gain).connect(ctx2.destination);
      osc.start();
      osc.stop(ctx2.currentTime + 0.4);
      setTimeout(function () { try { ctx2.close(); } catch (e) {} }, 600);
    } catch (e) {}
  }

  function ensureNotificationPermission() {
    try {
      if (!('Notification' in window)) return;
      if (Notification.permission === 'default') {
        // Only ask when we actually need it (agent replies arriving)
        Notification.requestPermission().catch(function () {});
      }
    } catch (e) {}
  }

  function notifyAgentReply(agentName, content) {
    flashTitle();
    if (document.hidden) {
      playBeep();
      try {
        if ('Notification' in window && Notification.permission === 'granted') {
          var preview = (content || '').replace(/\s+/g, ' ').slice(0, 140);
          var n = new Notification(agentName + ' (ANDX Support)', {
            body: preview,
            tag: 'andx-agent-reply',
            silent: false
          });
          n.onclick = function () {
            try { window.focus(); } catch (e) {}
            if (!isOpen) toggleWidget();
            n.close();
          };
        }
      } catch (e) {}
    }
  }

  function appendAgentTyping(agentName) {
    var row = document.createElement('div');
    row.className = 'andx-msg andx-msg-ai andx-row-agent andx-agent-typing';
    var name = (agentName || 'Live Agent').trim();
    var initials = name.split(/\s+/).map(function (x) { return x.charAt(0); }).join('').slice(0, 2).toUpperCase() || 'LA';
    row.innerHTML =
      '<div class="andx-avatar andx-avatar-sm andx-live-avatar">' + escapeHtml(initials) + '</div>' +
      '<div class="andx-ai-col">' +
      '  <div class="andx-sender">' + escapeHtml(name) + '</div>' +
      '  <div class="andx-bubble andx-bubble-ai andx-bubble-agent"><span></span><span></span><span></span></div>' +
      '</div>';
    thread.appendChild(row);
    scrollToBottom();
    return row;
  }

  function appendAgentBubble(content, agentName) {
    var row = document.createElement('div');
    row.className = 'andx-msg andx-msg-ai andx-row-agent';
    var name = (agentName || 'Live Agent').trim();
    var initials = name.split(/\s+/).map(function (x) { return x.charAt(0); }).join('').slice(0, 2).toUpperCase() || 'LA';
    var mid = newMessageId();
    row.setAttribute('data-msg-id', mid);
    row.innerHTML =
      '<div class="andx-avatar andx-avatar-sm andx-live-avatar">' + escapeHtml(initials) + '</div>' +
      '<div class="andx-ai-col">' +
      '  <div class="andx-sender">' + escapeHtml(name) + '</div>' +
      '  <div class="andx-bubble andx-bubble-ai andx-bubble-agent" data-msg-id="' + mid + '" data-msg-role="agent"></div>' +
      '</div>';
    var bubble = row.querySelector('.andx-bubble-agent');
    var safeContent = escapeHtml(content).replace(/\n\n+/g, '<br><br>').replace(/\n/g, '<br>');
    bubble.innerHTML = linkifyUrls(safeContent);
    thread.appendChild(row);
    chatHistory.push({ id: mid, role: 'agent', content: content, agent_name: name, ts: Date.now() }); saveChatHistory();
    scrollToBottom();
  }

  function startLiveAgentPolling() {
    if (liveAgent.pollTimer) return;
    var tick = function () {
      if (!liveAgent.active || !liveAgent.ticketId) {
        clearInterval(liveAgent.pollTimer);
        liveAgent.pollTimer = null;
        return;
      }
      var q = '?ticket_id=' + encodeURIComponent(liveAgent.ticketId) +
              '&ticket_token=' + encodeURIComponent(liveAgent.ticketToken) +
              '&since_ts=' + encodeURIComponent(liveAgent.sinceTs || 0);
      fetch(API_BASE + '/api/handoff-poll' + q, { method: 'GET' })
        .then(function (r) { return r.json(); })
        .then(function (j) {
          if (!j || !j.ok) return;
          var replies = j.replies || [];
          if (replies.length && !liveAgent.agentResponded) {
            // First agent response — exit queue immediately
            liveAgent.agentResponded = true;
            removeQueueCard();
            if (liveAgent.queueTimer) {
              clearInterval(liveAgent.queueTimer);
              liveAgent.queueTimer = null;
            }
          }
          // Show typing dots briefly before each new agent reply lands so it
          // feels like a live conversation instead of a teleport.
          (function deliverReplies(idx) {
            if (idx >= replies.length) { saveLiveAgent(); return; }
            var rep = replies[idx];
            if (rep.ts && rep.ts > liveAgent.sinceTs) liveAgent.sinceTs = rep.ts;
            if (rep.agent_name) liveAgent.agentName = rep.agent_name;
            var typing = appendAgentTyping(rep.agent_name || liveAgent.agentName);
            setTimeout(function () {
              if (typing && typing.parentNode) typing.parentNode.removeChild(typing);
              appendAgentBubble(rep.content, rep.agent_name || liveAgent.agentName);
              notifyAgentReply(rep.agent_name || liveAgent.agentName, rep.content);
              setTimeout(function () { deliverReplies(idx + 1); }, 200);
            }, 700);
          })(0);
        })
        .catch(function () {});
    };
    tick();
    liveAgent.pollTimer = setInterval(tick, 4000);
  }

  /* Live-agent UI is restored in toggleWidget() when the panel opens \u2014
     the thread DOM is wiped on showWelcome, so deferring until open is safer. */

  /* Page unload: free the queue spot so others' positions update immediately.
     navigator.sendBeacon survives even when the tab is closing - fetch can't. */
  window.addEventListener('beforeunload', function () {
    if (!liveAgent.active || !liveAgent.ticketId || !liveAgent.ticketToken) return;
    try {
      var payload = JSON.stringify({
        ticket_id: liveAgent.ticketId,
        ticket_token: liveAgent.ticketToken
      });
      if (navigator.sendBeacon) {
        var blob = new Blob([payload], { type: 'application/json' });
        navigator.sendBeacon(API_BASE + '/api/handoff-end', blob);
      } else {
        fetch(API_BASE + '/api/handoff-end', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payload,
          keepalive: true
        }).catch(function () {});
      }
    } catch (e) {}
  });

  /* ── Chip handler ────────────────────────────────────── */
  window.__andxChip = function (el) {
    // Block subsequent chip clicks while a request is in flight so two quick
    // taps don't fire two parallel /api/ask requests.
    if (isStreaming || pendingAskController) return;
    if (el && el.dataset && el.dataset.locked === '1') return;
    if (el && el.dataset) el.dataset.locked = '1';
    input.value = el.textContent;
    __andxSend();
  };

  /* ── Resize observer for canvas ──────────────────────── */
  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(function () {
      if (isOpen && !isMinimized) {
        resizeCanvas();
      }
    }).observe(panel);
  }

  /* ── Init welcome ────────────────────────────────────── */
  showWelcome();

  /* Bot only opens when user clicks the bubble — no auto-open */

})();
