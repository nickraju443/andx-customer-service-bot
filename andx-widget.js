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
  var chatMode = 'beginner';
  var chatHistory = [];
  var sessionId = 'widget-' + Math.random().toString(36).substr(2, 9);
  var particleRAF = null;
  var particles = [];
  var userInteracted = false;

  /* drag state */
  var dragState = {
    active: false,
    startX: 0, startY: 0,
    panelX: 0, panelY: 0,
    offsetX: 0, offsetY: 0,
    moved: false
  };

  /* ── SVG Icons ──────────────────────────────────────── */
  var CHAT_ICON = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
  var CLOSE_ICON = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';

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
#andx-fab{position:fixed;bottom:24px;right:24px;width:56px;height:56px;border-radius:50%;background:linear-gradient(135deg,#724dfb,#1de4d3);border:none;cursor:pointer;z-index:10000;display:flex;align-items:center;justify-content:center;animation:andxBreath 3s ease-in-out infinite;transition:transform .2s ease;box-shadow:0 4px 20px rgba(114,77,251,.35)}
#andx-fab:hover{transform:scale(1.08)}
#andx-fab svg{pointer-events:none}

/* Tooltip */
#andx-tooltip{position:fixed;bottom:88px;right:24px;background:#1a1430;color:#fff;font-size:13px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;padding:10px 16px;border-radius:10px;border:1px solid rgba(114,77,251,.25);box-shadow:0 4px 20px rgba(0,0,0,.4);z-index:10001;cursor:pointer;animation:andxTooltipIn .3s ease;white-space:nowrap}
#andx-tooltip::after{content:'';position:absolute;bottom:-7px;right:22px;width:12px;height:12px;background:#1a1430;border-right:1px solid rgba(114,77,251,.25);border-bottom:1px solid rgba(114,77,251,.25);transform:rotate(45deg)}

/* Panel */
#andx-panel{position:fixed;bottom:92px;right:24px;width:420px;height:620px;min-width:320px;min-height:350px;max-width:600px;max-height:82vh;background:#08061a;border:1px solid rgba(114,77,251,.3);border-radius:18px;z-index:10000;display:none;flex-direction:column;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;resize:both}
#andx-panel.andx-open{display:flex;animation:andxPanelIn .28s ease forwards}
#andx-panel.andx-closing{animation:andxPanelOut .2s ease forwards}
#andx-panel::before{content:'';position:absolute;inset:-1px;border-radius:17px;padding:1px;background:linear-gradient(var(--andx-ba,0deg),#724dfb,#1de4d3,#724dfb);background-size:300% 300%;animation:andxGradBorder 4s ease infinite;-webkit-mask:linear-gradient(#fff 0 0) content-box,linear-gradient(#fff 0 0);-webkit-mask-composite:xor;mask-composite:exclude;pointer-events:none;z-index:0}

/* Particle canvas */
#andx-particles{display:none}

/* Header */
#andx-header{position:relative;z-index:1;display:flex;align-items:center;gap:12px;padding:16px 16px;background:linear-gradient(135deg,rgba(114,77,251,.18),rgba(29,228,211,.05));border-bottom:2px solid;border-image:linear-gradient(90deg,#724dfb,#1de4d3) 1;cursor:grab;user-select:none;flex-shrink:0;overflow:hidden}
#andx-header.andx-grabbing{cursor:grabbing}
.andx-hdr-dots{position:absolute;width:4px;height:4px;border-radius:50%;background:rgba(114,77,251,.35);pointer-events:none}
.andx-avatar{width:42px;height:42px;border-radius:50%;background:linear-gradient(135deg,#724dfb,#1de4d3);display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:#fff;flex-shrink:0;box-shadow:0 0 20px rgba(114,77,251,.4),0 0 40px rgba(29,228,211,.15)}
.andx-avatar-sm{width:24px;height:24px;font-size:9px;flex-shrink:0}
.andx-hdr-info{flex:1;min-width:0}
.andx-hdr-title{font-size:16px;font-weight:700;color:#fff;line-height:1.2}
.andx-hdr-sub{font-size:11px;color:rgba(255,255,255,.5);line-height:1.3;display:flex;align-items:center;gap:6px}
.andx-online{color:#22c55e;font-size:10px;font-weight:600}
.andx-status{width:7px;height:7px;border-radius:50%;background:#22c55e;animation:andxPulse 2s ease infinite;flex-shrink:0;display:inline-block}
.andx-hdr-btns{display:flex;gap:5px;flex-shrink:0}
.andx-hdr-btn{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);color:rgba(255,255,255,.6);font-size:11px;padding:4px 10px;border-radius:7px;cursor:pointer;transition:all .15s}
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

/* Message rows */
.andx-msg{display:flex;gap:8px;animation:andxMsgIn .35s ease;max-width:100%}
.andx-msg-user{flex-direction:row-reverse}
.andx-msg-ai{flex-direction:row;align-items:flex-start}

/* Sender label */
.andx-sender{font-size:10px;color:rgba(255,255,255,.4);margin-bottom:3px;display:flex;align-items:center;gap:5px}
.andx-sender::before{content:'';width:6px;height:6px;border-radius:50%;background:#22c55e;display:inline-block}

/* Bubbles */
.andx-bubble{padding:14px 16px;font-size:14px;line-height:1.6;word-break:break-word;position:relative}
.andx-bubble-user{background:linear-gradient(135deg,#724dfb,#9d7dff);color:#fff;border-radius:14px 14px 4px 14px;min-width:60px;max-width:75%;box-shadow:0 2px 10px rgba(114,77,251,.25),inset 0 1px 0 rgba(255,255,255,.1)}
.andx-bubble-ai{background:linear-gradient(135deg,rgba(114,77,251,.08),rgba(20,16,40,.95));color:rgba(255,255,255,.92);border-radius:4px 14px 14px 14px;max-width:80%;border-top:1px solid;border-image:linear-gradient(90deg,#724dfb,#1de4d3) 1;animation:andxBubbleGlow 3s ease infinite}
.andx-bubble-ai strong{color:#1de4d3}
.andx-bubble-user strong{color:#fff}
.andx-bubble-ai a{color:#1de4d3;text-decoration:underline}
.andx-bubble-ai a:hover{color:#5ef0e3}

/* AI content column */
.andx-ai-col{display:flex;flex-direction:column;max-width:80%;min-width:0}

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
#andx-send{background:transparent;border:2px solid #724dfb;color:#724dfb;width:42px;height:42px;border-radius:50%;cursor:pointer;transition:all .2s;display:flex;align-items:center;justify-content:center;flex-shrink:0;padding:0}
#andx-send:hover{background:rgba(114,77,251,.15)}
#andx-send svg{stroke:#724dfb}
#andx-send:hover{opacity:.88}
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

/* Mobile */
@media(max-width:500px){
  #andx-fab{width:50px;height:50px;bottom:90px;right:16px}
  #andx-tooltip{bottom:150px;right:16px;font-size:12px}
  #andx-panel{width:100vw;height:100vh;right:0;bottom:0;top:0;left:0;max-height:100vh;border-radius:0;resize:none}
  #andx-panel::before{border-radius:0}
  .andx-chip{font-size:11px;padding:10px 8px}
}
`;
  document.head.appendChild(css);

  /* ── Build DOM ───────────────────────────────────────── */

  // FAB
  var fab = document.createElement('button');
  fab.id = 'andx-fab';
  fab.innerHTML = CHAT_ICON;
  fab.setAttribute('aria-label', 'Open ANDX chat');
  fab.onclick = function () { toggleWidget(); };
  document.body.appendChild(fab);

  // Tooltip
  function showTooltip() {
    if (sessionStorage.getItem('andx-tooltip-shown') || isOpen) return;
    sessionStorage.setItem('andx-tooltip-shown', '1');
    var tt = document.createElement('div');
    tt.id = 'andx-tooltip';
    tt.textContent = 'Need help? Chat with us';
    tt.onclick = function () {
      tt.remove();
      if (!isOpen) toggleWidget();
    };
    document.body.appendChild(tt);
    setTimeout(function () {
      if (tt.parentNode) tt.remove();
    }, 6000);
  }
  setTimeout(showTooltip, 3000);

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
  sendBtn.addEventListener('click', function () { __andxSend(); });

  /* ── Drag logic (header only, 5px threshold) ─────────── */
  header.addEventListener('mousedown', function (e) {
    // Ignore if clicking a button
    if (e.target.closest('[data-action]') || e.target.closest('button')) return;

    var rect = panel.getBoundingClientRect();
    dragState.startX = e.clientX;
    dragState.startY = e.clientY;
    dragState.panelX = rect.left;
    dragState.panelY = rect.top;
    dragState.moved = false;
    dragState.active = true;

    e.preventDefault();
  });

  document.addEventListener('mousemove', function (e) {
    if (!dragState.active) return;

    var dx = e.clientX - dragState.startX;
    var dy = e.clientY - dragState.startY;

    if (!dragState.moved) {
      if (Math.abs(dx) < 5 && Math.abs(dy) < 5) return;
      dragState.moved = true;
      // Switch to absolute positioning for drag
      panel.style.left = dragState.panelX + 'px';
      panel.style.top = dragState.panelY + 'px';
      panel.style.right = 'auto';
      panel.style.bottom = 'auto';
      header.classList.add('andx-grabbing');
    }

    var newX = dragState.panelX + dx;
    var newY = dragState.panelY + dy;

    // Keep on screen
    newX = Math.max(0, Math.min(newX, window.innerWidth - 100));
    newY = Math.max(0, Math.min(newY, window.innerHeight - 60));

    panel.style.left = newX + 'px';
    panel.style.top = newY + 'px';
  });

  document.addEventListener('mouseup', function () {
    if (dragState.active) {
      dragState.active = false;
      header.classList.remove('andx-grabbing');
    }
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
    if (path.includes('tokenization')) {
      return ['What is tokenization?', 'Tell me about Manila One', 'What token types are available?', 'How does the 6-step process work?', 'What are the target returns?', 'How is tokenization regulated?'];
    } else if (path.includes('why-andx') || path.includes('about')) {
      return ['Who is the CEO?', 'What makes ANDX different?', 'How is ANDX regulated?', 'What is BitGo custody?', 'How many users does ANDX have?', 'Tell me about the team'];
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

      // Reset position to default
      panel.style.left = '';
      panel.style.top = '';
      panel.style.right = '24px';
      panel.style.bottom = '92px';

      fab.innerHTML = CLOSE_ICON;

      // Particles
      resizeCanvas();
      initParticles();
      if (!particleRAF) particleRAF = requestAnimationFrame(animateParticles);

      // Show welcome if no messages
      if (chatHistory.length === 0) showWelcome();

      setTimeout(function () { input.focus(); }, 100);
    }
  }

  function __andxClose() {
    if (!isOpen) return;
    panel.classList.add('andx-closing');
    setTimeout(function () {
      panel.classList.remove('andx-open', 'andx-closing', 'andx-minimized');
      isOpen = false;
      isMinimized = false;
      fab.innerHTML = CHAT_ICON;
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
    chatHistory = [];
    showWelcome();
  }

  /* ── Bubbles ─────────────────────────────────────────── */
  function appendBubble(role, html) {
    // Clear welcome if present
    var welcome = thread.querySelector('.andx-welcome');
    if (welcome) welcome.remove();

    var row = document.createElement('div');
    row.className = 'andx-msg andx-msg-' + role;

    if (role === 'user') {
      row.innerHTML = '<div class="andx-bubble andx-bubble-user">' + escapeHtml(html) + '</div>';
    } else {
      row.innerHTML =
        '<div class="andx-avatar andx-avatar-sm">AI</div>' +
        '<div class="andx-ai-col">' +
        '  <div class="andx-sender">ANDX Intelligence</div>' +
        '  <div class="andx-bubble andx-bubble-ai">' + html + '</div>' +
        '</div>';
    }

    thread.appendChild(row);
    scrollToBottom();
    return row;
  }

  function appendTyping() {
    var row = document.createElement('div');
    row.className = 'andx-msg andx-msg-ai';
    row.id = 'andx-typing-row';
    row.innerHTML =
      '<div class="andx-avatar andx-avatar-sm">AI</div>' +
      '<div class="andx-ai-col">' +
      '  <div class="andx-sender">ANDX Intelligence</div>' +
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
      btn.onclick = (function (text) {
        return function () {
          input.value = text;
          __andxSend();
        };
      })(suggestions[i]);
      wrap.appendChild(btn);
    }
    thread.appendChild(wrap);
    scrollToBottom();
  }

  /* ── Stream reveal (word-by-word) ────────────────────── */
  function streamReveal(bubbleEl, onDone) {
    var fullHTML = bubbleEl.innerHTML;
    bubbleEl.innerHTML = '';

    // Parse into text tokens — keep HTML tags intact
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
      if (idx >= tokens.length) {
        bubbleEl.innerHTML = current;
        if (onDone) onDone();
        return;
      }
      current += tokens[idx];
      idx++;
      bubbleEl.innerHTML = current + cursor;
      scrollToBottom();
      // HTML tags reveal instantly
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
    text = text.replace(/(?<![/"'>])\b((?:platform\.andx\.one|(?:news\.)?andxus\.io)(?:\/[^\s<)"]*)?)/g, function (match) {
      return '<a href="https://' + match + '" target="_blank" rel="noopener">' + match + '</a>';
    });
    return text;
  }

  /* ── Send message ────────────────────────────────────── */
  function __andxSend() {
    var question = input.value.trim();
    if (!question || isStreaming) return;

    input.value = '';
    isStreaming = true;
    userInteracted = true;
    sendBtn.disabled = true;

    // FAB typing badge
    var badge = document.createElement('div');
    badge.className = 'andx-fab-badge';
    badge.id = 'andx-fab-badge';
    badge.innerHTML = '<div class="andx-fab-badge-dot"></div><div class="andx-fab-badge-dot"></div><div class="andx-fab-badge-dot"></div>';
    fab.appendChild(badge);

    appendBubble('user', question);
    chatHistory.push({ role: 'user', content: question });
    appendTyping();

    var autoNav = /\b(take me|open|go to|navigate)\b/i.test(question);

    fetch(API_BASE + '/api/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question: question,
        mode: chatMode,
        session_id: sessionId,
        history: chatHistory.slice(-10)
      })
    })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      removeTyping();
      var fabBadge = document.getElementById('andx-fab-badge');
      if (fabBadge) fabBadge.remove();
      var answer = data.answer || data.response || 'Sorry, something went wrong.';
      answer = answer.replace(/\n\n+/g, '<br><br>').replace(/\n/g, '<br>');
      var linked = linkifyUrls(answer);

      var row = appendBubble('ai', linked);
      var bubble = row.querySelector('.andx-bubble-ai');

      chatHistory.push({ role: 'assistant', content: answer });

      streamReveal(bubble, function () {
        isStreaming = false;
        sendBtn.disabled = false;
        renderActionButtons(linked, thread);
        renderFollowUps(data.follow_ups || data.followUps || []);

        // Auto-navigate
        if (autoNav) {
          var urlMatch = answer.match(/https?:\/\/[^\s<)"]+/);
          if (!urlMatch) {
            var domainMatch = answer.match(/(?:platform\.andx\.one|(?:news\.)?andx\.ai|(?:news\.)?andxus\.io|onelink\.to\/nfgq9a)(?:\/[^\s<)")]*)?/);
            if (domainMatch) urlMatch = ['https://' + domainMatch[0]];
          }
          if (urlMatch) {
            setTimeout(function () { window.open(urlMatch[0], '_blank'); }, 1500);
          }
        }
      });
    })
    .catch(function (err) {
      removeTyping();
      var fabBadge = document.getElementById('andx-fab-badge');
      if (fabBadge) fabBadge.remove();
      appendBubble('ai', 'Connection error \u2014 please try again.');
      isStreaming = false;
      sendBtn.disabled = false;
    });
  }

  /* ── Helpers ─────────────────────────────────────────── */
  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function scrollToBottom() {
    thread.scrollTop = thread.scrollHeight;
  }

  /* ── Action buttons below AI responses ────────────────── */
  function renderActionButtons(html, targetThread) {
    var urlMap = [
      { pattern: 'platform.andx.one/login', label: 'Log In', url: 'https://platform.andx.one/login' },
      { pattern: 'platform.andx.one', label: 'Sign Up', url: 'https://platform.andx.one' },
      { pattern: 'andxus.io/tokenization', label: 'View Tokenization', url: 'https://andxus.io/tokenization' },
      { pattern: 'andxus.io/about-us', label: 'Meet the Team', url: 'https://andxus.io/about-us' },
      { pattern: 'andxus.io/why-andx', label: 'Why ANDX', url: 'https://andxus.io/why-andx' },
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

  /* ── Chip handler ────────────────────────────────────── */
  window.__andxChip = function (el) {
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

  /* ── Proactive message after 30s idle ────────────────── */
  setTimeout(function() {
    if (sessionStorage.getItem('andx-proactive')) return;
    if (isOpen || userInteracted) return;
    sessionStorage.setItem('andx-proactive', '1');

    var path = window.location.pathname.toLowerCase();
    var msg;
    if (path.includes('tokenization')) {
      msg = 'Interested in real-world asset tokenization? I can walk you through how it works and explain the Manila One project.';
    } else if (path.includes('why-andx') || path.includes('about')) {
      msg = 'Curious what makes ANDX different? Ask me anything about our platform, security, or team.';
    } else {
      msg = 'Need help with anything? I can answer questions about ANDX, help you sign up, or explain our features.';
    }

    if (!isOpen) toggleWidget();
    setTimeout(function() {
      var welcome = document.getElementById('andx-w-welcome');
      if (welcome) welcome.style.display = 'none';
      appendBubble('ai', msg);
    }, 500);
  }, 30000);

})();
