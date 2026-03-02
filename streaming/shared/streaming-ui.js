// ═══════════════════════════════════════════════════════════════
// StreamingUI — Shared UI utilities for AILANG streaming demos
//
// Composable helpers: config panel, chat messages, connection
// status, input management, markdown rendering.
//
// Demos provide a config mapping logical roles to DOM elements.
// Missing elements = no-op (safe to call without all features).
//
// Usage:
//   const ui = new StreamingUI({
//     elements: { configPanel, apiKeyInput, voiceSelect,
//                 chatContainer, textInput, sendButton,
//                 statusBadge, statusLabel,
//                 streamIndicator, streamLabel },
//     localStorage: { apiKey: 'gemini-api-key', voice: 'gemini-live-voice' },
//     agentName: 'Agent',
//     cssClasses: { /* optional overrides */ },
//     welcomeElement: document.getElementById('welcome'),
//   });
// ═══════════════════════════════════════════════════════════════

class StreamingUI {
  constructor(config) {
    this.el = config.elements || {};
    this.lsKeys = config.localStorage || {};
    this.agentName = config.agentName || 'Agent';
    this.userName = config.userName || 'You';
    this._currentAgentMsg = null;
    this._currentUserMsg = null;
    this._welcomeEl = config.welcomeElement || null;
    this.css = Object.assign({
      userMsg: 'msg msg-user',
      agentMsg: 'msg msg-agent',
      agentStreaming: 'streaming',
      cursor: 'streaming-cursor',
      systemMsg: 'msg msg-system',
      errorMsg: 'msg msg-error',
      msgLabel: 'msg-label',
      msgText: 'msg-text',
      connectedBadge: 'live',    // class added to statusBadge when connected
    }, config.cssClasses || {});
  }

  // ── Markdown Rendering (static) ──

  static renderMarkdown(raw) {
    let s = raw;
    s = s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    s = s.replace(/^### (.+)$/gm, '<strong style="font-size:1.05em">$1</strong>');
    s = s.replace(/^## (.+)$/gm, '<strong style="font-size:1.1em">$1</strong>');
    s = s.replace(/^# (.+)$/gm, '<strong style="font-size:1.15em">$1</strong>');
    s = s.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
    s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/\*(.+?)\*/g, '<em>$1</em>');
    s = s.replace(/`([^`]+)`/g,
      '<code style="background:var(--bg-surface,#1a1a2e);padding:1px 4px;border-radius:3px">$1</code>');
    s = s.replace(/^[-*] (.+)$/gm, '&bull; $1');
    s = s.replace(/\n/g, '<br>');
    return s;
  }

  // ── Config Panel ──

  toggleConfig() {
    if (this.el.configPanel) this.el.configPanel.classList.toggle('open');
  }

  saveConfig() {
    if (this.el.apiKeyInput && this.lsKeys.apiKey) {
      const key = this.el.apiKeyInput.value.trim();
      if (key) localStorage.setItem(this.lsKeys.apiKey, key);
    }
    if (this.el.voiceSelect && this.lsKeys.voice) {
      localStorage.setItem(this.lsKeys.voice, this.el.voiceSelect.value);
    }
  }

  loadConfig(legacyKeyMap) {
    if (legacyKeyMap) {
      for (const [oldKey, newKey] of Object.entries(legacyKeyMap)) {
        if (!localStorage.getItem(newKey) && localStorage.getItem(oldKey)) {
          localStorage.setItem(newKey, localStorage.getItem(oldKey));
        }
      }
    }
    if (this.el.apiKeyInput && this.lsKeys.apiKey) {
      const saved = localStorage.getItem(this.lsKeys.apiKey);
      if (saved) this.el.apiKeyInput.value = saved;
    }
    if (this.el.voiceSelect && this.lsKeys.voice) {
      const saved = localStorage.getItem(this.lsKeys.voice);
      if (saved) this.el.voiceSelect.value = saved;
    }
  }

  getApiKey() {
    const fromInput = this.el.apiKeyInput ? this.el.apiKeyInput.value.trim() : '';
    return fromInput || (this.lsKeys.apiKey ? localStorage.getItem(this.lsKeys.apiKey) : '') || '';
  }

  populateVoices(core, defaultVoice) {
    if (!this.el.voiceSelect || !core.wasmReady) return;
    try {
      const raw = core.callAILANG('voiceCatalog');
      if (!raw || typeof raw !== 'string' || raw[0] !== '[') return;
      const voices = JSON.parse(raw);
      const current = this.el.voiceSelect.value;
      this.el.voiceSelect.innerHTML = '';
      voices.forEach(v => {
        const opt = document.createElement('option');
        opt.value = v.name;
        opt.textContent = v.name + ' (' + v.desc + ')';
        this.el.voiceSelect.appendChild(opt);
      });
      const saved = this.lsKeys.voice ? localStorage.getItem(this.lsKeys.voice) : null;
      this.el.voiceSelect.value = saved || current || defaultVoice || 'Sulafat';
    } catch (e) {
      console.error('[StreamingUI] voice catalog error:', e);
    }
  }

  // ── Chat Messages ──

  removeWelcome() {
    if (this._welcomeEl && this._welcomeEl.parentNode) {
      this._welcomeEl.remove();
      this._welcomeEl = null;
    }
  }

  addUserMessage(text) {
    if (!this.el.chatContainer) return null;
    this.removeWelcome();
    this.finishAgentMessage();
    const div = document.createElement('div');
    div.className = this.css.userMsg;
    div.innerHTML =
      '<div class="' + this.css.msgLabel + '">' + StreamingUI.escapeHtml(this.userName) + '</div>' +
      '<div class="' + this.css.msgText + '">' + StreamingUI.escapeHtml(text) + '</div>';
    this.el.chatContainer.appendChild(div);
    this.el.chatContainer.scrollTop = this.el.chatContainer.scrollHeight;
    return div;
  }

  // Accumulate speech transcript chunks into a single user bubble.
  // Call resetUserTranscript() on turnComplete/toolCall to start a new bubble next time.
  appendUserTranscript(text) {
    if (!text) return;
    if (!this._currentUserMsg) {
      this._currentUserMsg = this.addUserMessage(text);
    } else {
      const body = this._currentUserMsg.querySelector('.' + this.css.msgText.split(' ')[0]);
      if (body) body.textContent += text;
      if (this.el.chatContainer) this.el.chatContainer.scrollTop = this.el.chatContainer.scrollHeight;
    }
  }

  getUserTranscript() {
    if (!this._currentUserMsg) return '';
    const body = this._currentUserMsg.querySelector('.' + this.css.msgText.split(' ')[0]);
    return body ? body.textContent : '';
  }

  resetUserTranscript() { this._currentUserMsg = null; }

  startAgentMessage() {
    if (!this.el.chatContainer) return null;
    this.removeWelcome();
    const div = document.createElement('div');
    div.className = this.css.agentMsg + ' ' + this.css.agentStreaming;
    div.innerHTML =
      '<div class="' + this.css.msgLabel + '">' + StreamingUI.escapeHtml(this.agentName) + '</div>' +
      '<div class="' + this.css.msgText + '"><span class="' + this.css.cursor + '"></span></div>';
    this.el.chatContainer.appendChild(div);
    this.el.chatContainer.scrollTop = this.el.chatContainer.scrollHeight;
    this._currentAgentMsg = div;
    return div;
  }

  appendAgentText(text) {
    if (!text) return;
    if (!this._currentAgentMsg) this.startAgentMessage();
    const textEl = this._currentAgentMsg.querySelector('.' + this.css.msgText.split(' ')[0]);
    if (!textEl) return;
    const cursor = textEl.querySelector('.' + this.css.cursor.split(' ')[0]);
    if (cursor) {
      cursor.insertAdjacentText('beforebegin', text);
    } else {
      textEl.textContent += text;
    }
    if (this.el.chatContainer) {
      this.el.chatContainer.scrollTop = this.el.chatContainer.scrollHeight;
    }
  }

  // Get raw text from current agent message (for chat history capture)
  getAgentText() {
    if (!this._currentAgentMsg) return '';
    const textEl = this._currentAgentMsg.querySelector('.' + this.css.msgText.split(' ')[0]);
    return textEl ? textEl.textContent : '';
  }

  finishAgentMessage(renderMd) {
    if (!this._currentAgentMsg) return;
    this._currentAgentMsg.classList.remove(this.css.agentStreaming);
    const cursor = this._currentAgentMsg.querySelector('.' + this.css.cursor.split(' ')[0]);
    if (cursor) cursor.remove();
    if (renderMd) {
      const textEl = this._currentAgentMsg.querySelector('.' + this.css.msgText.split(' ')[0]);
      if (textEl) {
        textEl.innerHTML = StreamingUI.renderMarkdown(textEl.textContent);
      }
    }
    this._currentAgentMsg = null;
  }

  get currentAgentMessage() { return this._currentAgentMsg; }

  addSystemMessage(text) {
    if (!this.el.chatContainer) return null;
    this.removeWelcome();
    const div = document.createElement('div');
    div.className = this.css.systemMsg;
    div.textContent = text;
    this.el.chatContainer.appendChild(div);
    this.el.chatContainer.scrollTop = this.el.chatContainer.scrollHeight;
    return div;
  }

  addErrorMessage(text) {
    if (!this.el.chatContainer) return null;
    this.removeWelcome();
    const div = document.createElement('div');
    div.className = this.css.errorMsg;
    div.textContent = text;
    this.el.chatContainer.appendChild(div);
    this.el.chatContainer.scrollTop = this.el.chatContainer.scrollHeight;
    return div;
  }

  // ── Connection Status ──

  setConnectionStatus(state) {
    if (this.el.statusBadge) {
      const cls = this.css.connectedBadge;
      if (state === 'connected') this.el.statusBadge.classList.add(cls);
      else this.el.statusBadge.classList.remove(cls);
    }
    if (this.el.statusLabel) {
      const labels = { connected: 'Connected', connecting: 'Connecting...', disconnected: 'Disconnected' };
      this.el.statusLabel.textContent = labels[state] || state;
    }
  }

  setStreamIndicator(active) {
    if (this.el.streamIndicator) {
      this.el.streamIndicator.classList.toggle('active', active);
    }
    if (this.el.streamLabel) {
      this.el.streamLabel.textContent = active ? 'streaming' : 'idle';
    }
  }

  // ── Input Management ──

  disableInput() {
    if (this.el.textInput) this.el.textInput.disabled = true;
    if (this.el.sendButton) this.el.sendButton.disabled = true;
  }

  enableInput(focus) {
    if (this.el.textInput) {
      this.el.textInput.disabled = false;
      if (focus) this.el.textInput.focus();
    }
    if (this.el.sendButton) this.el.sendButton.disabled = false;
  }

  // Full disconnect cleanup: finish agent message, enable input, show system message
  handleDisconnect(reason) {
    this.finishAgentMessage();
    this.enableInput(true);
    this.setConnectionStatus('disconnected');
    this.setStreamIndicator(false);
    if (reason) this.addSystemMessage(reason);
  }

  // ── Static Utilities ──

  static escapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }
}
