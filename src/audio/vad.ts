import { Readable } from 'stream';

export interface VadOptions {
  silenceThreshold: number;
  silenceDurationMs: number;
  sampleRate: number;
}

/**
 * Simple energy-based Voice Activity Detection.
 * Reads 16-bit PCM chunks and detects when speech has stopped
 * based on sustained low energy.
 */
export class VoiceActivityDetector {
  private silenceThreshold: number;
  private silenceDurationMs: number;
  private sampleRate: number;
  private framesPerMs: number;

  constructor(options: VadOptions) {
    this.silenceThreshold = options.silenceThreshold;
    this.silenceDurationMs = options.silenceDurationMs;
    this.sampleRate = options.sampleRate;
    // 16-bit mono: 2 bytes per sample
    this.framesPerMs = Math.floor(this.sampleRate / 1000);
  }

  /**
   * Calculate RMS energy of a 16-bit PCM buffer.
   */
  private calcEnergy(buffer: Buffer): number {
    const samples = buffer.length / 2;
    if (samples === 0) return 0;

    let sum = 0;
    for (let i = 0; i < samples; i++) {
      const sample = buffer.readInt16LE(i * 2);
      sum += sample * sample;
    }
    return Math.sqrt(sum / samples) / 32768;
  }

  /**
   * Process a stream of PCM audio data. Returns when silence is detected
   * after speech has been detected.
   */
  createSilenceDetector(): {
    processChunk: (chunk: Buffer) => 'speech' | 'silence_after_speech';
    reset: () => void;
  } {
    let hasSpeech = false;
    let silenceStart = 0;
    const chunkDurationMs = 100; // check every ~100ms of audio
    const chunkSize = this.framesPerMs * chunkDurationMs * 2; // bytes
    let buffer = Buffer.alloc(0);

    return {
      processChunk: (chunk: Buffer): 'speech' | 'silence_after_speech' => {
        buffer = Buffer.concat([buffer, chunk]);

        while (buffer.length >= chunkSize) {
          const piece = buffer.subarray(0, chunkSize);
          buffer = buffer.subarray(chunkSize);

          const energy = this.calcEnergy(piece);
          const now = Date.now();

          if (energy > this.silenceThreshold) {
            hasSpeech = true;
            silenceStart = 0;
          } else if (hasSpeech) {
            if (silenceStart === 0) {
              silenceStart = now;
            }
            if (now - silenceStart >= this.silenceDurationMs) {
              return 'silence_after_speech';
            }
          }
        }
        return 'speech';
      },
      reset: () => {
        hasSpeech = false;
        silenceStart = 0;
        buffer = Buffer.alloc(0);
      },
    };
  }
}
