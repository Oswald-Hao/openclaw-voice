import { execSync } from 'child_process';

export interface OpenClawConfig {
  cli_bin: string;
  base_url: string;
  gateway_token: string;
}

/**
 * Send a prompt to OpenClaw CLI and get the response.
 */
export async function ask(prompt: string, config: OpenClawConfig, sessionKey?: string): Promise<string> {
  // Sanitize the prompt for shell usage
  const escapedPrompt = prompt.replace(/"/g, '\\"').replace(/`/g, '\\`').replace(/\$/g, '\\$');

  let cmd = `"${config.cli_bin}" ask "${escapedPrompt}" --json`;

  if (sessionKey) {
    cmd += ` --session-key "${sessionKey}"`;
  }

  try {
    const stdout = execSync(cmd, {
      encoding: 'utf-8',
      timeout: 60000,
      env: {
        ...process.env,
        ...(config.gateway_token ? { OPENCLAW_GATEWAY_TOKEN: config.gateway_token } : {}),
        OPENCLAW_BASE_URL: config.base_url,
      },
    });

    try {
      const parsed = JSON.parse(stdout);
      return parsed.response || parsed.text || stdout.trim();
    } catch {
      // If not JSON, return raw output
      return stdout.trim();
    }
  } catch (err: any) {
    throw new Error(`OpenClaw CLI error: ${err.message}`);
  }
}

/**
 * Check if OpenClaw CLI is available.
 */
export function isAvailable(config: OpenClawConfig): boolean {
  try {
    execSync(`which "${config.cli_bin}"`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}
