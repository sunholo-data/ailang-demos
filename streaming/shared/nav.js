// ================================================================
// AILANG Streaming Demos — Shared Navigation
// ================================================================
// Include via <script src="../shared/nav.js"></script> at end of body.
// Injects a floating AILANG logo button that expands to show all demos.

(function () {
  'use strict';

  // AILANG brand: three-circle logo as inline SVG
  var LOGO_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300" width="28" height="28">' +
    '<circle cx="107" cy="150" r="80" fill="#f9a697" opacity="0.3"/>' +
    '<circle cx="130" cy="150" r="80" fill="#e73c17" opacity="0.3"/>' +
    '<circle cx="153" cy="150" r="80" fill="#e73c17"/>' +
    '</svg>';

  var DEMOS = [
    { name: 'All Demos',      href: '../index.html',                         icon: '\u2302', color: '#e73c17' },
    { name: 'Voice DocParse', href: '../voice_docparse/browser/index.html',  icon: '\uD83D\uDCC4', color: '#4a9eff' },
    { name: 'Voice Analytics',href: '../voice_analytics/browser/index.html', icon: '\uD83D\uDCCA', color: '#10b981' },
    { name: 'Claude Chat',    href: '../claude_chat/browser/index.html',     icon: '\uD83D\uDCAC', color: '#d4a046' },
    { name: 'Transcription',  href: '../transcription/browser/index.html',   icon: '\uD83C\uDF99', color: '#00e5c8' },
    { name: 'Voice Pipeline', href: '../voice_pipeline/browser/index.html',  icon: '\u26A1', color: '#9a6aef' },
    { name: 'Safe Agent',     href: '../safe_agent/browser/index.html',      icon: '\uD83D\uDEE1', color: '#22c55e' },
    { name: 'Gemini Live',   href: '../gemini_live/browser/index.html',     icon: '\uD83D\uDD0A', color: '#d4a046' },
  ];

  // Detect current demo from URL to highlight it
  var path = window.location.pathname;
  function isCurrent(href) {
    var norm = href.replace(/\.\.\//g, '');
    return path.includes(norm.replace('index.html', '').replace('/browser/', '/'));
  }

  // --- Inject styles ---
  var style = document.createElement('style');
  style.textContent = '\
    #ailang-nav-toggle {\
      position: fixed;\
      bottom: 20px;\
      left: 20px;\
      z-index: 99999;\
      width: 44px;\
      height: 44px;\
      border-radius: 50%;\
      border: 1px solid rgba(231,60,23,0.3);\
      background: rgba(15,17,21,0.92);\
      backdrop-filter: blur(12px);\
      -webkit-backdrop-filter: blur(12px);\
      cursor: pointer;\
      display: flex;\
      align-items: center;\
      justify-content: center;\
      transition: transform 0.2s, background 0.2s, border-color 0.2s, box-shadow 0.2s;\
      box-shadow: 0 4px 20px rgba(0,0,0,0.5);\
      padding: 0;\
      overflow: hidden;\
    }\
    #ailang-nav-toggle svg {\
      width: 28px;\
      height: 28px;\
      transition: transform 0.2s;\
    }\
    #ailang-nav-toggle:hover {\
      background: rgba(25,28,35,0.95);\
      border-color: rgba(231,60,23,0.5);\
      transform: scale(1.1);\
      box-shadow: 0 4px 24px rgba(231,60,23,0.15);\
    }\
    #ailang-nav-toggle.open {\
      border-color: rgba(231,60,23,0.6);\
      box-shadow: 0 4px 24px rgba(231,60,23,0.2);\
    }\
    #ailang-nav-toggle.open svg {\
      transform: scale(0.85);\
    }\
    \
    #ailang-nav-panel {\
      position: fixed;\
      bottom: 72px;\
      left: 20px;\
      z-index: 99998;\
      background: rgba(12,14,18,0.95);\
      backdrop-filter: blur(16px);\
      -webkit-backdrop-filter: blur(16px);\
      border: 1px solid rgba(255,255,255,0.1);\
      border-radius: 14px;\
      padding: 8px;\
      min-width: 220px;\
      box-shadow: 0 8px 40px rgba(0,0,0,0.6);\
      opacity: 0;\
      visibility: hidden;\
      transform: translateY(10px) scale(0.96);\
      transition: opacity 0.2s, transform 0.2s, visibility 0.2s;\
    }\
    #ailang-nav-panel.open {\
      opacity: 1;\
      visibility: visible;\
      transform: translateY(0) scale(1);\
    }\
    \
    #ailang-nav-panel .nav-header {\
      display: flex;\
      align-items: center;\
      gap: 8px;\
      padding: 6px 10px 4px;\
      margin: 0;\
    }\
    #ailang-nav-panel .nav-header svg {\
      width: 18px;\
      height: 18px;\
    }\
    #ailang-nav-panel .nav-header-text {\
      font-size: 10px;\
      font-weight: 600;\
      text-transform: uppercase;\
      letter-spacing: 1.5px;\
      color: rgba(231,60,23,0.7);\
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;\
    }\
    \
    #ailang-nav-panel a.nav-item {\
      display: flex;\
      align-items: center;\
      gap: 10px;\
      padding: 8px 10px;\
      border-radius: 8px;\
      text-decoration: none;\
      color: rgba(255,255,255,0.75);\
      font-size: 13px;\
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;\
      font-weight: 400;\
      transition: background 0.15s, color 0.15s;\
      line-height: 1.3;\
    }\
    #ailang-nav-panel a.nav-item:hover {\
      background: rgba(255,255,255,0.08);\
      color: #fff;\
    }\
    #ailang-nav-panel a.nav-item.current {\
      background: rgba(231,60,23,0.08);\
      color: #fff;\
      font-weight: 500;\
    }\
    #ailang-nav-panel a.nav-item .nav-icon {\
      font-size: 16px;\
      width: 24px;\
      text-align: center;\
      flex-shrink: 0;\
    }\
    #ailang-nav-panel a.nav-item .nav-dot {\
      width: 6px;\
      height: 6px;\
      border-radius: 50%;\
      flex-shrink: 0;\
      margin-left: auto;\
    }\
    \
    #ailang-nav-panel .nav-sep {\
      height: 1px;\
      background: rgba(255,255,255,0.07);\
      margin: 4px 8px;\
    }\
  ';
  document.head.appendChild(style);

  // --- Build DOM ---
  var toggle = document.createElement('button');
  toggle.id = 'ailang-nav-toggle';
  toggle.innerHTML = LOGO_SVG;
  toggle.title = 'AILANG Streaming Demos';
  toggle.setAttribute('aria-label', 'Toggle demo navigation');

  var panel = document.createElement('div');
  panel.id = 'ailang-nav-panel';

  // Header with logo + text
  var header = document.createElement('div');
  header.className = 'nav-header';
  header.innerHTML = LOGO_SVG.replace('width="28"', 'width="18"').replace('height="28"', 'height="18"');
  var headerText = document.createElement('span');
  headerText.className = 'nav-header-text';
  headerText.textContent = 'AILANG Streaming';
  header.appendChild(headerText);
  panel.appendChild(header);

  DEMOS.forEach(function (demo, i) {
    if (i === 1) {
      var sep = document.createElement('div');
      sep.className = 'nav-sep';
      panel.appendChild(sep);
    }

    var a = document.createElement('a');
    a.className = 'nav-item';
    a.href = demo.href;
    if (isCurrent(demo.href)) a.classList.add('current');

    var icon = document.createElement('span');
    icon.className = 'nav-icon';
    icon.textContent = demo.icon;

    var label = document.createElement('span');
    label.textContent = demo.name;

    var dot = document.createElement('span');
    dot.className = 'nav-dot';
    dot.style.background = demo.color;

    a.appendChild(icon);
    a.appendChild(label);
    a.appendChild(dot);
    panel.appendChild(a);
  });

  document.body.appendChild(panel);
  document.body.appendChild(toggle);

  // --- Toggle behavior ---
  var isOpen = false;

  toggle.addEventListener('click', function (e) {
    e.stopPropagation();
    isOpen = !isOpen;
    toggle.classList.toggle('open', isOpen);
    panel.classList.toggle('open', isOpen);
  });

  document.addEventListener('click', function (e) {
    if (isOpen && !panel.contains(e.target) && e.target !== toggle) {
      isOpen = false;
      toggle.classList.remove('open');
      panel.classList.remove('open');
    }
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && isOpen) {
      isOpen = false;
      toggle.classList.remove('open');
      panel.classList.remove('open');
    }
  });
})();
