import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { glob } from 'glob';
import type { Tool, ToolContext, ToolResult } from './types.js';

function validatePath(workspaceRoot: string, requestedPath: string): string {
  const absoluteRoot = path.resolve(workspaceRoot);
  const absolutePath = path.resolve(absoluteRoot, requestedPath);

  if (!absolutePath.startsWith(absoluteRoot + path.sep) && absolutePath !== absoluteRoot) {
    throw new Error(`Path traversal attempt blocked: ${requestedPath}`);
  }

  return absolutePath;
}

export const readFileTool: Tool = {
  name: 'read_file',
  description: 'Read the contents of a file',
  parameters: {
    path: { type: 'string', description: 'Path to the file relative to workspace root', required: true },
    encoding: { type: 'string', description: 'File encoding (default: utf-8)', required: false },
  },
  requiresApproval: () => false,
  async execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    try {
      const filePath = validatePath(context.workspaceRoot, args.path as string);
      const encoding = ((args.encoding as string) || 'utf-8') as BufferEncoding;
      const content = await fs.readFile(filePath, encoding);
      return { success: true, output: content };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to read file',
      };
    }
  },
};

export const writeFileTool: Tool = {
  name: 'write_file',
  description: 'Write content to a file (creates or overwrites)',
  parameters: {
    path: { type: 'string', description: 'Path to the file relative to workspace root', required: true },
    content: { type: 'string', description: 'Content to write', required: true },
    encoding: { type: 'string', description: 'File encoding (default: utf-8)', required: false },
  },
  requiresApproval: (policy) => policy.write !== 'auto',
  async execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    try {
      const filePath = validatePath(context.workspaceRoot, args.path as string);
      const content = args.content as string;
      const encoding = ((args.encoding as string) || 'utf-8') as BufferEncoding;
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, content, encoding);
      return { success: true, output: `Written ${content.length} bytes to ${args.path}` };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to write file',
      };
    }
  },
};

export const editFileTool: Tool = {
  name: 'edit_file',
  description: 'Edit a file by replacing a specific string',
  parameters: {
    path: { type: 'string', description: 'Path to the file', required: true },
    oldString: { type: 'string', description: 'String to replace', required: true },
    newString: { type: 'string', description: 'Replacement string', required: true },
    replaceAll: { type: 'boolean', description: 'Replace all occurrences (default: false)', required: false },
  },
  requiresApproval: (policy) => policy.write !== 'auto',
  async execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    try {
      const filePath = validatePath(context.workspaceRoot, args.path as string);
      const oldString = args.oldString as string;
      const newString = args.newString as string;
      const replaceAll = args.replaceAll as boolean || false;

      let content = await fs.readFile(filePath, 'utf-8');
      if (replaceAll) {
        content = content.split(oldString).join(newString);
      } else {
        if (!content.includes(oldString)) {
          return { success: false, error: 'Old string not found in file' };
        }
        content = content.replace(oldString, newString);
      }
      await fs.writeFile(filePath, content, 'utf-8');
      return { success: true, output: `Edited ${args.path}` };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to edit file',
      };
    }
  },
};

export const listDirTool: Tool = {
  name: 'list_dir',
  description: 'List directory contents',
  parameters: {
    path: { type: 'string', description: 'Directory path (default: workspace root)', required: false },
  },
  requiresApproval: () => false,
  async execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    try {
      const dirPath = validatePath(context.workspaceRoot, (args.path as string) || '.');
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      const output = entries.map(e => ({
        name: e.name,
        type: e.isDirectory() ? 'directory' : e.isFile() ? 'file' : 'other',
      }));
      return { success: true, output };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to list directory',
      };
    }
  },
};

export const globTool: Tool = {
  name: 'glob',
  description: 'Find files matching a glob pattern',
  parameters: {
    pattern: { type: 'string', description: 'Glob pattern (e.g., **/*.ts)', required: true },
    cwd: { type: 'string', description: 'Working directory (default: workspace root)', required: false },
  },
  requiresApproval: () => false,
  async execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    try {
      const pattern = args.pattern as string;
      const cwd = validatePath(context.workspaceRoot, (args.cwd as string) || '.');
      const matches = await glob(pattern, { cwd, absolute: false });
      return { success: true, output: matches };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Glob failed',
      };
    }
  },
};

export const grepTool: Tool = {
  name: 'grep',
  description: 'Search for a pattern in files',
  parameters: {
    pattern: { type: 'string', description: 'Regex pattern to search for', required: true },
    path: { type: 'string', description: 'Directory to search (default: workspace root)', required: false },
    include: { type: 'string', description: 'File pattern to include (e.g., *.ts)', required: false },
  },
  requiresApproval: () => false,
  async execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    try {
      const pattern = args.pattern as string;
      const searchPath = validatePath(context.workspaceRoot, (args.path as string) || '.');
      const include = args.include as string;
      const files = await glob(include || '**/*', { cwd: searchPath, absolute: true });
      const regex = new RegExp(pattern);
      const results: Array<{ file: string; line: number; content: string }> = [];

      for (const file of files) {
        try {
          const content = await fs.readFile(file, 'utf-8');
          const lines = content.split('\n');
          lines.forEach((line, i) => {
            if (regex.test(line)) {
              results.push({
                file: path.relative(context.workspaceRoot, file),
                line: i + 1,
                content: line.trim(),
              });
            }
          });
        } catch {
          // Skip binary/unreadable files
        }
      }

      return { success: true, output: results };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Grep failed',
      };
    }
  },
};

export function registerFsTools(registry: { register: (tool: Tool) => void }): void {
  registry.register(readFileTool);
  registry.register(writeFileTool);
  registry.register(editFileTool);
  registry.register(listDirTool);
  registry.register(globTool);
  registry.register(grepTool);
}