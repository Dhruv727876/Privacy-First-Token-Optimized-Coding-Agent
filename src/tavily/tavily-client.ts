import type {
  TavilySearchOptions,
  TavilySearchResponse,
  TavilySearchResult,
  TavilyExtractOptions,
  TavilyExtractResponse,
  TavilyClientConfig,
} from './types.js';

const DEFAULT_BASE_URL = 'https://api.tavily.com';
const DEFAULT_TIMEOUT = 30000;
const DEFAULT_MAX_RETRIES = 3;

export class TavilyClient {
  private config: Required<TavilyClientConfig>;

  constructor(config: TavilyClientConfig) {
    this.config = {
      apiKey: config.apiKey,
      baseUrl: config.baseUrl || DEFAULT_BASE_URL,
      timeout: config.timeout ?? DEFAULT_TIMEOUT,
      maxRetries: config.maxRetries ?? DEFAULT_MAX_RETRIES,
    };
  }

  async search(options: TavilySearchOptions): Promise<TavilySearchResponse> {
    const payload = {
      api_key: this.config.apiKey,
      query: options.query,
      max_results: options.maxResults || 5,
      search_depth: options.searchDepth || 'advanced',
      include_domains: options.includeDomains,
      exclude_domains: options.excludeDomains,
      include_answer: options.includeAnswer ?? true,
      include_raw_content: options.includeRawContent ?? false,
      include_images: options.includeImages ?? false,
    };

    const response = await this.request('/search', payload);
    return this.transformSearchResponse(response, options.query);
  }

  async extract(options: TavilyExtractOptions): Promise<TavilyExtractResponse> {
    const payload = {
      api_key: this.config.apiKey,
      urls: options.urls,
      include_raw_content: options.includeRawContent ?? false,
    };

    const response = await this.request('/extract', payload);
    return this.transformExtractResponse(response);
  }

  private async request(endpoint: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

        const response = await fetch(`${this.config.baseUrl}${endpoint}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Tavily API error (${response.status}): ${errorText}`);
        }

        return (await response.json()) as Record<string, unknown>;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Don't retry on client errors (4xx)
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (errorMessage.includes('400') || errorMessage.includes('401') || errorMessage.includes('403')) {
          throw lastError;
        }

        if (attempt < this.config.maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError || new Error('Tavily request failed after retries');
  }

  private transformSearchResponse(response: Record<string, unknown>, query: string): TavilySearchResponse {
    const results = (response.results as Array<Record<string, unknown>>) || [];
    const transformedResults: TavilySearchResult[] = results.map(r => ({
      title: String(r.title || ''),
      url: String(r.url || ''),
      content: String(r.content || ''),
      score: Number(r.score || 0),
      rawContent: r.raw_content ? String(r.raw_content) : undefined,
    }));

    return {
      results: transformedResults,
      answer: response.answer ? String(response.answer) : undefined,
      images: response.images ? (response.images as Array<{ url: string; description: string }>) : undefined,
      query,
      responseTime: Number(response.response_time || 0),
    };
  }

  private transformExtractResponse(response: Record<string, unknown>): TavilyExtractResponse {
    const results = (response.results as Array<Record<string, unknown>>) || [];
    return {
      results: results.map(r => ({
        url: String(r.url || ''),
        content: String(r.content || ''),
        rawContent: r.raw_content ? String(r.raw_content) : undefined,
      })),
    };
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.search({ query: 'test', maxResults: 1 });
      return true;
    } catch {
      return false;
    }
  }
}

export function createTavilyClient(config: TavilyClientConfig): TavilyClient {
  return new TavilyClient(config);
}