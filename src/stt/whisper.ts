import { execSync } from 'child_process';
import { existsSync, mkdirSync } from 'fs';
import { dirname, resolve } from 'path';
import { homedir } from 'os';

export interface SttConfig {
  whisperBin: string;
  model: string;
  language: string;
}

const MODEL_DIR = joinSafe(homedir(), '.config', 'openclaw-voice');
const MODEL_URL = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin';

function joinSafe(...paths: string[]): string {
  return paths.join('/');
}

/**
 * Ensure the whisper model file exists, downloading if necessary.
 */
export async function ensureModel(modelPath: string): Promise<string> {
  // Expand ~ in path
  const expanded = modelPath.replace(/^~/, homedir());

  if (existsSync(expanded)) {
    return expanded;
  }

  console.log(`Model not found at ${expanded}, downloading...`);
  const dir = dirname(expanded);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  execSync(`curl -L "${MODEL_URL}" -o "${expanded}"`, {
    stdio: 'inherit',
  });

  console.log('Model downloaded.');
  return expanded;
}

/**
 * Transcribe a WAV file using whisper.cpp CLI.
 */
export async function transcribe(wavPath: string, config: SttConfig): Promise<string> {
  const modelPath = await ensureModel(config.model);

  const langFlag = config.language !== 'auto' ? ` -l ${config.language}` : ' -l auto';

  try {
    const stdout = execSync(
      `"${config.whisperBin}" -m "${modelPath}" -f "${wavPath}" --no-timestamps${langFlag}`,
      {
        encoding: 'utf-8',
        timeout: 30000,
        stdio: ['pipe', 'pipe', 'pipe'],
      }
    );

    // whisper.cpp output may have leading/trailing whitespace and brackets
    const text = stdout
      .replace(/\[.*?\]/g, '')
      .trim();

    return text;
  } catch (err: any) {
    throw new Error(`Whisper transcription failed: ${err.message}`);
  }
}
