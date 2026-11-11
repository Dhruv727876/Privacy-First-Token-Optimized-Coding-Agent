import type { Tool, ToolContext, ToolResult } from './types.js';
import type { TavilyClient } from '../tavily/tavily-client.js';
import type { TavilySearchOptions, TavilyExtractOptions } from '../tavily/types.js';

export function createTavilySearchTool(tavilyClient: TavilyClient): Tool {
  return {
    name: 'tavily_search',
    description: 'Search the web using Tavily',
    parameters: {
      query: { type: 'string', description: 'Search query', required: true },
      maxResults: { type: 'number', description: 'Maximum results (default: 5)', required: false },
      searchDepth: { type: 'string', enum: ['basic', 'advanced'], description: 'Search depth (default: advanced)', required: false },
    },
    requiresApproval: () => false,
    async execute(args: Record<string, unknown>, _context: ToolContext): Promise<ToolResult> {
      try {
        const options: TavilySearchOptions = {
          query: args.query as string,
          maxResults: (args.maxResults as number) || 5,
          searchDepth: (args.searchDepth as 'basic' | 'advanced') || 'advanced',
        };
        const response = await tavilyClient.search(options);
        return { success: true, output: response.results };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Tavily search failed',
        };
      }
    },
  };
}

export function createTavilyExtractTool(tavilyClient: TavilyClient): Tool {
  return {
    name: 'tavily_extract',
    description: 'Extract content from URLs using Tavily',
    parameters: {
      urls: { type: 'array', description: 'URLs to extract', items: { type: 'string', description: 'URL to extract' }, required: true },
    },
    requiresApproval: () => false,
    async execute(args: Record<string, unknown>, _context: ToolContext): Promise<ToolResult> {
      try {
        const urls = args.urls as string[];
        const options: TavilyExtractOptions = { urls };
        const response = await tavilyClient.extract(options);
        return { success: true, output: response.results };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Tavily extract failed',
        };
      }
    },
  };
}

export function registerSearchTools(
  registry: { register: (tool: Tool) => void },
  tavilyClient: TavilyClient
): void {
  registry.register(createTavilySearchTool(tavilyClient));
  registry.register(createTavilyExtractTool(tavilyClient));
}