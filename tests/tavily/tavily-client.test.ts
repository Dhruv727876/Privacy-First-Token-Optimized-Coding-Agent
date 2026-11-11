import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TavilyClient, createTavilyClient } from '../../src/tavily/tavily-client.js';
import type { TavilySearchOptions, TavilySearchResponse, TavilyExtractOptions } from '../../src/tavily/types.js';

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('TavilyClient', () => {
  let client: TavilyClient;

  beforeEach(() => {
    vi.resetAllMocks();
    client = createTavilyClient({ apiKey: 'test-key' });
  });

  it('searches with default options', async () => {
    const mockResponse: TavilySearchResponse = {
      results: [
        { title: 'Result 1', url: 'https://example.com/1', content: 'Content 1', score: 0.9 },
        { title: 'Result 2', url: 'https://example.com/2', content: 'Content 2', score: 0.8 },
      ],
      answer: 'Test answer',
      query: 'test query',
      responseTime: 100,
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: mockResponse.results,
        answer: mockResponse.answer,
        response_time: mockResponse.responseTime,
      }),
    });

    const options: TavilySearchOptions = { query: 'test query' };
    const result = await client.search(options);

    expect(result.query).toBe('test query');
    expect(result.results).toHaveLength(2);
    expect(result.answer).toBe('Test answer');
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.tavily.com/search',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('test query'),
      })
    );
  });

  it('searches with custom options', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: [], response_time: 50 }),
    });

    const options: TavilySearchOptions = {
      query: 'custom query',
      maxResults: 10,
      searchDepth: 'basic',
      includeDomains: ['example.com'],
      excludeDomains: ['spam.com'],
      includeAnswer: false,
      includeRawContent: true,
      includeImages: true,
    };

    await client.search(options);

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.tavily.com/search',
      expect.objectContaining({
        body: expect.stringContaining('"max_results":10'),
      })
    );
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.tavily.com/search',
      expect.objectContaining({
        body: expect.stringContaining('"search_depth":"basic"'),
      })
    );
  });

  it('extracts content from URLs', async () => {
    const mockResponse: TavilyExtractResponse = {
      results: [
        { url: 'https://example.com/1', content: 'Extracted content 1' },
        { url: 'https://example.com/2', content: 'Extracted content 2' },
      ],
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: mockResponse.results }),
    });

    const options: TavilyExtractOptions = {
      urls: ['https://example.com/1', 'https://example.com/2'],
      includeRawContent: true,
    };

    const result = await client.extract(options);

    expect(result.results).toHaveLength(2);
    expect(result.results[0].url).toBe('https://example.com/1');
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.tavily.com/extract',
      expect.objectContaining({
        body: expect.stringContaining('https://example.com/1'),
      })
    );
  });

  it('handles API errors', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => 'Unauthorized',
    });

    await expect(client.search({ query: 'test' })).rejects.toThrow('Tavily API error (401): Unauthorized');
  });

  it('retries on transient errors', async () => {
    mockFetch
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ results: [], response_time: 50 }),
      });

    const clientWithRetry = createTavilyClient({ apiKey: 'test-key', maxRetries: 2 });
    await clientWithRetry.search({ query: 'test' });

    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('does not retry on client errors', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: async () => 'Bad Request',
    });

    await expect(client.search({ query: 'test' })).rejects.toThrow('Tavily API error (400): Bad Request');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('handles timeout in request', async () => {
    // Test that timeout option is passed to fetch
    const timeoutClient = createTavilyClient({ apiKey: 'test-key', timeout: 1000 });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: [], response_time: 50 }),
    });

    await timeoutClient.search({ query: 'test' });
    // Verify fetch was called (timeout is handled by AbortController internally)
    expect(mockFetch).toHaveBeenCalled();
  });

  it('health check returns true on success', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: [], response_time: 50 }),
    });

    const healthy = await client.healthCheck();
    expect(healthy).toBe(true);
  });

  it('health check returns false on failure', async () => {
    // Health check calls search which retries - use client with 0 retries
    const noRetryClient = createTavilyClient({ apiKey: 'test-key', maxRetries: 0 });
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    const healthy = await noRetryClient.healthCheck();
    expect(healthy).toBe(false);
  }, 10000);

  it('uses custom base URL', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: [], response_time: 50 }),
    });

    const customClient = createTavilyClient({ apiKey: 'test-key', baseUrl: 'https://custom.tavily.com' });
    await customClient.search({ query: 'test' });

    expect(mockFetch).toHaveBeenCalledWith(
      'https://custom.tavily.com/search',
      expect.any(Object)
    );
  });
});