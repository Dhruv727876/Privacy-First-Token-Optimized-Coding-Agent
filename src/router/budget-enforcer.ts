import * as fs from 'node:fs';
import type { BudgetEnforcer, BudgetStatus } from './types.js';

export class BudgetEnforcerImpl implements BudgetEnforcer {
  private dailyLimit: number;
  private used: number = 0;
  private lastReset: number = Date.now();

  constructor(dailyLimitUsd: number) {
    this.dailyLimit = dailyLimitUsd;
    this.loadFromStorage();
  }

  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem('hackculture-budget');
      if (stored) {
        const data = JSON.parse(stored);
        const now = Date.now();
        // Reset if it's a new day
        if (now - data.lastReset > 24 * 60 * 60 * 1000) {
          this.used = 0;
          this.lastReset = now;
        } else {
          this.used = data.used || 0;
          this.lastReset = data.lastReset || now;
        }
      }
    } catch {
      // Ignore storage errors
    }
  }

  private saveToStorage(): void {
    try {
      localStorage.setItem('hackculture-budget', JSON.stringify({
        used: this.used,
        lastReset: this.lastReset,
      }));
    } catch {
      // Ignore storage errors
    }
  }

  checkBudget(estimatedCost: number): boolean {
    return this.used + estimatedCost <= this.dailyLimit;
  }

  recordUsage(cost: number): void {
    this.used += cost;
    this.saveToStorage();
  }

  getStatus(): BudgetStatus {
    return {
      used: this.used,
      limit: this.dailyLimit,
      remaining: Math.max(0, this.dailyLimit - this.used),
      percentage: this.dailyLimit > 0 ? (this.used / this.dailyLimit) * 100 : 0,
    };
  }

  reset(): void {
    this.used = 0;
    this.lastReset = Date.now();
    this.saveToStorage();
  }

  setDailyLimit(limit: number): void {
    this.dailyLimit = limit;
  }
}

export function createBudgetEnforcer(dailyLimitUsd: number): BudgetEnforcer {
  return new BudgetEnforcerImpl(dailyLimitUsd);
}

// Node.js compatible version (uses file instead of localStorage)
export class BudgetEnforcerNode implements BudgetEnforcer {
  private dailyLimit: number;
  private used: number = 0;
  private lastReset: number = Date.now();
  private storagePath: string;

  constructor(dailyLimitUsd: number, storagePath: string = '.hackculture-budget.json') {
    this.dailyLimit = dailyLimitUsd;
    this.storagePath = storagePath;
    this.loadFromStorage();
  }

  private loadFromStorage(): void {
    try {
      if (fs.existsSync(this.storagePath)) {
        const data = JSON.parse(fs.readFileSync(this.storagePath, 'utf-8'));
        const now = Date.now();
        if (now - data.lastReset > 24 * 60 * 60 * 1000) {
          this.used = 0;
          this.lastReset = now;
        } else {
          this.used = data.used || 0;
          this.lastReset = data.lastReset || now;
        }
      }
    } catch {
      // Ignore
    }
  }

  private saveToStorage(): void {
    try {
      fs.writeFileSync(this.storagePath, JSON.stringify({
        used: this.used,
        lastReset: this.lastReset,
      }));
    } catch {
      // Ignore
    }
  }

  checkBudget(estimatedCost: number): boolean {
    return this.used + estimatedCost <= this.dailyLimit;
  }

  recordUsage(cost: number): void {
    this.used += cost;
    this.saveToStorage();
  }

  getStatus(): BudgetStatus {
    return {
      used: this.used,
      limit: this.dailyLimit,
      remaining: Math.max(0, this.dailyLimit - this.used),
      percentage: this.dailyLimit > 0 ? (this.used / this.dailyLimit) * 100 : 0,
    };
  }

  reset(): void {
    this.used = 0;
    this.lastReset = Date.now();
    this.saveToStorage();
  }
}

export function createBudgetEnforcerNode(dailyLimitUsd: number, storagePath?: string): BudgetEnforcer {
  return new BudgetEnforcerNode(dailyLimitUsd, storagePath);
}