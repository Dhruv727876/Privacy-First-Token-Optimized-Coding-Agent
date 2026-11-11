# Architecture Documentation

## Overview

HackCulture follows a **gateway-first architecture** where the Bifrost gateway handles cross-cutting concerns (caching, routing, budgeting, failover) at the infrastructure level, keeping the agent core thin and focused on planning, tool execution, and session persistence.

## Module Boundaries

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              AGENT CORE                                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌──────────────────┐  │
│  │   Planner   │  │  Executor   │  │   Session   │  │  Context Manager │  │
│  │             │  │             │  │  Manager    │  │                  │  │
│  │ • Task      │  │ • Tool      │  │ • JSONL     │  │ • Compaction     │  │
│  │   decomposition│  │   calls   │  │ • Persistence│  │ • Token budget   │  │
│  │ • Step      │  │ • Approval  │  │ • Resume    │  │ • History mgmt   │  │
│  │   planning  │  │   gates     │  │ • Compaction│  │                  │  │
│  └─────────────┘  └─────────────┘  └─────────────┘  └──────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
        ┌─────────────────────────────┼─────────────────────────────┐
        ▼                             ▼                             ▼
┌───────────────┐             ┌───────────────┐             ┌───────────────┐
│  BIFROST      │             │  LOCAL MODELS │             │  TOOL REGISTRY│
│  GATEWAY      │             │  (OLLAMA)     │             │  (11 tools)   │
│               │             │               │             │               │
│ • Semantic    │             │ • Qwen 2.5    │             │ • read_file   │
│   caching     │             │   3B (~2GB)   │             │ • write_file  │
│ • Complexity  │             │ • Phi-4 Mini  │             │ • edit_file   │
│   routing     │             │   3.8B        │             │ • list_dir    │
│ • Budget caps │             │ • SmolLM2     │             │ • glob        │
│ • Failover    │             │   1.7B        │             │ • grep        │
│ • Privacy     │             │ • CPU fallback│             │ • run_command │
│   routing     │             │               │             │ • git_status  │
└───────────────┘             └───────────────┘             │ • git_diff    │
                                                            │ • git_commit  │
                                                            │ • git_push    │
                                                            │ • tavily_search│
                                                            │ • tavily_extract
                                                            └───────────────┘
```

## Core Modules

### 1. Configuration System (`src/config/`)
- **Schema**: Zod v4 schemas for 7 config sections (Bifrost, Budget, Privacy, Approval, Local Models, Tavily, Session)
- **Loader**: Merges file config (YAML) + CLI overrides + environment variables
- **Validation**: Fail-fast on startup with clear error messages

### 2. Agent Core (`src/agent/`)
- **AgentCore**: Main execution loop with planning + tool execution
- **Planner**: Decomposes tasks into steps with tool assignments
- **Executor**: Runs tool calls through registry with approval gates
- **Session State**: Maintains message history, plan, token usage, pending approvals
- **Types**: `AgentConfig`, `AgentContext`, `AgentState`, `PlanStep`

### 3. Model Router (`src/router/`)
- **ModelRouterImpl**: Central routing logic with priority chain:
  1. **Privacy check** → Confidential code → Local models only
  2. **Budget check** → Over limit → Fallback to local
  3. **Preferred model** → Explicit user/model selection
  4. **Bifrost complexity routing** → Optimal model for task type
  5. **Local fallback** → Ollama models when Bifrost unavailable
- **BudgetEnforcer**: Pre-flight cost estimation, hard limits, usage recording
- **RouteDecision**: `{ target: 'bifrost'|'local', model, reason, estimatedCost, fallback }`

### 4. Bifrost Gateway Client (`src/gateway/`)
- **BifrostClient**: HTTP client for chat completions, health checks, budget queries
- **Features**: Retry logic, timeout handling, semantic cache via Bifrost, Code Mode tool reduction
- **Virtual Keys**: Budget-scoped API keys with daily/monthly/per-request limits

### 5. Local Models (`src/local/`)
- **OllamaManager**: Model listing, health checks, chat completions via Ollama API
- **ModelSelector**: VRAM-aware model selection (4GB RTX 3050 constraint)
  - Coding: `qwen2.5:3b` (Q4_K_M ~2GB)
  - Reasoning: `phi4-mini:3.8b` (Q4_K_M ~2.5GB)
  - Basic: `smollm2:1.7b` (Q4_K_M ~1GB)
  - CPU fallback when VRAM exceeded

### 6. Tool Registry (`src/tools/`)
- **ToolRegistry**: Central registry with category-based approval
- **11 Tools across 4 categories**:
  | Category | Tools | Approval Default |
  |----------|-------|------------------|
  | **Read** | `read_file`, `list_dir`, `glob`, `grep` | `auto` |
  | **Write** | `write_file`, `edit_file`, `delete_file` | `prompt` |
  | **Shell** | `run_command` | `prompt` |
  | **Git** | `git_status`, `git_diff`, `git_commit`, `git_push` | `prompt` |
  | **Search** | `tavily_search`, `tavily_extract` | `auto` |

### 7. Approval System (`src/approval/`)
- **ApprovalGate**: Handles prompt/batch/deny/auto policies with allowlist
- **Decisions**: `allow`, `deny`, `allow-session`, `allow-always`
- **Allowlist**: Commands and paths that bypass approval

### 8. Session Management (`src/session/`)
- **SessionManager**: JSONL append-only persistence with smart compaction
- **Compaction Algorithm**:
  - Triggers at 80% of max tokens (default 100k)
  - Preserves: file paths, error codes, function signatures, exports/imports
  - Retains last 10 turns + compacted summary
  - Uses local model (`qwen2.5:3b`) for summarization

### 9. Tavily Search (`src/tavily/`)
- **TavilyClient**: Web search + content extraction with caching
- **Cache TTL**: 5 minutes default
- **Search Depth**: Basic/advanced modes

### 10. CLI & TUI (`src/cli/`)
- **Commander.js**: Commands: `chat`, `run`, `models`, `budget`, `session`, `config`
- **Ink v5 + React TUI**: 10 components (App, ChatHistory, Message, ApprovalQueue, BudgetBar, TokenCounter, ModelSelector, PlanView, StatusBar, InputArea)
- **Readline Fallback**: For CI/headless environments (`--no-tui`)

## Data Flows

### Request Routing Flow

```
User Prompt
    │
    ▼
┌─────────────────────────────────────┐
│         AgentCore.run()             │
│  1. Create RouterContext            │
│     - request (messages, model)     │
│     - isConfidential (path check)   │
│     - taskType (coding/reasoning)   │
│     - preferredModel (if set)       │
└─────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────┐
│         ModelRouter.route()         │
│  1. Privacy check                   │
│     if isConfidential && localEnab │
│       → selectLocalModel() → LOCAL │
│  2. Budget check                    │
│     if over limit                   │
│       → selectLocalModel() → LOCAL │
│  3. Preferred model                 │
│     if local + available → LOCAL    │
│     else → BIFROST                  │
│  4. Bifrost complexity routing      │
│     health + budget check           │
│     → BIFROST with estimated cost   │
│  5. Local fallback                  │
└─────────────────────────────────────┘
    │
    ├──────────────────┬──────────────────┐
    ▼                  ▼                  ▼
┌─────────┐      ┌─────────────┐    ┌─────────┐
│ Bifrost │      │   Ollama    │    │ Error   │
│ Gateway │      │  (Local)    │    │ (none   │
└────┬────┘      └──────┬──────┘    │ avail)  │
     │                  │           └────┬────┘
     │                  │                │
     ▼                  ▼                ▼
┌─────────────────────────────────────────────┐
│           RouteDecision                     │
│  { target, model, reason, cost, fallback }  │
└─────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────┐
│     ModelRouter.complete()          │
│  if target == 'bifrost'             │
│    → bifrost.chatCompletion()       │
│    → budget.recordUsage(cost)       │
│  else                               │
│    → ollama.chatCompletion()        │
│    → budget.recordUsage(0)          │
└─────────────────────────────────────┘
```

### Tool Execution Flow

```
Agent Planner creates PlanStep[]
    │
    ▼
Agent Executor iterates steps
    │
    ▼
ToolRegistry.execute(ToolCall, ToolContext)
    │
    ├─ getToolCategory(name) → read|write|shell|git|search
    │
    ├─ requiresApproval(category, policy)
    │   if true && policy !== 'batch'
    │     → return { requiresApproval: true }
    │
    └─ tool.execute(args, context)
        │
        ├─ FS Tools: path validation (workspace root)
        ├─ Shell: allowlist + timeout (30s default)
        ├─ Git: working dir validation
        └─ Search: Tavily API + cache
```

### Session Persistence Flow

```
AgentCore.initialize()
    │
    ▼
SessionManager.initialize(sessionId?)
    │
    ├─ Load existing JSONL session file
    │   → Parse messages, plan, state
    │   → Rebuild AgentState
    │
    └─ Or create new session
        │
        ▼
During execution:
    │
    ├─ appendTurn(message) → JSONL append
    │
    └─ checkCompaction()
        if tokens > threshold * 0.8
          → compact with local model
          → preserve: file paths, errors, signatures
          → write compacted session
```

## Routing Logic (Detailed)

### Priority Order

```typescript
async route(context: RouterContext): Promise<RouteDecision> {
  // 1. PRIVACY - Highest priority
  if (isConfidential && enableLocalModels) {
    return localModel();  // Architectural guarantee
  }

  // 2. BUDGET - Hard limit
  if (!budget.checkBudget(estimatedCost)) {
    if (enableLocalModels) return localModel();
    throw Error('Budget exceeded, no local models');
  }

  // 3. PREFERRED MODEL - User intent
  if (preferredModel) {
    if (isLocal && available) return localModel();
    return bifrostModel();  // Try Bifrost
  }

  // 4. BIFROST COMPLEXITY ROUTING - Optimal selection
  const health = await bifrost.healthCheck();
  if (health.healthy && bifrostBudget.remaining > 0) {
    return bifrostWithComplexityRouting();
  }

  // 5. LOCAL FALLBACK - Last resort
  if (enableLocalModels) return localModel();
  throw Error('No available models');
}
```

### Failover Chain

```
Primary Request
    │
    ▼
┌─────────────────────────────────────┐
│  Bifrost Gateway                    │
│  ┌───────────────────────────────┐  │
│  │ Provider Failover Chains       │  │
│  │  - openai-primary: gpt-4o     │  │
│  │    → claude-sonnet-4          │  │
│  │    → gemini-1.5-pro           │  │
│  │  - openai-mini: gpt-4o-mini   │  │
│  │    → claude-haiku-4           │  │
│  │    → gemini-1.5-flash         │  │
│  └───────────────────────────────┘  │
└─────────────────────────────────────┘
    │ (all providers fail)
    ▼
┌─────────────────────────────────────┐
│  ModelRouter Fallback               │
│  → Local Ollama Models              │
│     qwen2.5:3b → phi4-mini:3.8b    │
│     → smollm2:1.7b                  │
└─────────────────────────────────────┘
```

## Configuration Architecture

### Config Loading Order (highest to lowest priority)
1. CLI flags (`--bifrost-url`, `--budget`, etc.)
2. Environment variables
3. Config file (`-c config.yaml` or `config/default.yaml`)
4. Zod schema defaults

### Config Sections
| Section | File | Purpose |
|---------|------|---------|
| `bifrost` | Gateway connection, virtual keys, caching |
| `budget` | Daily/monthly limits, alert thresholds, webhook |
| `privacy` | Confidential paths, local-only enforcement |
| `approval` | Per-category policies, allowlist |
| `localModels` | Ollama URL, VRAM limit, preferred models |
| `tavily` | API key, search depth, cache TTL |
| `session` | Directory, compaction threshold, model |

## TUI Architecture

### Component Hierarchy
```
App (state orchestration)
├── ChatHistory (Static scrollable)
│   └── Message (syntax highlighting)
├── PlanView (expandable steps)
├── ApprovalQueue (allowlist checkboxes)
├── ModelSelector (Tab-toggle dropdown)
├── BudgetBar (daily/monthly + thresholds)
├── TokenCounter (prompt/completion breakdown)
├── StatusBar (iteration, latency, connection)
└── InputArea (multi-line, history, slash commands, Ctrl+P palette)
```

### State Management
- React `useState` for local UI state
- External providers (callbacks) for dynamic data:
  - `getAvailableModels()` → ModelSelector
  - `getBudgetStatus()` → BudgetBar + TokenCounter
  - `getTokenUsage()` → TokenCounter
  - `getStatus()` → StatusBar
- 1-second polling interval for real-time updates

## Security Architecture

### Defense in Depth
1. **Path Validation**: All FS tools resolve against workspace root, reject traversal
2. **Approval Gates**: Write/shell/git require explicit consent
3. **Privacy Routing**: Confidential paths → local models (architectural, not policy)
4. **Budget Enforcement**: Pre-flight check before every model call
5. **Allowlist**: Trusted commands/paths bypass approval
6. **Secrets Management**: API keys via CLI/env, never in code

## Performance Characteristics

| Metric | Target |
|--------|--------|
| Cold start (CLI) | < 2s |
| TUI render | 60fps |
| Tool execution (read) | < 50ms |
| Tool execution (write) | < 100ms |
| Model routing decision | < 100ms |
| Session compaction | < 500ms |
| Memory usage (idle) | < 100MB |

## Extensibility Points

1. **New Tools**: Implement `Tool` interface, register in `createComponents()`
2. **New Model Providers**: Extend `ModelRouter` with additional targets
3. **Custom Approval Policies**: Extend `ApprovalAction` type
4. **Additional Config Sections**: Add to `AppConfigSchema`
5. **TUI Components**: Add to `App.tsx` layout, register callbacks

## Deployment Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Developer     │     │   Bifrost       │     │   Cloud LLMs    │
│   Machine       │────▶│   Gateway       │────▶│   (OpenAI,      │
│                 │     │   (Docker)      │     │    Anthropic,   │
│ ┌─────────────┐ │     │                 │     │    Google)      │
│ │ HackCulture │ │     │ ┌─────────────┐ │     └─────────────────┘
│ │   Agent     │ │     │ │ Semantic    │ │
│ │             │ │     │ │ Cache       │ │
│ │ ┌─────────┐ │ │     │ │ Complexity  │ │     ┌─────────────────┐
│ │ │ Ollama  │ │ │     │ │ Router      │ │     │   Local Models  │
│ │ │ (Local) │ │ │     │ │ Budget Cap  │ │     │   (Ollama       │
│ │ └─────────┘ │ │     │ │ Failover    │ │     │    Docker)      │
│ └─────────────┘ │     │ └─────────────┘ │     └─────────────────┘
└─────────────────┘     └─────────────────┘
```

---

*For API reference, see [API.md](API.md). For quick start, see [README.md](README.md).*