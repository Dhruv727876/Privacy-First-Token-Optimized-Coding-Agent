import type { ModelInfo, TaskType, ModelSelectorConfig, ModelCapability } from './types.js';

const CAPABILITY_PRIORITY: Record<TaskType, ModelCapability[]> = {
  coding: ['coding', 'reasoning', 'basic'],
  reasoning: ['reasoning', 'coding', 'basic'],
  basic: ['basic', 'coding', 'reasoning'],
  classification: ['classification', 'basic', 'reasoning'],
};

const MODEL_VRAM_ESTIMATES: Record<string, number> = {
  'qwen2.5:3b': 2.5,
  'phi4-mini:3.8b': 3.0,
  'gemma3:4b': 3.5,
  'llama3.2:3b': 2.5,
  'smollm2:1.7b': 1.5,
  'mistral:7b-q4': 5.0,
};

export function createModelSelector(
  availableModels: ModelInfo[],
  config: ModelSelectorConfig
): (taskType: TaskType) => string | null {
  // Filter models that fit in VRAM (with 10% headroom)
  const maxVram = config.maxVramGb * 0.9;
  const vramCompatibleModels = availableModels.filter(m => {
    const vram = m.vramRequired || MODEL_VRAM_ESTIMATES[m.id] || m.size / 1e9 * 0.5;
    return vram <= maxVram;
  });

  // Map of model ID to model for quick lookup
  const modelMap = new Map(vramCompatibleModels.map(m => [m.id, m]));

  return (taskType: TaskType): string | null => {
    const preferred = config.preferredModels;
    const preferredKey = preferred[taskType] as string;

    // 1. First choice: task-specific preferred model (if available and fits VRAM)
    if (preferredKey && modelMap.has(preferredKey)) {
      return preferredKey;
    }

    // 2. Second: models with primary capability for this task type
    const priorities = CAPABILITY_PRIORITY[taskType] || ['basic'];
    for (const capability of priorities) {
      const matches = vramCompatibleModels.filter(m => m.capabilities.includes(capability));
      if (matches.length > 0) {
        // Sort by: preferred for this task > more capabilities > smaller size
        matches.sort((a, b) => {
          const aPref = a.id === preferredKey ? 1000 : 0;
          const bPref = b.id === preferredKey ? 1000 : 0;
          const aCap = a.capabilities.length * 10;
          const bCap = b.capabilities.length * 10;
          const aSize = a.vramRequired || 0;
          const bSize = b.vramRequired || 0;
          return (bPref + bCap - bSize) - (aPref + aCap - aSize);
        });
        return matches[0]?.id || null;
      }
    }

    // 3. Fallback chain
    for (const fallbackId of config.fallbackChain) {
      if (modelMap.has(fallbackId)) {
        return fallbackId;
      }
    }

    // 4. Last resort: any available model
    if (vramCompatibleModels.length > 0) {
      return vramCompatibleModels[0]?.id || null;
    }

    return null;
  };
}

export function estimateVramRequired(modelId: string, sizeBytes: number): number {
  return MODEL_VRAM_ESTIMATES[modelId] || sizeBytes / 1e9 * 0.5;
}