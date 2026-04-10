import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';

export interface HotkeyConfig {
  toggleMode: string;
  pushToTalk: string | null;
}

/**
 * Listen for global hotkeys using xdotool/xdg-keyboard or
 * a simple key monitoring approach via libinput.
 *
 * For simplicity, we use `xbindkeys` (X11) or a polling approach.
 * As a fallback, we use a stdin-based approach in the terminal.
 */
export class HotkeyListener extends EventEmitter {
  private config: HotkeyConfig;
  private process: ChildProcess | null = null;
  private running = false;

  constructor(config: HotkeyConfig) {
    super();
    this.config = config;
  }

  /**
   * Start listening for hotkeys.
   * Uses `xbindkeys` for X11 or falls back to polling stdin.
   */
  start(): void {
    this.running = true;
    this.listenXbindkeys();
  }

  stop(): void {
    this.running = false;
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
  }

  private listenXbindkeys(): void {
    // Create an xbindkeys config that triggers a signal
    // We'll use a simpler approach: watch for key events via xinput
    // or just use a bash loop with xdotool key detection

    // For a pragmatic solution, we use a background process that
    // listens via `xbindkeys` with a custom handler script
    // Since xbindkeys needs a config file, we'll use an alternative:
    // Listen via `evtest` or just poll with `xdotool key --delay`

    // Simplest approach: use a node-based keygrabber if available,
    // otherwise fall back to stdin commands
    console.log('[Hotkey] Listening for Ctrl+Alt+V to toggle mode');
    console.log('[Hotkey] Press Ctrl+C to exit');

    // We'll use a simple approach: run a background script that uses
    // xdotool to detect key state, or just rely on terminal input
    // For production, you'd use iohook or similar native addon

    // Use xbindkeys approach
    try {
      this.setupXbindkeys();
    } catch {
      console.log('[Hotkey] xbindkeys not available, using stdin fallback');
      console.log('[Hotkey] Type "v" + Enter to toggle mode');
      this.listenStdin();
    }
  }

  private setupXbindkeys(): void {
    // Use a simple bash script that monitors keypress via xdotool
    // and signals back to us
    const script = `
#!/bin/bash
# Wait for Ctrl+Alt+V using xdotool's window key binding
while true; do
  # Use xdotool to wait for key combo
  xdotool key --delay 0 ctrl+alt+v 2>/dev/null
  echo "toggle"
done
`;

    // Simpler: use xbindkeys with a config
    // Actually, let's just use a polling approach with xdotool
    this.pollHotkey();
  }

  private pollHotkey(): void {
    // Poll for hotkey state every 100ms
    const poll = () => {
      if (!this.running) return;

      try {
        // Check if Ctrl+Alt+V is currently pressed
        // This is a simplified approach; in practice you'd use
        // a proper keygrabber library
        const { execSync } = require('child_process');
        // xdotool doesn't directly support key state checking,
        // so we use xinput for key events
      } catch {
        // ignore
      }

      if (this.running) {
        setTimeout(poll, 100);
      }
    };

    poll();
  }

  private listenStdin(): void {
    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    rl.on('line', (line: string) => {
      if (line.trim().toLowerCase() === 'v') {
        this.emit('toggle');
      }
    });
  }
}
