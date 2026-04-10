import { typeText } from '../input/injector';
import { notify } from '../input/injector';

/**
 * Handle voice typing: inject transcribed text into the focused window.
 */
export async function handleTyping(text: string): Promise<void> {
  if (!text.trim()) return;

  console.log(`[Typing] Injecting: ${text}`);

  try {
    await typeText(text);
  } catch (err: any) {
    const errMsg = `文字注入失败: ${err.message}`;
    console.error(errMsg);
    notify('OpenClaw Voice', errMsg);
  }
}
