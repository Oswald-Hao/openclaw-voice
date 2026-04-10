import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { parse as parseYaml } from 'yaml';
import { recordUntilSilence } from './audio/capture';
import { transcribe } from './stt/whisper';
import { speak } from './tts/edge-tts';
import { handleCommand } from './modes/command';
import { handleTyping } from './modes/typing';
import { notify } from './input/injector';
import { HotkeyListener } from './hotkey/listener';

type Mode = 'command' | 'typing' | 'off';

interface AppConfig {
  stt: {
    whisper_bin: string;
    model: string;
    language: string;
  };
  tts: {
    enabled: boolean;
    voice: string;
    player: 'mpv' | 'aplay';
  };
  audio: {
    sample_rate: number;
    silence_threshold: number;
    silence_duration: number;
  };
  hotkey: {
    toggle_mode: string;
    push_to_talk: string | null;
  };
  mode: {
    default: string;
  };
  openclaw: {
    cli_bin: string;
    base_url: string;
    gateway_token: string;
  };
}

function loadConfig(): AppConfig {
  const configPaths = [
    join(process.cwd(), 'config.yaml'),
    join(process.env.HOME || '~', '.config', 'openclaw-voice', 'config.yaml'),
  ];

  for (const p of configPaths) {
    if (existsSync(p)) {
      const raw = readFileSync(p, 'utf-8');
      return parseYaml(raw) as AppConfig;
    }
  }

  throw new Error('config.yaml not found');
}

function checkDependencies(config: AppConfig): void {
  const deps = [
    { cmd: 'arecord', name: 'arecord (alsa-utils)', optional: false },
    { cmd: config.stt.whisper_bin, name: 'whisper.cpp', optional: false },
    { cmd: config.tts.player, name: config.tts.player, optional: false },
  ];

  const missing: string[] = [];
  for (const dep of deps) {
    try {
      const { execSync } = require('child_process');
      execSync(`which ${dep.cmd}`, { stdio: 'ignore' });
    } catch {
      missing.push(dep.name);
    }
  }

  if (missing.length > 0) {
    console.error(`Missing dependencies: ${missing.join(', ')}`);
    console.error('Run install.sh to install them.');
    process.exit(1);
  }
}

async function main() {
  console.log('=== OpenClaw Voice Agent ===');

  // Load configuration
  const config = loadConfig();
  console.log('Configuration loaded.');

  // Read gateway token from environment
  if (process.env.OPENCLAW_GATEWAY_TOKEN) {
    config.openclaw.gateway_token = process.env.OPENCLAW_GATEWAY_TOKEN;
  }

  // Check dependencies
  checkDependencies(config);

  // Initialize state
  let currentMode: Mode = (config.mode.default as Mode) || 'command';
  let sessionKey: string | undefined;
  let isListening = false;

  console.log(`Starting in ${currentMode} mode.`);

  // Set up hotkey listener
  const hotkey = new HotkeyListener({
    toggleMode: config.hotkey.toggle_mode,
    pushToTalk: config.hotkey.push_to_talk,
  });

  hotkey.on('toggle', () => {
    const modes: Mode[] = ['command', 'typing', 'off'];
    const idx = modes.indexOf(currentMode);
    currentMode = modes[(idx + 1) % modes.length];

    const labels: Record<Mode, string> = {
      command: '语音命令模式 (Voice Command)',
      typing: '语音打字模式 (Voice Typing)',
      off: '语音已关闭 (Voice Off)',
    };

    console.log(`\n[Mode] Switched to: ${labels[currentMode]}`);
    notify('OpenClaw Voice', labels[currentMode]);

    if (currentMode !== 'off' && !isListening) {
      listeningLoop();
    }
  });

  hotkey.start();

  notify('OpenClaw Voice', `已启动 - ${currentMode} mode`);

  // Main listening loop
  async function listeningLoop() {
    if (isListening) return;
    isListening = true;

    while (currentMode !== 'off') {
      try {
        console.log(`\n[${currentMode}] Listening...`);

        // Record audio with VAD
        const wavPath = await recordUntilSilence({
          sampleRate: config.audio.sample_rate,
          silenceThreshold: config.audio.silence_threshold,
          silenceDurationMs: config.audio.silence_duration,
        });

        // Transcribe
        const text = await transcribe(wavPath, {
          whisperBin: config.stt.whisper_bin,
          model: config.stt.model,
          language: config.stt.language,
        });

        if (!text.trim()) {
          console.log('[STT] No speech detected.');
          continue;
        }

        console.log(`[STT] "${text}"`);

        // Handle based on current mode
        if (currentMode === 'command') {
          const result = await handleCommand(text, {
            openclaw: config.openclaw,
            tts: config.tts,
          }, sessionKey);

          // Check for special commands
          if (result === '__SWITCH_TO_TYPING__') {
            currentMode = 'typing';
            notify('OpenClaw Voice', '语音打字模式 (Voice Typing)');
          } else if (result === '__SWITCH_TO_COMMAND__') {
            currentMode = 'command';
            notify('OpenClaw Voice', '语音命令模式 (Voice Command)');
          } else if (result === '__STOP__') {
            currentMode = 'off';
          }
        } else if (currentMode === 'typing') {
          await handleTyping(text);
        }
      } catch (err: any) {
        console.error(`[Error] ${err.message}`);
        // Brief pause before retrying to avoid tight error loop
        await new Promise((r) => setTimeout(r, 1000));
      }
    }

    isListening = false;
    console.log('[Voice] Stopped listening.');
  }

  // Start the loop
  listeningLoop();

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\nShutting down...');
    hotkey.stop();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    hotkey.stop();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
