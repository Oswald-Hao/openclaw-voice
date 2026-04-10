import { ask } from '../agent/openclaw';
import { speak } from '../tts/edge-tts';
import { notify } from '../input/injector';
import type { OpenClawConfig } from '../agent/openclaw';
import type { TtsConfig } from '../tts/edge-tts';

export interface CommandModeConfig {
  openclaw: OpenClawConfig;
  tts: TtsConfig;
}

/**
 * Handle a voice command: send to OpenClaw and speak the response.
 */
export async function handleCommand(
  text: string,
  config: CommandModeConfig,
  sessionKey?: string
): Promise<string | null> {
  // Check for mode-switching voice commands
  const lowerText = text.toLowerCase();
  if (lowerText.includes('进入打字模式') || lowerText.includes('switch to typing')) {
    return '__SWITCH_TO_TYPING__';
  }
  if (lowerText.includes('退出打字模式') || lowerText.includes('switch to command')) {
    return '__SWITCH_TO_COMMAND__';
  }
  if (lowerText.includes('停止') || lowerText.includes('stop listening')) {
    return '__STOP__';
  }

  console.log(`[Command] Sending to OpenClaw: ${text}`);

  try {
    const response = await ask(text, config.openclaw, sessionKey);
    console.log(`[Command] Response: ${response.substring(0, 100)}...`);

    // Speak the response via TTS
    if (config.tts.enabled && response) {
      await speak(response, config.tts);
    }

    return response;
  } catch (err: any) {
    const errMsg = `命令执行失败: ${err.message}`;
    console.error(errMsg);
    notify('OpenClaw Voice', errMsg);
    return errMsg;
  }
}
