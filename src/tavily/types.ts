export interface TavilySearchOptions {
  query: string;
  maxResults?: number;
  searchDepth?: 'basic' | 'advanced';
  includeDomains?: string[];
  excludeDomains?: string[];
  includeAnswer?: boolean;
  includeRawContent?: boolean;
  includeImages?: boolean;
}

export interface TavilySearchResult {
  title: string;
  url: string;
  content: string;
  score: number;
  rawContent?: string;
}

export interface TavilySearchResponse {
  results: TavilySearchResult[];
  answer?: string;
  images?: Array<{ url: string; description: string }>;
  query: string;
  responseTime: number;
}

export interface TavilyExtractOptions {
  urls: string[];
  includeRawContent?: boolean;
}

export interface TavilyExtractResult {
  url: string;
  content: string;
  rawContent?: string;
}

export interface TavilyExtractResponse {
  results: TavilyExtractResult[];
}

export interface TavilyClientConfig {
  apiKey: string;
  baseUrl?: string;
  timeout?: number;
  maxRetries?: number;
}