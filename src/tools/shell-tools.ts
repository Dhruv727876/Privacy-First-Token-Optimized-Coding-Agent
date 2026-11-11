import { spawn } from 'node:child_process';
import type { Tool, ToolContext, ToolResult } from './types.js';

export const runCommandTool: Tool = {
  name: 'run_command',
  description: 'Execute a shell command',
  parameters: {
    command: { type: 'string', description: 'Command to execute', required: true },
    args: { type: 'array', description: 'Command arguments', items: { type: 'string', description: 'Argument' }, required: false },
    cwd: { type: 'string', description: 'Working directory (default: workspace root)', required: false },
    timeout: { type: 'number', description: 'Timeout in milliseconds (default: 60000)', required: false },
    env: { type: 'object', description: 'Additional environment variables', required: false },
  },
  requiresApproval: (policy) => policy.shell !== 'auto',
  async execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    const command = args.command as string;
    const cmdArgs = (args.args as string[]) || [];
    const cwd = context.workspaceRoot;
    const timeout = (args.timeout as number) || 60000;
    const env = { ...process.env, ...(args.env as Record<string, string> || {}) };

    // Check allowlist
    if (context.approvalPolicy.allowlist?.commands.length) {
      const allowed = context.approvalPolicy.allowlist.commands.some(
        allowed => command === allowed || `${command} ${cmdArgs.join(' ')}`.startsWith(allowed)
      );
      if (!allowed) {
        return {
          success: false,
          error: `Command not in allowlist: ${command}`,
          requiresApproval: true,
        };
      }
    }

    return new Promise((resolve) => {
      const child = spawn(command, cmdArgs, { cwd, env, shell: true });

      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (data) => { stdout += data.toString(); });
      child.stderr?.on('data', (data) => { stderr += data.toString(); });

      const timeoutId = setTimeout(() => {
        child.kill('SIGTERM');
        resolve({
          success: false,
          error: `Command timed out after ${timeout}ms`,
          output: { stdout, stderr, code: -1 },
        });
      }, timeout);

      child.on('close', (code) => {
        clearTimeout(timeoutId);
        resolve({
          success: code === 0,
          output: { stdout, stderr, code },
          error: code !== 0 ? stderr || `Exited with code ${code}` : undefined,
        });
      });

      child.on('error', (error) => {
        clearTimeout(timeoutId);
        resolve({
          success: false,
          error: error.message,
        });
      });
    });
  },
};

export function registerShellTools(registry: { register: (tool: Tool) => void }): void {
  registry.register(runCommandTool);
}