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

    // Ring buffer: 10 seconds at source rate should be plenty
    const bufSize = this.sourceRate * 10;
    this.ring = new Float32Array(bufSize);
    this.writePos = 0;       // next write position in ring
    this.readPos = 0.0;      // fractional read position for interpolation
    this.buffered = 0;       // samples available to read
    this.lastSample = 0;     // for smooth fade-out when buffer runs dry

    // Pre-buffer: accumulate this many source samples before starting playback
    // ~300ms at 24kHz = 7200 samples — absorbs network + event loop jitter
    // (Firefox needs more buffer than Chrome due to higher setTimeout minimums)
    this.preBufferSamples = Math.floor(this.sourceRate * 0.3);
    // Resume threshold: after mid-stream underrun, accumulate this much before resuming.
    // Much smaller than initial pre-buffer (100ms vs 300ms) to minimize silence gaps,
    // but large enough to prevent repeated stutter from 1-sample resumes.
    this.resumeThreshold = Math.floor(this.sourceRate * 0.1);
    this.isPreBuffering = true;
    this.hasStarted = false;    // true after first playback begins (never re-primes)

    // Fade-out: samples of exponential decay when buffer runs dry.
    // Prevents clicks/pops at end of sentences when frames slow down.
    // 64 samples at 48kHz ≈ 1.3ms — inaudible but eliminates transients.
    this.fadeLen = 64;
    this.fadePos = 0;
    this.isFading = false;

    this.port.onmessage = (e) => {
      if (e.data.type === 'enqueue') {
        const pcm16 = new Int16Array(e.data.pcmData);
        const len = this.ring.length;
        for (let i = 0; i < pcm16.length; i++) {
          this.ring[this.writePos % len] = pcm16[i] / 0x8000;
          this.writePos++;
        }
        this.buffered += pcm16.length;
        // Start playback once pre-buffer is filled
        if (this.isPreBuffering && this.buffered >= this.preBufferSamples) {
          this.isPreBuffering = false;
          this.hasStarted = true;
        }
        // After first start, resume once resume threshold is reached.
        // Prevents repeated stutter from resuming with just 1 sample.
        if (this.hasStarted && this.isPreBuffering && this.buffered >= this.resumeThreshold) {
          this.isPreBuffering = false;
          this.isFading = false; // cancel any in-progress fade-out
        }
      } else if (e.data.command === 'clear') {
        this.writePos = 0;
        this.readPos = 0.0;
        this.buffered = 0;
        this.ring.fill(0);
        this.isPreBuffering = true;
        this.hasStarted = false;
      }
    };
  }

  process(inputs, outputs, parameters) {
    const output = outputs[0];
    if (!output || !output[0]) return true;

    const outputData = output[0];
    const ratio = this.sourceRate / sampleRate;
    const len = this.ring.length;

    // Don't play until pre-buffer is filled
    if (this.isPreBuffering) {
      outputData.fill(0);
      return true;
    }

    for (let i = 0; i < outputData.length; i++) {
      if (this.isFading) {
        // Exponential fade-out to silence — prevents end-of-sentence clicks
        const gain = 1 - (this.fadePos / this.fadeLen);
        outputData[i] = this.lastSample * gain * gain; // quadratic for fast taper
        this.fadePos++;
        if (this.fadePos >= this.fadeLen) {
          this.isFading = false;
          this.lastSample = 0;
        }
        continue;
      }

      if (this.buffered <= 1) {
        // Buffer dry — start fade-out from last sample value
        if (this.lastSample !== 0 && !this.isFading) {
          this.isFading = true;
          this.fadePos = 0;
          i--; // re-process this sample in fade path
          continue;
        }
        outputData[i] = 0;
        continue;
      }

      // Linear interpolation for smooth resampling
      const idx = this.readPos;
      const idx0 = Math.floor(idx) % len;
      const idx1 = (idx0 + 1) % len;
      const frac = idx - Math.floor(idx);
      const sample = this.ring[idx0] * (1 - frac) + this.ring[idx1] * frac;
      outputData[i] = sample;
      this.lastSample = sample;

      this.readPos += ratio;
      this.buffered -= ratio;
    }

    // Notify when buffer runs dry (but don't re-prime — resume immediately on next data)
    if (this.buffered <= 0) {
      this.buffered = 0;
      this.isPreBuffering = true;  // outputs silence until data arrives
      // Don't reset hasStarted — next enqueue resumes instantly without waiting for pre-buffer
      this.port.postMessage({ type: 'queue-empty' });
    }

    return true;
  }
}

registerProcessor('pcm-capture', PCMCaptureProcessor);
registerProcessor('pcm-playback', PCMPlaybackProcessor);
