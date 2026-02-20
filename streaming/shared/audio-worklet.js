/**
 * Audio Worklet Processor for AILANG Streaming Demos
 *
 * Captures microphone audio as PCM 16-bit, 16kHz mono
 * and plays back PCM audio at 24kHz (Gemini) or 16kHz (Deepgram).
 *
 * Shared across all voice-enabled streaming demos.
 *
 * Usage:
 *   await audioContext.audioWorklet.addModule('audio-worklet.js');
 *   const captureNode = new AudioWorkletNode(audioContext, 'pcm-capture');
 *   captureNode.port.onmessage = (e) => { sendAudioChunk(e.data.pcmData); };
 */

// ============================================================
// PCM Capture Processor (Mic → PCM 16-bit chunks)
// ============================================================
class PCMCaptureProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    // Target sample rate for output (default 16kHz for Deepgram/Gemini input)
    this.targetRate = options?.processorOptions?.targetRate || 16000;
    // Chunk duration in ms (default 100ms = 3200 bytes at 16kHz 16-bit)
    this.chunkMs = options?.processorOptions?.chunkMs || 100;
    // Buffer to accumulate samples before sending a chunk
    this.buffer = new Float32Array(0);
    // Samples needed per chunk
    this.samplesPerChunk = Math.floor(this.targetRate * this.chunkMs / 1000);
    this.isRecording = true;

    this.port.onmessage = (e) => {
      if (e.data.command === 'stop') this.isRecording = false;
      if (e.data.command === 'start') this.isRecording = true;
    };
  }

  process(inputs, outputs, parameters) {
    if (!this.isRecording) return true;

    const input = inputs[0];
    if (!input || !input[0]) return true;

    const inputData = input[0]; // mono channel

    // Downsample from audioContext.sampleRate to targetRate
    const ratio = sampleRate / this.targetRate;
    const downsampledLength = Math.floor(inputData.length / ratio);
    const downsampled = new Float32Array(downsampledLength);

    for (let i = 0; i < downsampledLength; i++) {
      const srcIdx = Math.floor(i * ratio);
      downsampled[i] = inputData[srcIdx];
    }

    // Append to buffer
    const newBuffer = new Float32Array(this.buffer.length + downsampled.length);
    newBuffer.set(this.buffer);
    newBuffer.set(downsampled, this.buffer.length);
    this.buffer = newBuffer;

    // Send complete chunks
    while (this.buffer.length >= this.samplesPerChunk) {
      const chunk = this.buffer.slice(0, this.samplesPerChunk);
      this.buffer = this.buffer.slice(this.samplesPerChunk);

      // Convert float32 [-1, 1] to int16 PCM
      const pcm16 = new Int16Array(chunk.length);
      for (let i = 0; i < chunk.length; i++) {
        const s = Math.max(-1, Math.min(1, chunk[i]));
        pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
      }

      this.port.postMessage({
        type: 'pcm-chunk',
        pcmData: pcm16.buffer,
        samples: pcm16.length,
        sampleRate: this.targetRate
      }, [pcm16.buffer]);
    }

    return true;
  }
}

// ============================================================
// PCM Playback Processor (PCM 16-bit → Speaker)
// ============================================================
class PCMPlaybackProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    // Source sample rate of incoming PCM (default 24kHz for Gemini output)
    this.sourceRate = options?.processorOptions?.sourceRate || 24000;

    // Linear FIFO buffer — no ring wrap, no modulo, guaranteed ordering.
    // Compacts by shifting unread data to front when write pointer reaches end.
    // Grows if needed. Starts at 30s; speech rarely buffers more than that.
    this.buf = new Float32Array(this.sourceRate * 30);
    this.wIdx = 0;           // write index (next write position)
    this.rIdx = 0;           // integer read index
    this.frac = 0.0;         // fractional accumulator for resampling
    this.lastSample = 0;     // for smooth fade-out when buffer runs dry

    // Pre-buffer: ~300ms only for INITIAL startup. After first playback,
    // we never re-enter pre-buffering — just output zeros inline when empty
    // and resume instantly when data arrives. This eliminates the 100ms
    // resume gap that was causing audible drops mid-stream.
    this.preBufferSamples = Math.floor(this.sourceRate * 0.3);
    this.isPreBuffering = true;
    this.hasStarted = false;  // once true, never re-enters pre-buffering

    // Fade-out: 64 samples of exponential decay to prevent clicks/pops
    this.fadeLen = 64;
    this.fadePos = 0;
    this.isFading = false;

    // Diagnostics — lightweight counters, posted every ~1s
    this._diag = { enqueues: 0, samples: 0, underruns: 0, compacts: 0, grows: 0, minBuf: Infinity, maxBuf: 0 };
    this._diagInterval = Math.floor(sampleRate / 128); // process() calls per second
    this._diagCounter = 0;

    this.port.onmessage = (e) => {
      if (e.data.type === 'enqueue') {
        const pcm16 = new Int16Array(e.data.pcmData);
        const needed = pcm16.length;

        // Ensure we have room to write
        this._ensureCapacity(needed);

        // Append PCM as float32
        for (let i = 0; i < needed; i++) {
          this.buf[this.wIdx++] = pcm16[i] / 0x8000;
        }

        this._diag.enqueues++;
        this._diag.samples += needed;

        const buffered = this.wIdx - this.rIdx;
        if (buffered > this._diag.maxBuf) this._diag.maxBuf = buffered;

        // Initial pre-buffer: wait for 300ms before first playback
        if (this.isPreBuffering && buffered >= this.preBufferSamples) {
          this.isPreBuffering = false;
          this.hasStarted = true;
        }
      } else if (e.data.command === 'clear') {
        this.wIdx = 0;
        this.rIdx = 0;
        this.frac = 0.0;
        this.lastSample = 0;
        this.isPreBuffering = true;
        this.hasStarted = false;
        this._diag = { enqueues: 0, samples: 0, underruns: 0, compacts: 0, grows: 0, minBuf: Infinity, maxBuf: 0 };
      }
    };
  }

  // Compact buffer: shift unread data to front, grow if still not enough
  _ensureCapacity(needed) {
    if (this.wIdx + needed <= this.buf.length) return;

    // Shift unread data to front
    const unread = this.wIdx - this.rIdx;
    if (unread > 0) {
      this.buf.copyWithin(0, this.rIdx, this.wIdx);
    }
    this.wIdx = unread;
    this.rIdx = 0;
    this._diag.compacts++;

    // Still not enough? Double the buffer
    if (this.wIdx + needed > this.buf.length) {
      const newLen = Math.max(this.buf.length * 2, this.wIdx + needed + this.sourceRate);
      const newBuf = new Float32Array(newLen);
      newBuf.set(this.buf.subarray(0, this.wIdx));
      this.buf = newBuf;
      this._diag.grows++;
    }
  }

  process(inputs, outputs, parameters) {
    const output = outputs[0];
    if (!output || !output[0]) return true;

    const outputData = output[0];
    const step = this.sourceRate / sampleRate; // source samples per output sample

    // Initial pre-buffer only — wait for 300ms before first sound
    if (this.isPreBuffering) {
      outputData.fill(0);
      return true;
    }

    let underranThisFrame = false;

    for (let i = 0; i < outputData.length; i++) {
      if (this.isFading) {
        const gain = 1 - (this.fadePos / this.fadeLen);
        outputData[i] = this.lastSample * gain * gain;
        this.fadePos++;
        if (this.fadePos >= this.fadeLen) {
          this.isFading = false;
          this.lastSample = 0;
        }
        continue;
      }

      // Buffer empty — output zero inline (no pre-buffering state change)
      if (this.rIdx + 1 >= this.wIdx) {
        if (this.lastSample !== 0 && !this.isFading) {
          this.isFading = true;
          this.fadePos = 0;
          i--;
          continue;
        }
        outputData[i] = 0;
        underranThisFrame = true;
        continue;
      }

      // Cancel any fade if data arrived mid-frame
      if (this.isFading) {
        this.isFading = false;
      }

      // Linear interpolation between rIdx and rIdx+1
      const s0 = this.buf[this.rIdx];
      const s1 = this.buf[this.rIdx + 1];
      const sample = s0 + (s1 - s0) * this.frac;
      outputData[i] = sample;
      this.lastSample = sample;

      // Advance fractional read position
      this.frac += step;
      while (this.frac >= 1.0) {
        this.frac -= 1.0;
        this.rIdx++;
      }
    }

    // Track diagnostics
    if (underranThisFrame) this._diag.underruns++;
    const buffered = this.wIdx - this.rIdx;
    if (buffered < this._diag.minBuf) this._diag.minBuf = buffered;

    // Post diagnostics every ~1 second (cheap: just a counter check)
    this._diagCounter++;
    if (this._diagCounter >= this._diagInterval) {
      this._diagCounter = 0;
      this.port.postMessage({
        type: 'diag',
        enqueues: this._diag.enqueues,
        samples: this._diag.samples,
        underruns: this._diag.underruns,
        compacts: this._diag.compacts,
        grows: this._diag.grows,
        buffered: buffered,
        bufSize: this.buf.length,
        minBuf: this._diag.minBuf === Infinity ? 0 : this._diag.minBuf,
        maxBuf: this._diag.maxBuf
      });
      // Reset per-interval counters (keep cumulative ones)
      this._diag.minBuf = Infinity;
      this._diag.maxBuf = 0;
    }

    return true;
  }
}

registerProcessor('pcm-capture', PCMCaptureProcessor);
registerProcessor('pcm-playback', PCMPlaybackProcessor);
