import { spawn } from 'child_process';
import { unlinkSync, existsSync, statSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

export interface CaptureOptions {
  sampleRate: number;
  silenceThreshold: number;
  silenceDurationMs: number;
}

const RECORDING_PATH = join(tmpdir(), 'openclaw-voice-recording.wav');

/**
 * Record audio from microphone using sox with built-in silence detection.
 *
 * Sox `silence` effect:
 *   silence 1 0.1 <threshold>%  1  <silenceDuration>s  <threshold>%
 *   - Wait for speech above threshold to START recording
 *   - Stop after silenceDuration of silence below threshold
 */
export async function recordUntilSilence(options: CaptureOptions): Promise<string> {
  const wavPath = RECORDING_PATH;

  // Remove previous recording
  if (existsSync(wavPath)) {
    unlinkSync(wavPath);
  }

  const silenceSec = (options.silenceDurationMs / 1000).toFixed(1);
  // Convert energy threshold (0-1) to sox percentage (0-100%)
  const thresholdPct = Math.max(0.1, options.silenceThreshold * 100 * 100).toFixed(1);

  // Use sox with silence detection:
  //   silence <above_periods> <above_duration> <above_threshold>
  //           <below_periods> <below_duration> <below_threshold>
  const args = [
    '-d',                                              // default input (mic)
    '-r', String(options.sampleRate),                  // sample rate
    '-c', '1',                                         // mono
    '-b', '16',                                        // 16-bit
    '-e', 'signed-integer',                            // PCM format
    wavPath,                                           // output file
    'silence',
    '1', '0.1', `${thresholdPct}%`,                   // start: wait for 0.1s above threshold
    '1', silenceSec, `${thresholdPct}%`,              // stop: after silenceSec below threshold
  ];

  return new Promise((resolve, reject) => {
    const useSox = isCommandAvailable('sox');

    let recProcess;
    if (useSox) {
      recProcess = spawn('sox', args);
    } else {
      // Fallback to arecord with fixed duration (no silence detection)
      const duration = 8; // record 8 seconds max
      recProcess = spawn('arecord', [
        '-f', 'S16_LE',
        '-c', '1',
        '-r', String(options.sampleRate),
        '-d', String(duration),
        wavPath,
      ]);
    }

    let resolved = false;
    let stderrOutput = '';

    recProcess.stderr?.on('data', (data: Buffer) => {
      stderrOutput += data.toString();
    });

    recProcess.on('error', (err) => {
      if (!resolved) {
        resolved = true;
        reject(new Error(`Failed to start recording: ${err.message}`));
      }
    });

    recProcess.on('close', (code) => {
      if (resolved) return;
      resolved = true;

      if (existsSync(wavPath)) {
        const stats = statSync(wavPath);
        if (stats.size > 44) {
          // WAV header is 44 bytes, anything more means we got audio
          resolve(wavPath);
        } else {
          // Empty recording (no speech detected)
          resolve(wavPath);
        }
      } else {
        reject(new Error(`Recording file not created. stderr: ${stderrOutput}`));
      }
    });

    // Safety timeout: force stop after 30 seconds no matter what
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        try { recProcess.kill('SIGTERM'); } catch {}
        // Give it a moment to flush the file
        setTimeout(() => {
          if (existsSync(wavPath)) {
            resolve(wavPath);
          } else {
            reject(new Error('Recording timed out with no output'));
          }
        }, 300);
      }
    }, 30000);
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
 * Record for a fixed duration (simple, no silence detection).
 */
export async function recordForDuration(durationSec: number, options: CaptureOptions): Promise<string> {
  const wavPath = RECORDING_PATH;

  if (existsSync(wavPath)) {
    unlinkSync(wavPath);
  }

  return new Promise((resolve, reject) => {
    const recProcess = spawn('arecord', [
      '-f', 'S16_LE',
      '-c', '1',
      '-r', String(options.sampleRate),
      '-d', String(durationSec),
      wavPath,
    ]);

    recProcess.on('error', (err) => {
      reject(new Error(`Recording failed: ${err.message}`));
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
