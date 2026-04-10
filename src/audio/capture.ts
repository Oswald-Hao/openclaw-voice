import { spawn, ChildProcess } from 'child_process';
import { createWriteStream, unlinkSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { VoiceActivityDetector } from './vad';

export interface CaptureOptions {
  sampleRate: number;
  silenceThreshold: number;
  silenceDurationMs: number;
}

const RECORDING_PATH = join(tmpdir(), 'openclaw-voice-recording.wav');

/**
 * Record audio from microphone using sox/arecord.
 * Uses VAD to auto-stop when silence is detected after speech.
 */
export async function recordUntilSilence(options: CaptureOptions): Promise<string> {
  return new Promise((resolve, reject) => {
    const vad = new VoiceActivityDetector({
      silenceThreshold: options.silenceThreshold,
      silenceDurationMs: options.silenceDurationMs,
      sampleRate: options.sampleRate,
    });

    const detector = vad.createSilenceDetector();
    const wavPath = RECORDING_PATH;

    // Remove previous recording if exists
    if (existsSync(wavPath)) {
      unlinkSync(wavPath);
    }

    // Try arecord first, fallback to sox
    let recProcess: ChildProcess;
    const useSox = !isCommandAvailable('arecord');

    if (useSox) {
      recProcess = spawn('sox', [
        '-d',
        '-r', String(options.sampleRate),
        '-c', '1',
        '-b', '16',
        '-e', 'signed-integer',
        wavPath,
      ]);
    } else {
      // arecord: record raw PCM, we'll save as WAV
      recProcess = spawn('arecord', [
        '-f', 'S16_LE',
        '-c', '1',
        '-r', String(options.sampleRate),
        wavPath,
      ]);
    }

    let speechDetected = false;
    let silenceTimer: ReturnType<typeof setTimeout> | null = null;

    recProcess.stderr?.on('data', (data: Buffer) => {
      // arecord/sox output status to stderr; ignore
    });

    // Monitor the WAV file being written by checking the process output
    // For VAD, we'll read raw PCM from the process stdout or pipe through a separate raw capture
    const rawProcess = spawn('arecord', [
      '-f', 'S16_LE',
      '-c', '1',
      '-r', String(options.sampleRate),
      '-t', 'raw',
    ]);

    rawProcess.on('error', (err) => {
      recProcess.kill();
      reject(new Error(`Failed to start audio capture: ${err.message}`));
    });

    rawProcess.stdout?.on('data', (chunk: Buffer) => {
      const result = detector.processChunk(chunk);
      if (result === 'silence_after_speech') {
        speechDetected = true;
        rawProcess.kill();
        recProcess.kill();
      }
    });

    rawProcess.on('close', () => {
      if (silenceTimer) clearTimeout(silenceTimer);
      // Set a max recording time of 30 seconds
      silenceTimer = setTimeout(() => {
        if (!speechDetected) {
          rawProcess.kill();
          recProcess.kill();
        }
      }, 30000);

      // Wait a bit for the WAV file to be fully written by recProcess
      setTimeout(() => {
        if (existsSync(wavPath)) {
          resolve(wavPath);
        } else {
          reject(new Error('Recording file was not created'));
        }
      }, 200);
    });

    recProcess.on('error', (err) => {
      rawProcess.kill();
      reject(new Error(`Recording process error: ${err.message}`));
    });
  });
}

function isCommandAvailable(cmd: string): boolean {
  try {
    const { execSync } = require('child_process');
    execSync(`which ${cmd}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Simple recording without VAD - record for a fixed duration.
 */
export async function recordForDuration(durationMs: number, options: CaptureOptions): Promise<string> {
  return new Promise((resolve, reject) => {
    const wavPath = RECORDING_PATH;

    if (existsSync(wavPath)) {
      unlinkSync(wavPath);
    }

    const recProcess = spawn('arecord', [
      '-f', 'S16_LE',
      '-c', '1',
      '-r', String(options.sampleRate),
      '-d', String(Math.ceil(durationMs / 1000)),
      wavPath,
    ]);

    recProcess.on('error', (err) => {
      reject(new Error(`Recording process error: ${err.message}`));
    });

    recProcess.on('close', (code) => {
      if (code === 0 && existsSync(wavPath)) {
        resolve(wavPath);
      } else {
        reject(new Error(`Recording failed with code ${code}`));
      }
    });
  });
}
