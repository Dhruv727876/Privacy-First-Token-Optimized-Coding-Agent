import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTavilySearchTool, createTavilyExtractTool, registerSearchTools } from '../../src/tools/search-tools.js';
import type { ToolContext } from '../../src/tools/types.js';

const mockTavilyClient = {
  search: vi.fn(),
  extract: vi.fn(),
};

const testContext: ToolContext = {
  workspaceRoot: '/tmp/test',
  approvalPolicy: { read: 'auto', write: 'auto', shell: 'auto', git: 'auto' },
  sessionId: 'test',
};

beforeEach(() => {
  vi.resetAllMocks();
});

describe('createTavilySearchTool', () => {
  it('searches and returns results', async () => {
    const mockResults = [
      { title: 'Result 1', url: 'https://example.com/1', content: 'Content 1', score: 0.9 },
      { title: 'Result 2', url: 'https://example.com/2', content: 'Content 2', score: 0.8 },
    ];
    mockTavilyClient.search.mockResolvedValue({ results: mockResults, query: 'test query', responseTime: 100 });

    const tool = createTavilySearchTool(mockTavilyClient);
    const result = await tool.execute({ query: 'test query', maxResults: 5 }, testContext);

    expect(result.success).toBe(true);
    expect(result.output).toEqual(mockResults);
    expect(mockTavilyClient.search).toHaveBeenCalledWith({ query: 'test query', maxResults: 5, searchDepth: 'advanced' });
  });

  it('uses default maxResults and searchDepth', async () => {
    mockTavilyClient.search.mockResolvedValue({ results: [], query: 'test', responseTime: 100 });
    const tool = createTavilySearchTool(mockTavilyClient);
    await tool.execute({ query: 'test' }, testContext);
    expect(mockTavilyClient.search).toHaveBeenCalledWith({ query: 'test', maxResults: 5, searchDepth: 'advanced' });
  });

  it('handles search error', async () => {
    mockTavilyClient.search.mockRejectedValue(new Error('API error'));
    const tool = createTavilySearchTool(mockTavilyClient);
    const result = await tool.execute({ query: 'test' }, testContext);
    expect(result.success).toBe(false);
    expect(result.error).toContain('API error');
  });
});

describe('createTavilyExtractTool', () => {
  it('extracts content from URLs', async () => {
    const mockResults = [
      { url: 'https://example.com/1', content: 'Extracted content 1' },
      { url: 'https://example.com/2', content: 'Extracted content 2' },
    ];
    mockTavilyClient.extract.mockResolvedValue({ results: mockResults });

    const tool = createTavilyExtractTool(mockTavilyClient);
    const result = await tool.execute({ urls: ['https://example.com/1', 'https://example.com/2'] }, testContext);

    expect(result.success).toBe(true);
    expect(result.output).toEqual(mockResults);
    expect(mockTavilyClient.extract).toHaveBeenCalledWith({ urls: ['https://example.com/1', 'https://example.com/2'] });
  });

  it('handles extract error', async () => {
    mockTavilyClient.extract.mockRejectedValue(new Error('Extract failed'));
    const tool = createTavilyExtractTool(mockTavilyClient);
    const result = await tool.execute({ urls: ['https://example.com'] }, testContext);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Extract failed');
  });
});

describe('registerSearchTools', () => {
  it('registers both search and extract tools', () => {
    const registry: { tools: string[]; register: (t: { name: string }) => void } = {
      tools: [],
      register(t) { this.tools.push(t.name); },
    };
    registerSearchTools(registry, mockTavilyClient);
    expect(registry.tools).toContain('tavily_search');
    expect(registry.tools).toContain('tavily_extract');
  });
});