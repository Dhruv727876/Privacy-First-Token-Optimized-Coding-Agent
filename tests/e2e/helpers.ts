import { spawn, SpawnOptions } from 'child_process';
import { BifrostClient, createBifrostClient } from '../../src/gateway/bifrost-client.js';
import { OllamaManager } from '../../src/local/ollama-manager.js';
import type { ModelInfo } from '../../src/local/types.js';

export const TEST_BIFROST_URL = process.env.TEST_BIFROST_URL || 'http://localhost:8081';
export const TEST_OLLAMA_URL = process.env.TEST_OLLAMA_URL || 'http://localhost:11435';
export const TEST_VIRTUAL_KEY = 'hackculture-default';

export interface TestServices {
  bifrost: BifrostClient;
  ollama: OllamaManager;
}

export async function waitForService(url: string, maxRetries = 30, intervalMs = 2000): Promise<boolean> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(`${url}/health`);
      if (response.ok) {
        return true;
      }
    } catch {
      // Ignore and retry
    }
    await new Promise(r => setTimeout(r, intervalMs));
  }
  return false;
}

export async function startTestServices(): Promise<TestServices> {
  // Wait for Bifrost
  const bifrostReady = await waitForService(TEST_BIFROST_URL);
  if (!bifrostReady) {
    throw new Error(`Bifrost not ready at ${TEST_BIFROST_URL} after timeout`);
  }

  // Wait for Ollama
  const ollamaReady = await waitForService(TEST_OLLAMA_URL);
  if (!ollamaReady) {
    throw new Error(`Ollama not ready at ${TEST_OLLAMA_URL} after timeout`);
  }

  const bifrost = createBifrostClient({
    baseUrl: TEST_BIFROST_URL,
    virtualKey: TEST_VIRTUAL_KEY,
    timeoutMs: 30000,
    retryAttempts: 1,
  });

  const ollama = new OllamaManager({
    baseUrl: TEST_OLLAMA_URL,
    timeoutMs: 30000,
  });

  return { bifrost, ollama };
}

export function runDockerCompose(args: string[], options: SpawnOptions = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('docker-compose', ['-f', 'docker-compose.test.yml', ...args], {
      stdio: ['pipe', 'pipe', 'pipe'],
      ...options,
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (data) => { stdout += data.toString(); });
    child.stderr?.on('data', (data) => { stderr += data.toString(); });

    child.on('close', (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(`docker-compose exited with code ${code}: ${stderr}`));
      }
    });

    child.on('error', reject);
  });
}

export async function pullTestModels(ollama: OllamaManager): Promise<ModelInfo[]> {
  const models = await ollama.listModels();
  return models;
}

export function getEnvOrDefault(key: string, defaultValue: string): string {
  return process.env[key] || defaultValue;
}

export const TEST_TIMEOUT = 120000; // 2 minutes for integration tests