# HackCulture — Privacy-First, Token-Optimized Coding Agent

> **Built for Global AI Hackathon Bifrost — Problem Statement 01**

A production-ready CLI coding agent that minimizes token consumption and cost without compromising code correctness, featuring Bifrost gateway integration for semantic caching, complexity routing, and automatic failover.

## ✨ Key Features

| Feature | Description |
|---------|-------------|
| **🔐 Code Privacy** | Confidential repositories processed **only by local models** (Ollama) — architectural guarantee, no cloud leakage |
| **💰 Budget Enforcement** | Hard pre-flight limits ($10/day default) with configurable alert thresholds (50/80/100%) |
| **⚡ Token Optimization** | Semantic caching (Bifrost), prompt caching (90%+), model routing (40-70% savings), context compaction (50-70% reduction) |
| **🔄 Reliability & Failover** | Automatic fallback: Bifrost primary → secondary providers → local models; continues through API outages |
| **🛡️ Action Approval** | Read=auto, Write/Shell/Git=prompt/batch/deny with command/path allowlist |
| **🔍 Integrated Search** | Tavily web search + extraction for research tasks |
| **🎨 TUI Dashboard** | Ink v5 + React: chat history, approval queue, budget/token bars, model selector, plan view, status bar, multi-line input with slash commands |

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        AGENT CORE                              │
│  Planning → Tool Execution → Session Persistence              │
└─────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┴───────────────┐
              ▼                               ▼
      ┌───────────────┐               ┌───────────────┐
      │  BIFROST      │               │  LOCAL MODELS │
      │  GATEWAY      │               │  (OLLAMA)     │
      │               │               │               │
      │ • Semantic    │               │ • Qwen 2.5    │
      │   caching     │               │   3B (~2GB)   │
      │ • Complexity  │               │ • Phi-4 Mini  │
      │   routing     │               │   3.8B(~2.5GB)│
      │ • Budget caps │               │ • SmolLM2     │
      │ • Failover    │               │   1.7B(~1GB)  │
      │ • Privacy     │               │ • CPU fallback│
      │   routing     │               │               │
      └───────────────┘               └───────────────┘
              │                               │
              └───────────────┬───────────────┘
                              ▼
                    ┌───────────────────┐
                    │  TOOL REGISTRY    │
                    │  (11 tools, 4     │
                    │   categories)     │
                    └───────────────────┘
```

## 🚀 Quick Start

### Prerequisites
- Node.js 20+
- (Optional) Docker for Bifrost gateway
- (Optional) Ollama for local models

### Installation

```bash
cd D:/NVIDIA-Claude/HACKCULTURE
npm install
npm run build
```

### Configuration

Create a config file (optional — uses defaults if omitted):

```yaml
# config.yaml
bifrost:
  url: "http://localhost:8080"
  virtualKey: "hackculture-default"

budget:
  dailyUsd: 10
  monthlyUsd: 100
  alertThresholds: [50, 80, 100]

privacy:
  defaultConfidential: false
  confidentialPaths: ["./secrets", "./private"]
  enforceLocalOnly: true

approval:
  read: "auto"
  write: "prompt"
  shell: "prompt"
  git: "prompt"

localModels:
  ollamaUrl: "http://localhost:11434"
  preferredModels:
    coding: "qwen2.5:3b"
    reasoning: "phi4-mini:3.8b"
    basic: "smollm2:1.7b"
```

### Running the Agent

```bash
# Interactive TUI chat (recommended)
npm start -- chat

# Interactive chat without TUI (CI/headless)
npm start -- chat --no-tui

# Single prompt execution
npm start -- run "refactor the auth module to use JWT"

# List available models
npm start -- models

# Show budget status
npm start -- budget

# Resume previous session
npm start -- session <session-id>

# Show current configuration
npm start -- config
```

### CLI Options

| Option | Description |
|--------|-------------|
| `-w, --workspace <path>` | Workspace root directory (default: cwd) |
| `-c, --config <path>` | Config file path |
| `--bifrost-url <url>` | Bifrost gateway URL |
| `--virtual-key <key>` | Bifrost virtual key |
| `--no-local-models` | Disable local models |
| `--privacy-mode` | Enable privacy mode (local only for confidential code) |
| `--model <model>` | Default model to use |
| `--budget <usd>` | Daily budget in USD (default: 10) |
| `--tavily-key <key>` | Tavily API key |
| `--session-dir <path>` | Session directory |

### TUI Keybindings

| Key | Action |
|-----|--------|
| `Tab` | Toggle model selector |
| `Ctrl+C` | Cancel processing / Exit |
| `Ctrl+D` | Exit |
| `A` | Allow pending approval |
| `D` | Deny pending approval |
| `S` | Allow for session |
| `W` | Allow always |
| `↑/↓` | Input history navigation |
| `←/→` | Cursor movement |
| `Home/End` | Jump to start/end of input |
| `Backspace/Delete` | Delete characters |
| `Shift+Enter` | New line in input |
| `Ctrl+P` | Command palette |

### Slash Commands (TUI)

| Command | Description |
|---------|-------------|
| `/help` | Show help |
| `/model` | Show model selector |
| `/budget` | Show budget status |
| `/clear` | Clear chat history |
| `/plan` | Show current plan |
| `/approve` | Show pending approvals |
| `/session` | Show session info |
| `/exit` | Exit the agent |

## 🧪 Testing

```bash
# Run unit tests (113 tests)
npm test

# Run with watch mode
npm run test:watch

# Run E2E integration tests (requires Docker + services)
docker compose -f docker-compose.test.yml up -d
RUN_INTEGRATION_TESTS=true npm run test:e2e

# Lint
npm run lint
```

## 📁 Project Structure

```
D:/NVIDIA-Claude/HACKCULTURE/
├── src/
│   ├── config/           # Zod schemas + loader (7 config sections)
│   ├── gateway/          # BifrostClient (chat, health, budget)
│   ├── local/            # OllamaManager + ModelSelector
│   ├── tools/
│   │   ├── fs-tools.ts   # read/write/edit/list/glob/grep (6 tools)
│   │   ├── shell-tools.ts# run_command (allowlist, timeout)
│   │   ├── git-tools.ts  # status/diff/commit/push (4 tools)
│   │   └── search-tools.ts# tavily_search/extract (2 tools)
│   ├── approval/         # ApprovalGate (prompt/batch/deny/auto)
│   ├── session/          # SessionManager (JSONL + compaction)
│   ├── tavily/           # TavilyClient (search/extract)
│   ├── router/           # ModelRouter + BudgetEnforcer
│   ├── agent/            # AgentCore (planning + execution loop)
│   └── cli/              # Commander.js CLI + Ink TUI
├── tests/                # 126 tests (113 unit, 13 integration)
├── config/
│   └── default.yaml      # All defaults
├── docker/
│   └── bifrost/config.yaml # Virtual keys, complexity router, failover
├── docker-compose.yml    # Bifrost service
├── docker-compose.test.yml # Bifrost + Ollama test services
├── package.json
├── tsconfig.json
├── eslint.config.js
└── README.md
```

## 🔧 Configuration Reference

See `src/config/schema.ts` for complete Zod schemas. Key sections:

### Bifrost Gateway
```typescript
{
  url: "http://localhost:8080",
  virtualKey: "hackculture-default",
  timeoutMs: 120000,
  retryAttempts: 3,
  enableCodeMode: true,
  enableSemanticCache: true,
}
```

### Budget
```typescript
{
  dailyUsd: 10,
  monthlyUsd: 100,
  perTaskUsd: 5,
  alertThresholds: [50, 80, 100],
  onExceed: "pause_and_alert",
  webhookUrl?: string,
}
```

### Privacy
```typescript
{
  defaultConfidential: false,
  confidentialPaths: ["./secrets"],
  enforceLocalOnly: true,
  fallbackChain: ["qwen2.5:3b", "phi4-mini:3.8b", "smollm2:1.7b"],
}
```

### Local Models (Ollama)
```typescript
{
  ollamaUrl: "http://localhost:11434",
  maxVramGb: 4,
  preferredModels: {
    coding: "qwen2.5:3b",
    reasoning: "phi4-mini:3.8b",
    basic: "smolm2:1.7b",
    classification: "smollm2:1.7b",
  },
  autoPull: true,
  cpuFallback: true,
}
```

## 🐳 Docker Deployment

### Bifrost Gateway
```bash
docker compose up -d
```

### Test Environment (Bifrost + Ollama with pre-pulled models)
```bash
docker compose -f docker-compose.test.yml up -d
```

## 📚 Documentation

- **[ARCHITECTURE.md](ARCHITECTURE.md)** — Module boundaries, data flows, routing logic
- **[API.md](API.md)** — Tool schemas, CLI reference, config reference

## 🔐 Security

- **No secrets committed** — Tavily API key via CLI flag or config (gitignored)
- **Path traversal protected** — All FS tools validate paths against workspace root
- **Approval required** — Write/shell/git operations need explicit user consent
- **Privacy mode enforced** — Confidential code never leaves local machine
- **Budget hard limits** — Pre-flight check before every request

## 📊 Token Optimization Strategies

| Strategy | Savings |
|----------|---------|
| Prompt caching (Bifrost) | 90%+ on repeated context |
| Semantic caching (Bifrost) | 40-70% on similar requests |
| Complexity routing | Cheaper models for simple tasks |
| Local model fallback | $0 for confidential/over-budget |
| Context compaction | 50-70% token reduction |
| Tool context reduction (Code Mode) | 58-93% for coding tasks |

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Run tests: `npm test && npm run lint`
4. Submit a PR

## 📄 License

MIT License — see LICENSE file for details.

---

**Built with ❤️ for the Global AI Hackathon Bifrost by Maxim AI**