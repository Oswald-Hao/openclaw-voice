import { execSync } from 'child_process';

export interface OpenClawConfig {
  cli_bin: string;
  base_url: string;
  gateway_token: string;
}

/**
 * Send a prompt to OpenClaw via `openclaw agent` command.
 *
 * OpenClaw's actual CLI is `openclaw` (not `openclaw-cli`).
 * The correct way to send a message is:
 *   openclaw agent -m "message" --json
 *
 * This talks to the Gateway (default ws://127.0.0.1:18789) and returns
 * the agent's response.
 *
 * Prerequisites:
 *   1. Install OpenClaw:   curl -fsSL https://get.openclaw.ai | bash
 *   2. Set up:             openclaw setup --non-interactive --mode local
 *   3. Start gateway:      openclaw gateway run --port 18789
 *   4. (Or use daemon):    openclaw gateway install && openclaw gateway start
 *
 * Auth: uses OPENCLAW_GATEWAY_TOKEN env var or --token flag.
 */
export async function ask(prompt: string, config: OpenClawConfig, sessionKey?: string): Promise<string> {
  // Sanitize the prompt for shell usage
  const escapedPrompt = prompt.replace(/"/g, '\\"').replace(/`/g, '\\`').replace(/\$/g, '\\$');

  // Build the openclaw agent command
  let cmd = `"${config.cli_bin}" agent -m "${escapedPrompt}" --json`;

  // Session key for conversation continuity
  if (sessionKey) {
    cmd += ` --to "${sessionKey}"`;
  }

  // Gateway auth token
  if (config.gateway_token) {
    cmd += ` --token "${config.gateway_token}"`;
  }

  // Gateway URL
  if (config.base_url) {
    cmd += ` --url "${config.base_url}"`;
  }

  try {
    const stdout = execSync(cmd, {
      encoding: 'utf-8',
      timeout: 120000, // agent may take time to respond
      env: {
        ...process.env,
        ...(config.gateway_token ? { OPENCLAW_GATEWAY_TOKEN: config.gateway_token } : {}),
      },
    });

    // Try parsing JSON response
    try {
      const parsed = JSON.parse(stdout);
      // OpenClaw agent response may be in different fields
      return parsed.response || parsed.text || parsed.message || parsed.content || stdout.trim();
    } catch {
      // If not JSON, return raw output (stripping ANSI codes)
      return stdout.replace(/\x1b\[[0-9;]*m/g, '').trim();
    }
  } catch (err: any) {
    throw new Error(`OpenClaw agent error: ${err.message}`);
  }
}

/**
 * Check if OpenClaw CLI is available and the gateway is reachable.
 */
export function isAvailable(config: OpenClawConfig): boolean {
  try {
    execSync(`which "${config.cli_bin}"`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if the OpenClaw gateway is running and healthy.
 */
export function isGatewayHealthy(config: OpenClawConfig): boolean {
  try {
    let cmd = `"${config.cli_bin}" health --json`;
    if (config.gateway_token) {
      cmd += ` --token "${config.gateway_token}"`;
    }
    if (config.base_url) {
      cmd += ` --url "${config.base_url}"`;
    }
    execSync(cmd, { encoding: 'utf-8', timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}
