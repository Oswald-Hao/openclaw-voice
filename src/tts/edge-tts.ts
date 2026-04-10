import { execSync, spawn } from 'child_process';
import { existsSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

export interface TtsConfig {
  enabled: boolean;
  voice: string;
  player: 'mpv' | 'aplay';
}

const TTS_TMP = join(tmpdir(), 'openclaw-voice-tts.mp3');

/**
 * Generate speech audio using edge-tts and play it.
 */
export async function speak(text: string, config: TtsConfig): Promise<void> {
  if (!config.enabled) return;

  // Generate MP3 using edge-tts
  const mp3Path = TTS_TMP;
  if (existsSync(mp3Path)) {
    unlinkSync(mp3Path);
  }

  return new Promise((resolve, reject) => {
    const ttsProc = spawn('npx', [
      'edge-tts',
      '--voice', config.voice,
      '--text', text,
      '--write-media', mp3Path,
    ]);

    ttsProc.on('error', (err) => {
      reject(new Error(`edge-tts failed: ${err.message}`));
    });

    ttsProc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`edge-tts exited with code ${code}`));
        return;
      }

      if (!existsSync(mp3Path)) {
        reject(new Error('TTS output file not created'));
        return;
      }

      // Play the audio
      playAudio(mp3Path, config.player)
        .then(resolve)
        .catch(reject);
    });
  });
}

/**
 * Play an audio file using mpv or aplay.
 */
function playAudio(filePath: string, player: 'mpv' | 'aplay'): Promise<void> {
  return new Promise((resolve, reject) => {
    let proc;
    if (player === 'mpv') {
      proc = spawn('mpv', ['--no-video', '--really-quiet', filePath]);
    } else {
      // aplay only plays WAV, convert with ffmpeg first
      const wavPath = filePath.replace('.mp3', '.wav');
      try {
        execSync(`ffmpeg -y -i "${filePath}" "${wavPath}"`, { stdio: 'ignore' });
      } catch (err) {
        reject(new Error('ffmpeg conversion failed for aplay playback'));
        return;
      }
      proc = spawn('aplay', [wavPath]);
    }

    proc.on('error', (err) => {
      reject(new Error(`${player} playback failed: ${err.message}`));
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${player} exited with code ${code}`));
      }
    });
  });
}
