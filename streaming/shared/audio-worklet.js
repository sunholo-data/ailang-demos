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
    // Queue of audio buffers to play
    this.queue = [];
    this.currentBuffer = null;
    this.currentOffset = 0;

    this.port.onmessage = (e) => {
      if (e.data.type === 'enqueue') {
        // Receive PCM 16-bit data and convert to float32
        const pcm16 = new Int16Array(e.data.pcmData);
        const float32 = new Float32Array(pcm16.length);
        for (let i = 0; i < pcm16.length; i++) {
          float32[i] = pcm16[i] / 0x8000;
        }
        this.queue.push(float32);
      } else if (e.data.command === 'clear') {
        this.queue = [];
        this.currentBuffer = null;
        this.currentOffset = 0;
      }
    };
  }

  process(inputs, outputs, parameters) {
    const output = outputs[0];
    if (!output || !output[0]) return true;

    const outputData = output[0];
    const ratio = this.sourceRate / sampleRate;

    for (let i = 0; i < outputData.length; i++) {
      // Get next sample from queue
      if (!this.currentBuffer || this.currentOffset >= this.currentBuffer.length) {
        if (this.queue.length > 0) {
          this.currentBuffer = this.queue.shift();
          this.currentOffset = 0;
        } else {
          // Silence when no audio queued
          outputData[i] = 0;
          continue;
        }
      }

      // Resample from sourceRate to audioContext.sampleRate
      const srcIdx = Math.floor(this.currentOffset);
      if (srcIdx < this.currentBuffer.length) {
        outputData[i] = this.currentBuffer[srcIdx];
      } else {
        outputData[i] = 0;
      }
      this.currentOffset += ratio;
    }

    // Notify when queue is running low
    if (this.queue.length === 0 && !this.currentBuffer) {
      this.port.postMessage({ type: 'queue-empty' });
    }

    return true;
  }
}

registerProcessor('pcm-capture', PCMCaptureProcessor);
registerProcessor('pcm-playback', PCMPlaybackProcessor);
