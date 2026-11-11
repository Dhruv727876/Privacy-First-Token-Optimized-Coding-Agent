import { spawn } from 'node:child_process';
import type { Tool, ToolContext, ToolResult } from './types.js';

function git(args: string[], cwd: string): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    const child = spawn('git', args, { cwd, shell: true });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', d => { stdout += d.toString(); });
    child.stderr?.on('data', d => { stderr += d.toString(); });
    child.on('close', code => resolve({ stdout, stderr, code: code || 0 }));
    child.on('error', err => resolve({ stdout, stderr: err.message, code: -1 }));
  });
}

export const gitStatusTool: Tool = {
  name: 'git_status',
  description: 'Show git working tree status',
  parameters: {
    path: { type: 'string', description: 'Repository path (default: workspace root)', required: false },
  },
  requiresApproval: (policy) => policy.git !== 'auto',
  async execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    const repoPath = (args.path as string) || context.workspaceRoot;
    const result = await git(['status', '--porcelain'], repoPath);
    return result.code === 0
      ? { success: true, output: result.stdout }
      : { success: false, error: result.stderr };
  },
};

export const gitDiffTool: Tool = {
  name: 'git_diff',
  description: 'Show git diff',
  parameters: {
    path: { type: 'string', description: 'Repository path', required: false },
    staged: { type: 'boolean', description: 'Show staged changes', required: false },
    file: { type: 'string', description: 'Specific file to diff', required: false },
  },
  requiresApproval: (policy) => policy.git !== 'auto',
  async execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    const repoPath = (args.path as string) || context.workspaceRoot;
    const cmdArgs = ['diff'];
    if (args.staged) cmdArgs.push('--cached');
    if (args.file) cmdArgs.push(args.file as string);
    const result = await git(cmdArgs, repoPath);
    return result.code === 0
      ? { success: true, output: result.stdout }
      : { success: false, error: result.stderr };
  },
};

export const gitCommitTool: Tool = {
  name: 'git_commit',
  description: 'Create a git commit',
  parameters: {
    message: { type: 'string', description: 'Commit message', required: true },
    path: { type: 'string', description: 'Repository path', required: false },
    addAll: { type: 'boolean', description: 'Stage all changes before commit', required: false },
  },
  requiresApproval: (policy) => policy.git !== 'auto',
  async execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    const repoPath = (args.path as string) || context.workspaceRoot;
    const message = args.message as string;
    const addAll = args.addAll as boolean || false;

    if (addAll) {
      const addResult = await git(['add', '-A'], repoPath);
      if (addResult.code !== 0) {
        return { success: false, error: `git add failed: ${addResult.stderr}` };
      }
    }

    const commitResult = await git(['commit', '-m', message], repoPath);
    return commitResult.code === 0
      ? { success: true, output: commitResult.stdout }
      : { success: false, error: commitResult.stderr };
  },
};

export const gitPushTool: Tool = {
  name: 'git_push',
  description: 'Push commits to remote',
  parameters: {
    path: { type: 'string', description: 'Repository path', required: false },
    remote: { type: 'string', description: 'Remote name (default: origin)', required: false },
    branch: { type: 'string', description: 'Branch name', required: false },
    force: { type: 'boolean', description: 'Force push', required: false },
  },
  requiresApproval: (policy) => policy.git !== 'auto',
  async execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    const repoPath = (args.path as string) || context.workspaceRoot;
    const remote = (args.remote as string) || 'origin';
    const branch = args.branch as string;
    const force = args.force as boolean || false;

    const cmdArgs = ['push'];
    if (force) cmdArgs.push('--force');
    cmdArgs.push(remote);
    if (branch) cmdArgs.push(branch);

    const result = await git(cmdArgs, repoPath);
    return result.code === 0
      ? { success: true, output: result.stdout }
      : { success: false, error: result.stderr };
  },
};

export function registerGitTools(registry: { register: (tool: Tool) => void }): void {
  registry.register(gitStatusTool);
  registry.register(gitDiffTool);
  registry.register(gitCommitTool);
  registry.register(gitPushTool);
}