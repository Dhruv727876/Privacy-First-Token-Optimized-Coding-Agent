import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { readFileTool, writeFileTool, editFileTool, listDirTool, globTool, grepTool } from '../../src/tools/fs-tools.js';
import type { ToolContext } from '../../src/tools/types.js';

const testDir = path.join(process.cwd(), 'test-workspace');
const testContext: ToolContext = {
  workspaceRoot: testDir,
  approvalPolicy: { read: 'auto', write: 'auto', shell: 'auto', git: 'auto' },
  sessionId: 'test',
};

beforeEach(async () => {
  await fs.rm(testDir, { recursive: true, force: true });
  await fs.mkdir(testDir, { recursive: true });
});

afterEach(async () => {
  await fs.rm(testDir, { recursive: true, force: true });
});

describe('readFileTool', () => {
  it('reads file content', async () => {
    await fs.writeFile(path.join(testDir, 'test.txt'), 'Hello World');
    const result = await readFileTool.execute({ path: 'test.txt' }, testContext);
    expect(result.success).toBe(true);
    expect(result.output).toBe('Hello World');
  });

  it('returns error for non-existent file', async () => {
    const result = await readFileTool.execute({ path: 'nonexistent.txt' }, testContext);
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('blocks path traversal', async () => {
    const result = await readFileTool.execute({ path: '../../etc/passwd' }, testContext);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Path traversal');
  });
});

describe('writeFileTool', () => {
  it('writes file content', async () => {
    const result = await writeFileTool.execute({ path: 'new.txt', content: 'New content' }, testContext);
    expect(result.success).toBe(true);
    const content = await fs.readFile(path.join(testDir, 'new.txt'), 'utf-8');
    expect(content).toBe('New content');
  });

  it('creates parent directories', async () => {
    const result = await writeFileTool.execute({ path: 'subdir/nested.txt', content: 'Nested' }, testContext);
    expect(result.success).toBe(true);
    const content = await fs.readFile(path.join(testDir, 'subdir/nested.txt'), 'utf-8');
    expect(content).toBe('Nested');
  });

  it('blocks path traversal', async () => {
    const result = await writeFileTool.execute({ path: '../../evil.txt', content: 'x' }, testContext);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Path traversal');
  });
});

describe('editFileTool', () => {
  it('replaces string in file', async () => {
    await fs.writeFile(path.join(testDir, 'edit.txt'), 'Hello World');
    const result = await editFileTool.execute({ path: 'edit.txt', oldString: 'World', newString: 'Universe' }, testContext);
    expect(result.success).toBe(true);
    const content = await fs.readFile(path.join(testDir, 'edit.txt'), 'utf-8');
    expect(content).toBe('Hello Universe');
  });

  it('returns error when old string not found', async () => {
    await fs.writeFile(path.join(testDir, 'edit.txt'), 'Hello World');
    const result = await editFileTool.execute({ path: 'edit.txt', oldString: 'Mars', newString: 'Universe' }, testContext);
    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('replaceAll replaces all occurrences', async () => {
    await fs.writeFile(path.join(testDir, 'edit.txt'), 'foo bar foo');
    const result = await editFileTool.execute({ path: 'edit.txt', oldString: 'foo', newString: 'baz', replaceAll: true }, testContext);
    expect(result.success).toBe(true);
    const content = await fs.readFile(path.join(testDir, 'edit.txt'), 'utf-8');
    expect(content).toBe('baz bar baz');
  });
});

describe('listDirTool', () => {
  it('lists directory contents', async () => {
    await fs.writeFile(path.join(testDir, 'a.txt'), 'a');
    await fs.mkdir(path.join(testDir, 'subdir'));
    const result = await listDirTool.execute({ path: '.' }, testContext);
    expect(result.success).toBe(true);
    expect(result.output).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'a.txt', type: 'file' }),
        expect.objectContaining({ name: 'subdir', type: 'directory' }),
      ])
    );
  });
});

describe('globTool', () => {
  it('finds files matching pattern', async () => {
    await fs.writeFile(path.join(testDir, 'a.ts'), 'a');
    await fs.writeFile(path.join(testDir, 'b.ts'), 'b');
    await fs.writeFile(path.join(testDir, 'c.js'), 'c');
    const result = await globTool.execute({ pattern: '*.ts' }, testContext);
    expect(result.success).toBe(true);
    expect(result.output).toEqual(expect.arrayContaining(['a.ts', 'b.ts']));
    expect(result.output).not.toContain('c.js');
  });
});

describe('grepTool', () => {
  it('searches for pattern in files', async () => {
    await fs.writeFile(path.join(testDir, 'a.ts'), 'export function foo() {}');
    await fs.writeFile(path.join(testDir, 'b.ts'), 'const bar = 1;');
    const result = await grepTool.execute({ pattern: 'function' }, testContext);
    expect(result.success).toBe(true);
    expect(result.output).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ file: 'a.ts', content: expect.stringContaining('function') }),
      ])
    );
    expect(result.output.length).toBe(1);
  });
});