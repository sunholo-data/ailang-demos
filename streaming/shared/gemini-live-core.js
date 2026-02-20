// ═══════════════════════════════════════════════════
// GeminiLiveCore — Shared AILANG WASM streaming infrastructure
//
// Encapsulates: WASM init, Stream effect handlers, IO handler,
// audio playback + mic capture, waveform visualization, fallback mode.
//
// Each demo creates an instance with its own CONFIG + callback hooks.
// No DOM manipulation — all UI updates go through callbacks.
//
// Usage:
//   const core = new GeminiLiveCore({ modules: [...], onEvent, onLog, ... });
//   await core.initWASM();
//   core.initWaveform(canvasEl);
//   await core.initAudio();
//   // AILANG drives session via std/stream effects
// ═══════════════════════════════════════════════════

class GeminiLiveCore {
  constructor(config) {
    // Merge defaults
    this.config = Object.assign({
      wasmPath: '../../wasm/ailang.wasm',
      workletPath: '../shared/audio-worklet.js',
      modules: [],               // [{name, path}]
      stdlibs: ['std/json', 'std/option', 'std/result', 'std/string', 'std/list', 'std/io', 'std/stream'],
      playbackRate: 48000,
      sourceRate: 24000,
      micRate: 16000,
      fftSize: 2048,
      canvasHeight: 180,
      // Callbacks (demo provides):
      onEvent: () => {},
      onLog: () => {},
      onStatsUpdate: () => {},
      onConnectionChange: () => {},
      onFallbackActivated: () => {},
      onFallbackDeactivated: () => {},
      onWasmReady: () => {},
      onWasmError: () => {},
    }, config);

    // WASM state
    this.wasmEngine = null;
    this._wasmReady = false;

    // Connection state
    this._connections = {};
    this._nextConnId = 1;

    // Session state
    this.sessionReady = false;
    this.sessionPrompt = '';

    // Audio state
    this._audioCtx = null;
    this._captureCtx = null;
    this._playbackNode = null;
    this._captureNode = null;
    this._analyserNode = null;
    this._micAnalyserNode = null;
    this._isRecording = false;
    this._lastPcmChunk = null;

    // Stats
    this._promptSentAt = 0;
    this._totalFrames = 0;
    this._totalBytes = 0;
    this._totalSamples = 0;
    this._statsRafPending = false;
    this._state = 'idle';

    // Waveform
    this._canvas = null;
    this._canvasCtx = null;
    this._animId = null;
    this._arrivalEnvelope = 0;

    // Fallback state
    this._fallbackActive = false;
  }

  // ── Public API ──

  get wasmReady() { return this._wasmReady; }
  get isRecording() { return this._isRecording; }
  get connections() { return this._connections; }

  get stats() {
    return {
      frames: this._totalFrames,
      bytes: this._totalBytes,
      samples: this._totalSamples,
      duration: this._totalSamples / this.config.sourceRate,
      latency: this._promptSentAt > 0 && this._totalFrames > 0
        ? null  // latency is set on first frame
        : null,
      state: this._state,
    };
  }

  // ── WASM Initialization ──

  async initWASM() {
    if (this._wasmReady) return;
    try {
      if (typeof AilangREPL === 'undefined') {
        this.config.onLog('warn', 'WASM not available');
        return;
      }
      const repl = new AilangREPL();
      await repl.init(this.config.wasmPath);

      // Import stdlib
      for (const lib of this.config.stdlibs) {
        repl.importModule(lib);
      }

      // Register effect handlers
      this._registerStreamHandlers(repl);
      this._registerIOHandler(repl);

      // Load AILANG modules
      for (const mod of this.config.modules) {
        const resp = await fetch(mod.path + '?v=' + Date.now());
        if (!resp.ok) throw new Error('Failed to fetch ' + mod.path);
        const code = await resp.text();
        const result = repl.loadModule(mod.name, code);
        if (!result.success) throw new Error(mod.name + ': ' + result.error);
        repl.importModule(mod.name);
        this.config.onLog('ok', 'Loaded module: <span class="hl">' + mod.name + '</span>');
      }

      this.wasmEngine = repl;
      this._wasmReady = true;
      this.config.onLog('ok', 'AILANG WASM loaded — <span class="hl">std/stream effects</span> bridged to browser');
      this.config.onWasmReady();
    } catch (e) {
      this.config.onLog('err', GeminiLiveCore.escapeHtml('WASM init failed: ' + e.message));
      this.config.onWasmError(e);
    }
  }

  // Call a pure AILANG function on the primary module (first in config.modules)
  callAILANG(funcName, ...args) {
    if (!this._wasmReady || this.config.modules.length === 0) return null;
    return this.callAILANGModule(this.config.modules[0].name, funcName, ...args);
  }

  // Call a pure AILANG function on a specific module
  callAILANGModule(moduleName, funcName, ...args) {
    if (!this._wasmReady) return null;
    try {
      const result = this.wasmEngine.call(moduleName, funcName, ...args);
      if (!result.success) {
        this.config.onLog('err', GeminiLiveCore.escapeHtml('AILANG: ' + result.error));
        return null;
      }
      let val = result.result || '';
      if (val === '<function>' && args.length === 0) {
        val = this.wasmEngine.eval(funcName + '()');
      }
      val = val.trim();
      // Strip type annotation
      const typeIdx = val.lastIndexOf(' :: ');
      if (typeIdx > 0) val = val.substring(0, typeIdx).trim();
      // Unwrap AILANG string quotes
      if (val.startsWith('"') && val.endsWith('"')) {
        try { val = JSON.parse(val); } catch { val = val.slice(1, -1); }
      }
      return val;
    } catch (e) {
      this.config.onLog('err', GeminiLiveCore.escapeHtml('AILANG call error: ' + e.message));
      return null;
    }
  }

  // ── Connection Management ──

  getActiveConnection() {
    return Object.values(this._connections).find(c => c.ws && c.ws.readyState === 1) || null;
  }

  // ── Audio Pipeline ──

  async initAudio() {
    if (this._audioCtx) return;
    this._audioCtx = new AudioContext({ sampleRate: this.config.playbackRate });
    await this._audioCtx.audioWorklet.addModule(this.config.workletPath);
    this._playbackNode = new AudioWorkletNode(this._audioCtx, 'pcm-playback', {
      processorOptions: { sourceRate: this.config.sourceRate }
    });
    this._analyserNode = this._audioCtx.createAnalyser();
    this._analyserNode.fftSize = this.config.fftSize;
    this._playbackNode.connect(this._analyserNode);
    this._analyserNode.connect(this._audioCtx.destination);
    this.config.onLog('ok', 'Audio engine — <span class="val">' +
      this.config.sourceRate/1000 + 'kHz → ' + this.config.playbackRate/1000 + 'kHz</span>');
  }

  handleAudioFrame(b64) {
    if (this._totalFrames === 0 && this._promptSentAt > 0) {
      const latency = Date.now() - this._promptSentAt;
      this.config.onLog('info', 'First audio in <span class="val">' + latency + 'ms</span>');
      this.config.onStatsUpdate(Object.assign(this.stats, { firstLatency: latency }));
    }
    this._totalFrames++;

    const binStr = atob(b64);
    const byteLen = binStr.length;
    this._totalBytes += byteLen;
    const bytes = new Uint8Array(byteLen);
    for (let i = 0; i < byteLen; i++) bytes[i] = binStr.charCodeAt(i);
    const pcm16 = new Int16Array(bytes.buffer);
    const sampleCount = pcm16.length;
    this._totalSamples += sampleCount;

    // Copy for VU meter before buffer transfer detaches it
    this._lastPcmChunk = new Int16Array(pcm16);

    // Feed network arrival envelope
    this.notifyAudioArrival(sampleCount);

    // Enqueue immediately (transfers buffer ownership)
    this.enqueueAudio(pcm16);

    // Batch stats/VU updates in animation frame
    if (!this._statsRafPending) {
      this._statsRafPending = true;
      requestAnimationFrame(() => {
        this._statsRafPending = false;
        this.config.onStatsUpdate(this.stats);
      });
    }

    if (this._totalFrames <= 3 || this._totalFrames % 10 === 0) {
      this.config.onLog('audio', '<span class="hl">Audio</span> frame <span class="val">#' +
        this._totalFrames + '</span> — ' + GeminiLiveCore.fmtBytes(byteLen) +
        ' (' + sampleCount + ' samples)');
    }
  }

  enqueueAudio(pcm16) {
    if (!this._playbackNode) return;
    this._playbackNode.port.postMessage({ type: 'enqueue', pcmData: pcm16.buffer }, [pcm16.buffer]);
  }

  clearAudioQueue() {
    if (this._playbackNode) this._playbackNode.port.postMessage({ command: 'clear' });
  }

  // Compute VU from PCM; returns {pct, db} for UI rendering
  computeVU(pcm16) {
    let sum = 0;
    for (let i = 0; i < pcm16.length; i++) { const s = pcm16[i] / 32768; sum += s * s; }
    const rms = Math.sqrt(sum / pcm16.length);
    const db = rms > 0 ? 20 * Math.log10(rms) : -60;
    const clamped = Math.max(-60, Math.min(0, db));
    const pct = ((clamped + 60) / 60) * 100;
    return { pct, db };
  }

  get lastPcmChunk() { return this._lastPcmChunk; }

  // ── Microphone Capture ──

  async toggleMic(onChunk) {
    if (this._isRecording) {
      this._isRecording = false;
      if (this._captureNode) this._captureNode.port.postMessage({ command: 'stop' });
      this.config.onLog('info', 'Mic stopped');
      return false;
    }

    await this.initAudio();
    if (!this._captureCtx) {
      this._captureCtx = new AudioContext();
      await this._captureCtx.audioWorklet.addModule(this.config.workletPath);
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const source = this._captureCtx.createMediaStreamSource(stream);
      this._micAnalyserNode = this._captureCtx.createAnalyser();
      this._micAnalyserNode.fftSize = this.config.fftSize;
      source.connect(this._micAnalyserNode);
      this._captureNode = new AudioWorkletNode(this._captureCtx, 'pcm-capture', {
        processorOptions: { targetRate: this.config.micRate }
      });
      source.connect(this._captureNode);

      this._captureNode.port.onmessage = (e) => {
        if (e.data.type === 'pcm-chunk') {
          const bytes = new Uint8Array(e.data.pcmData);
          let b = '';
          for (let i = 0; i < bytes.length; i++) b += String.fromCharCode(bytes[i]);
          const b64 = btoa(b);
          onChunk(b64);
        }
      };

      this._isRecording = true;
      this.config.onLog('ok', 'Mic active — streaming audio at ' + this.config.micRate/1000 + 'kHz');
      return true;
    } catch (e) {
      this.config.onLog('err', 'Mic access denied: ' + e.message);
      return false;
    }
  }

  // ── Stats ──

  resetStats() {
    this._totalFrames = 0;
    this._totalBytes = 0;
    this._totalSamples = 0;
    this._promptSentAt = 0;
  }

  markPromptSent() {
    this._promptSentAt = Date.now();
  }

  setState(s) {
    this._state = s;
  }

  // ── Waveform Visualization ──

  initWaveform(canvas) {
    if (!canvas) return;
    this._canvas = canvas;
    this._canvasCtx = canvas.getContext('2d');
    this._resizeCanvas();
    this._drawWaveformLoop();
    window.addEventListener('resize', () => this._resizeCanvas());
  }

  stopWaveform() {
    if (this._animId) { cancelAnimationFrame(this._animId); this._animId = null; }
  }

  notifyAudioArrival(sampleCount) {
    this._arrivalEnvelope = Math.min(this._arrivalEnvelope + (sampleCount / 2400), 1.0);
  }

  // ── Fallback Mode ──

  activateFallbackMode(reason) {
    this._fallbackActive = true;
    this.config.onLog('err', 'FALLBACK MODE: ' + reason);
    this.config.onLog('warn', 'Events processed via JS + AILANG pure functions (not std/stream closure)');
    this.config.onFallbackActivated(reason);
  }

  deactivateFallbackMode() {
    this._fallbackActive = false;
    this.config.onFallbackDeactivated();
  }

  get isFallbackActive() { return this._fallbackActive; }

  // ── Static Utilities ──

  static escapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  static fmtBytes(b) {
    if (b < 1024) return b + ' B';
    if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
    return (b / 1048576).toFixed(2) + ' MB';
  }

  // ════════════════════════════════════════════════════
  // PRIVATE METHODS
  // ════════════════════════════════════════════════════

  _extractConnId(arg) {
    if (typeof arg === 'number') return arg;
    if (arg && arg._ctor === 'StreamConn' && arg._fields) return arg._fields[0];
    return arg;
  }

  // ── Stream Effect Handlers ──
  // Bridges AILANG std/stream operations to browser WebSocket API.

  _registerStreamHandlers(repl) {
    const self = this;

    repl.setEffectHandler('Stream', {
      connect: (url, config) => {
        return new Promise((resolve) => {
          const connId = self._nextConnId++;
          let settled = false;
          const socket = new WebSocket(url);
          socket.binaryType = 'arraybuffer';
          self._connections[connId] = {
            ws: socket, eventHandler: null, eventQueue: [], resolveRecv: null, done: false
          };
          const decoder = new TextDecoder();

          socket.onopen = () => {
            self._connections[connId].eventQueue.push({ type: 'Opened', data: url });
            if (self._connections[connId].resolveRecv) {
              self._connections[connId].resolveRecv(self._connections[connId].eventQueue.shift());
              self._connections[connId].resolveRecv = null;
            }
            self.config.onConnectionChange('connected');
            if (!settled) {
              settled = true;
              resolve(AilangREPL.streamOk(AilangREPL.streamConn(connId)));
            }
          };

          socket.onmessage = (e) => {
            const text = typeof e.data === 'string' ? e.data : decoder.decode(e.data);
            const conn = self._connections[connId];
            if (!conn) return;
            conn.eventQueue.push({ type: 'Binary', data: text });
            if (conn.resolveRecv) {
              conn.resolveRecv(conn.eventQueue.shift());
              conn.resolveRecv = null;
            }
          };

          socket.onclose = (e) => {
            const conn = self._connections[connId];
            if (!conn) return;
            conn.eventQueue.push({ type: 'Closed', code: e.code, reason: e.reason || '' });
            conn.done = true;
            if (conn.resolveRecv) {
              conn.resolveRecv(conn.eventQueue.shift());
              conn.resolveRecv = null;
            }
            self.config.onConnectionChange('disconnected');
            if (!settled) {
              settled = true;
              resolve(AilangREPL.streamErr('ConnectionFailed', 'closed: ' + (e.reason || e.code)));
            }
          };

          socket.onerror = () => {
            const conn = self._connections[connId];
            if (conn && !conn.done) {
              conn.eventQueue.push({ type: 'Closed', code: 1006, reason: 'WebSocket error' });
              conn.done = true;
              if (conn.resolveRecv) {
                conn.resolveRecv(conn.eventQueue.shift());
                conn.resolveRecv = null;
              }
            }
            if (!settled) {
              settled = true;
              resolve(AilangREPL.streamErr('ConnectionFailed', 'WebSocket error'));
            }
          };
        });
      },

      send: (connArg, msg) => {
        const connId = self._extractConnId(connArg);
        const conn = self._connections[connId];
        if (!conn || !conn.ws || conn.ws.readyState !== 1)
          return AilangREPL.streamErr('SendFailed', 'not connected');
        conn.ws.send(typeof msg === 'string' ? msg : msg);
        return AilangREPL.streamOk(null);
      },

      onEvent: (connArg, handler) => {
        const connId = self._extractConnId(connArg);
        const conn = self._connections[connId];
        if (conn) conn.eventHandler = handler;
      },

      runEventLoop: (connArg) => {
        const connId = self._extractConnId(connArg);
        return new Promise((resolve) => {
          const conn = self._connections[connId];
          if (!conn) { resolve(); return; }

          async function eventLoop() {
            while (true) {
              if (!self._connections[connId]) { resolve(); return; }

              let event;
              if (conn.eventQueue.length > 0) {
                event = conn.eventQueue.shift();
              } else if (conn.done) {
                resolve(); return;
              } else {
                event = await new Promise(r => { conn.resolveRecv = r; });
              }
              if (!event) { resolve(); return; }

              let keepGoing = true;

              if (conn.eventHandler) {
                let streamEvent;
                switch (event.type) {
                  case 'Message': streamEvent = AilangREPL.adt('Message', event.data); break;
                  case 'Binary':  streamEvent = AilangREPL.adt('Binary', event.data); break;
                  case 'Opened':  streamEvent = AilangREPL.adt('Opened', event.data || ''); break;
                  case 'Closed':  streamEvent = AilangREPL.adt('Closed', event.code || 0, event.reason || ''); break;
                  case 'StreamError': streamEvent = AilangREPL.adt('StreamError', event.data || ''); break;
                  case 'SSEData': streamEvent = AilangREPL.adt('SSEData', event.eventType || '', event.data || ''); break;
                  case 'Ping':    streamEvent = AilangREPL.adt('Ping', event.data || ''); break;
                  default:        streamEvent = AilangREPL.adt('StreamError', 'unknown event'); break;
                }

                try {
                  const result = conn.eventHandler(streamEvent);
                  if (result === undefined || result === null) {
                    conn.eventHandler = null;
                    self.activateFallbackMode('Closure returned nil — cross-module imports not resolved');
                    keepGoing = self._processEventFallback(event, conn);
                  } else {
                    keepGoing = result;
                  }
                } catch (e) {
                  conn.eventHandler = null;
                  self.activateFallbackMode('Closure error: ' + e.message);
                  keepGoing = self._processEventFallback(event, conn);
                }
              } else {
                keepGoing = self._processEventFallback(event, conn);
              }

              if (!keepGoing || conn.done) { resolve(); return; }
            }
          }

          eventLoop();
        });
      },

      close: (connArg) => {
        const connId = self._extractConnId(connArg);
        const conn = self._connections[connId];
        if (conn) {
          if (conn.ws) conn.ws.close();
          if (conn.abortController) conn.abortController.abort();
          conn.done = true;
        }
        delete self._connections[connId];
      },

      status: (connArg) => {
        const connId = self._extractConnId(connArg);
        const conn = self._connections[connId];
        if (!conn) return 'StreamClosed';
        if (conn.ws) {
          switch (conn.ws.readyState) {
            case 0: return 'Connecting';
            case 1: return 'Open';
            case 2: return 'Closing';
            default: return 'StreamClosed';
          }
        }
        // SSE connection (no WebSocket)
        return conn.done ? 'StreamClosed' : 'Open';
      },

      // ── SSE over HTTP POST ──
      // Bridges AILANG ssePost(url, body, config) to fetch() + ReadableStream.
      // Events are delivered as SSEData(eventType, data) through the event queue,
      // so onEvent/runEventLoop work identically to WebSocket connections.
      // Note: Go effects register this as "sse_post" (not camelCase).
      sse_post: (url, body, config) => {
        return new Promise(async (resolve) => {
          const connId = self._nextConnId++;
          const abortCtrl = new AbortController();
          self._connections[connId] = {
            ws: null, abortController: abortCtrl,
            eventHandler: null, eventQueue: [], resolveRecv: null, done: false
          };

          // Build headers from AILANG config record
          const headers = {};
          if (config && config.headers) {
            for (const h of config.headers) {
              headers[h.name || h.Name] = h.value || h.Value;
            }
          }

          try {
            const response = await fetch(url, {
              method: 'POST',
              headers: headers,
              body: body,
              signal: abortCtrl.signal
            });

            if (!response.ok) {
              const errText = await response.text().catch(() => '');
              resolve(AilangREPL.streamErr('ConnectionFailed',
                'HTTP ' + response.status + ': ' + errText.slice(0, 200)));
              return;
            }

            const conn = self._connections[connId];

            // Push Opened event
            conn.eventQueue.push({ type: 'Opened', data: url });
            if (conn.resolveRecv) {
              conn.resolveRecv(conn.eventQueue.shift());
              conn.resolveRecv = null;
            }

            self.config.onConnectionChange('connected');

            // Resolve with stream connection immediately
            resolve(AilangREPL.streamOk(AilangREPL.streamConn(connId)));

            // Read SSE stream asynchronously
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';
            let currentEventType = '';
            let currentData = '';

            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              if (!self._connections[connId]) break; // closed externally

              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split('\n');
              buffer = lines.pop() || '';

              for (const line of lines) {
                if (line.startsWith('event: ')) {
                  currentEventType = line.slice(7).trim();
                } else if (line.startsWith('data: ')) {
                  currentData += (currentData ? '\n' : '') + line.slice(6);
                } else if (line.trim() === '') {
                  // Empty line = end of SSE event
                  if (currentData) {
                    const c = self._connections[connId];
                    if (!c) break;
                    c.eventQueue.push({
                      type: 'SSEData',
                      eventType: currentEventType || 'message',
                      data: currentData
                    });
                    if (c.resolveRecv) {
                      c.resolveRecv(c.eventQueue.shift());
                      c.resolveRecv = null;
                    }
                  }
                  currentEventType = '';
                  currentData = '';
                }
              }
            }

            // Stream complete
            const c2 = self._connections[connId];
            if (c2) {
              c2.eventQueue.push({ type: 'Closed', code: 1000, reason: 'stream complete' });
              c2.done = true;
              if (c2.resolveRecv) {
                c2.resolveRecv(c2.eventQueue.shift());
                c2.resolveRecv = null;
              }
              self.config.onConnectionChange('disconnected');
            }
          } catch (e) {
            if (e.name === 'AbortError') {
              const c = self._connections[connId];
              if (c) {
                c.eventQueue.push({ type: 'Closed', code: 1000, reason: 'aborted' });
                c.done = true;
                if (c.resolveRecv) {
                  c.resolveRecv(c.eventQueue.shift());
                  c.resolveRecv = null;
                }
              }
              self.config.onConnectionChange('disconnected');
              return;
            }
            const c = self._connections[connId];
            if (c) {
              c.eventQueue.push({ type: 'Closed', code: 1006, reason: e.message });
              c.done = true;
              if (c.resolveRecv) {
                c.resolveRecv(c.eventQueue.shift());
                c.resolveRecv = null;
              }
              self.config.onConnectionChange('disconnected');
            }
            // If not yet resolved, resolve with error
            resolve(AilangREPL.streamErr('ConnectionFailed', e.message));
          }
        });
      }
    });
  }

  // ── IO Effect Handler ──

  _registerIOHandler(repl) {
    const self = this;
    repl.setEffectHandler('IO', {
      println: (text) => {
        try {
          const event = JSON.parse(text);
          self.config.onEvent(event);
        } catch {
          if (text && text.trim()) self.config.onLog('info', GeminiLiveCore.escapeHtml(text));
        }
      }
    });
  }

  // ── Fallback Event Processing ──
  // Uses AILANG pure functions + JS fast-track for audio frames.

  _processEventFallback(event, conn) {
    if (event.type === 'Opened') {
      this.config.onEvent({ type: 'opened' });
      return true;
    }
    if (event.type === 'Closed') {
      this.config.onEvent({ type: 'closed', code: event.code, reason: event.reason });
      return false;
    }
    if (event.type === 'StreamError') {
      this.config.onEvent({ type: 'error', text: event.data });
      return false;
    }
    if (event.type === 'Ping') return true;

    const text = event.data;
    if (!text) return true;

    try {
      const json = JSON.parse(text);

      if (json.setupComplete) {
        this.config.onEvent({ type: 'setup' });
        // Send initial prompt via AILANG buildTextMessage
        if (this.sessionPrompt) {
          const textMsg = this.callAILANG('buildTextMessage', this.sessionPrompt);
          if (textMsg && conn.ws && conn.ws.readyState === 1) conn.ws.send(textMsg);
          this.config.onEvent({ type: 'sent', text: this.sessionPrompt });
        }
        return true;
      }

      if (json.serverContent) {
        const sc = json.serverContent;
        if (sc.turnComplete) {
          this.config.onEvent({ type: 'turnComplete' });
          return true;
        }
        if (sc.inputTranscription && sc.inputTranscription.text)
          this.config.onEvent({ type: 'inputTranscript', text: sc.inputTranscription.text });
        if (sc.outputTranscription && sc.outputTranscription.text)
          this.config.onEvent({ type: 'outputTranscript', text: sc.outputTranscription.text });
        if (sc.modelTurn && sc.modelTurn.parts)
          this.config.onEvent({ type: 'modelTurn', parts: sc.modelTurn.parts });
        return true;
      }

      if (json.toolCall) {
        const calls = json.toolCall.functionCalls || [];
        this.config.onEvent({ type: 'toolCall', calls });
        return true;
      }

      return true;
    } catch {
      const parsed = this.callAILANG('parseMessage', text);
      if (!parsed) return true;
      try { this.config.onEvent(JSON.parse(parsed)); } catch { /* ignore */ }
      return true;
    }
  }

  // ── Waveform Drawing ──

  _resizeCanvas() {
    if (!this._canvas) return;
    const rect = this._canvas.parentElement.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this._canvas.width = rect.width * dpr;
    this._canvas.height = this.config.canvasHeight * dpr;
    this._canvas.style.height = this.config.canvasHeight + 'px';
    this._canvasCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  _drawGrid() {
    const ctx = this._canvasCtx;
    const w = this._canvas.width / (window.devicePixelRatio || 1);
    const h = this.config.canvasHeight;
    ctx.strokeStyle = 'rgba(212,160,70,0.04)';
    ctx.lineWidth = 0.5;
    for (let i = 1; i < 6; i++) {
      const y = (h / 6) * i;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }
    const cols = Math.floor(w / 40);
    for (let i = 1; i < cols; i++) {
      const x = (w / cols) * i;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(212,160,70,0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke();
  }

  _drawTrace(waveData, w, h, mid, color, glowColor, lineWidth) {
    const ctx = this._canvasCtx;
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = 6;
    ctx.strokeStyle = glowColor;
    ctx.lineWidth = lineWidth + 1.5;
    ctx.beginPath();
    for (let i = 0; i < w; i++) {
      const idx = Math.floor((i / w) * waveData.length);
      const y = mid + waveData[idx] * mid * 0.85;
      if (i === 0) ctx.moveTo(i, y); else ctx.lineTo(i, y);
    }
    ctx.stroke();
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    for (let i = 0; i < w; i++) {
      const idx = Math.floor((i / w) * waveData.length);
      const y = mid + waveData[idx] * mid * 0.85;
      if (i === 0) ctx.moveTo(i, y); else ctx.lineTo(i, y);
    }
    ctx.stroke();
  }

  _drawWaveformLoop() {
    if (!this._canvas) return;
    const ctx = this._canvasCtx;
    const w = this._canvas.width / (window.devicePixelRatio || 1);
    const h = this.config.canvasHeight;
    const mid = h / 2;

    ctx.clearRect(0, 0, w, h);
    this._drawGrid();

    // Network arrival envelope — green bar along bottom
    this._arrivalEnvelope *= 0.92;
    if (this._arrivalEnvelope > 0.01) {
      const barH = Math.min(this._arrivalEnvelope * 40, 8);
      ctx.fillStyle = 'rgba(74,222,128,' + Math.min(this._arrivalEnvelope * 2, 0.5) + ')';
      ctx.fillRect(0, h - barH, w, barH);
      ctx.fillStyle = 'rgba(74,222,128,0.08)';
      ctx.fillRect(0, h - barH - 2, w, 2);
    }

    // Playback output — amber
    if (this._analyserNode) {
      const playData = new Float32Array(this._analyserNode.fftSize);
      this._analyserNode.getFloatTimeDomainData(playData);
      this._drawTrace(playData, w, h, mid,
        'rgba(212,160,70,0.7)', 'rgba(212,160,70,0.25)', 1.5);
    }

    // Mic input — cyan
    if (this._micAnalyserNode && this._isRecording) {
      const micData = new Float32Array(this._micAnalyserNode.fftSize);
      this._micAnalyserNode.getFloatTimeDomainData(micData);
      this._drawTrace(micData, w, h, mid,
        'rgba(56,189,248,0.5)', 'rgba(56,189,248,0.15)', 1);
    }

    this._animId = requestAnimationFrame(() => this._drawWaveformLoop());
  }
}
