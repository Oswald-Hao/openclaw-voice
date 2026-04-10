import { execSync } from 'child_process';

let displayServer: 'x11' | 'wayland' | null = null;

/**
 * Detect the current display server (X11 or Wayland).
 */
export function detectDisplayServer(): 'x11' | 'wayland' {
  if (displayServer) return displayServer;

  const sessionType = process.env.XDG_SESSION_TYPE;
  if (sessionType === 'wayland') {
    displayServer = 'wayland';
  } else if (sessionType === 'x11') {
    displayServer = 'x11';
  } else {
    // Try to detect via environment variables
    if (process.env.WAYLAND_DISPLAY) {
      displayServer = 'wayland';
    } else if (process.env.DISPLAY) {
      displayServer = 'x11';
    } else {
      displayServer = 'x11'; // default fallback
    }
  }

  return displayServer;
}

/**
 * Type text into the currently focused window.
 * Uses xdotool for X11 and ydotool for Wayland.
 */
export async function typeText(text: string): Promise<void> {
  const server = detectDisplayServer();
  const escapedText = text.replace(/"/g, '\\"').replace(/`/g, '\\`').replace(/\$/g, '\\$');

  try {
    if (server === 'wayland') {
      execSync(`ydotool type "${escapedText}"`, {
        encoding: 'utf-8',
        timeout: 5000,
      });
    } else {
      execSync(`xdotool type --clearmodifiers --delay 0 "${escapedText}"`, {
        encoding: 'utf-8',
        timeout: 5000,
      });
    }
  } catch (err: any) {
    throw new Error(`Text injection failed (${server}): ${err.message}`);
  }
}

/**
 * Send a desktop notification showing current mode.
 */
export function notify(title: string, message: string): void {
  try {
    execSync(`notify-send "${title}" "${message}"`, {
      encoding: 'utf-8',
      timeout: 3000,
    });
  } catch {
    // notify-send may not be available; ignore
  }
}
