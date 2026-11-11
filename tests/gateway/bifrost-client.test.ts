import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BifrostClient, createBifrostClient } from '../../src/gateway/bifrost-client.js';
import type { ChatCompletionRequest, ChatCompletionResponse, HealthStatus } from '../../src/gateway/types.js';

describe('BifrostClient', () => {
  let client: BifrostClient;
  const mockBaseUrl = 'http://mock-bifrost:8080';

  beforeEach(() => {
    client = new BifrostClient({
      baseUrl: mockBaseUrl,
      virtualKey: 'test-key',
      timeoutMs: 5000,
      retryAttempts: 1,
    });
    vi.resetAllMocks();
  });

  it('constructs chat completion request with virtual key header', () => {
    const request: ChatCompletionRequest = {
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'test' }],
      stream: false,
    };

    const { headers, body } = client.buildRequest(request);

    expect(headers['Content-Type']).toBe('application/json');
    expect(headers['x-bifrost-virtual-key']).toBe('test-key');
    expect(body.model).toBe('gpt-4o-mini');
    expect(body.messages).toEqual([{ role: 'user', content: 'test' }]);
  });

  it('healthCheck returns healthy status when gateway responds', async () => {
    const mockHealth: HealthStatus = {
      healthy: true,
      version: '1.0.0',
      uptime_seconds: 3600,
      providers: {
        openai: { healthy: true, latency_ms: 50, last_check: new Date().toISOString() },
      },
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockHealth),
    } as Response);

    const health = await client.healthCheck();

    expect(health.healthy).toBe(true);
    expect(health.version).toBe('1.0.0');
    expect(global.fetch).toHaveBeenCalledWith(`${mockBaseUrl}/health`, expect.any(Object));
  });

  it('healthCheck returns unhealthy when gateway fails', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
    } as Response);

    const health = await client.healthCheck();

    expect(health.healthy).toBe(false);
    expect(health.version).toBe('unknown');
  });

  it('chatCompletion returns response on success', async () => {
    const mockResponse: ChatCompletionResponse = {
      id: 'chatcmpl-123',
      object: 'chat.completion',
      created: Date.now(),
      model: 'gpt-4o-mini',
      choices: [{
        index: 0,
        message: { role: 'assistant', content: 'Hello!' },
        finish_reason: 'stop',
      }],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    } as Response);

    const result = await client.chatCompletion({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'Hi' }],
    });

    expect(result.id).toBe('chatcmpl-123');
    expect(result.choices[0].message.content).toBe('Hello!');
  });

  it('chatCompletion throws on API error', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: () => Promise.resolve('Invalid request'),
    } as Response);

    await expect(client.chatCompletion({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'Hi' }],
    })).rejects.toThrow('Bifrost API error');
  });

  it('chatCompletion retries on failure', async () => {
    let callCount = 0;
    global.fetch = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        throw new Error('Network error');
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          id: 'chatcmpl-123',
          object: 'chat.completion',
          created: Date.now(),
          model: 'gpt-4o-mini',
          choices: [{ index: 0, message: { role: 'assistant', content: 'Hello!' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        }),
      } as Response);
    });

    const result = await client.chatCompletion({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'Hi' }],
    });

    expect(callCount).toBe(2);
    expect(result.choices[0].message.content).toBe('Hello!');
  });

  it('createBifrostClient uses defaults', () => {
    const c = createBifrostClient();
    const cfg = c.getConfig();
    expect(cfg.baseUrl).toBe('http://localhost:8080');
    expect(cfg.virtualKey).toBe('hackculture-default');
    expect(cfg.timeoutMs).toBe(120000);
    expect(cfg.retryAttempts).toBe(3);
  });

  it('createBifrostClient merges overrides', () => {
    const c = createBifrostClient({ baseUrl: 'http://custom:9000', timeoutMs: 60000 });
    const cfg = c.getConfig();
    expect(cfg.baseUrl).toBe('http://custom:9000');
    expect(cfg.timeoutMs).toBe(60000);
    expect(cfg.virtualKey).toBe('hackculture-default'); // default preserved
  });
});