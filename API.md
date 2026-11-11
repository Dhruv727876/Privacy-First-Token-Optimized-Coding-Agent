# API Reference

## Tool Schemas

All tools follow the standard interface:
```typescript
interface Tool {
  name: string;
  description: string;
  parameters: Record<string, ToolParameter>;
  requiresApproval: (policy: ApprovalPolicy) => boolean;
  execute: (args: Record<string, unknown>, context: ToolContext) => Promise<ToolResult>;
}
```

### File System Tools (Category: `read` / `write`)

#### `read_file`
Read a file from the workspace.

```json
{
  "name": "read_file",
  "description": "Read a file from the workspace",
  "parameters": {
    "path": { "type": "string", "description": "Relative path from workspace root", "required": true },
    "offset": { "type": "number", "description": "Line number to start reading from (0-indexed)" },
    "limit": { "type": "number", "description": "Maximum number of lines to read" }
  }
}
```
**Approval**: `auto` (read category)

#### `write_file`
Write content to a file (creates directories as needed).

```json
{
  "name": "write_file",
  "description": "Write content to a file",
  "parameters": {
    "path": { "type": "string", "description": "Relative path from workspace root", "required": true },
    "content": { "type": "string", "description": "Content to write", "required": true }
  }
}
```
**Approval**: `prompt` (write category)

#### `edit_file`
Edit a file with exact string replacement.

```json
{
  "name": "edit_file",
  "description": "Edit a file with exact string replacement",
  "parameters": {
    "path": { "type": "string", "description": "Relative path from workspace root", "required": true },
    "old_string": { "type": "string", "description": "Text to replace (must match exactly)", "required": true },
    "new_string": { "type": "string", "description": "Text to replace with", "required": true },
    "replace_all": { "type": "boolean", "description": "Replace all occurrences", "default": false }
  }
}
```
**Approval**: `prompt` (write category)

#### `delete_file`
Delete a file from the workspace.

```json
{
  "name": "delete_file",
  "description": "Delete a file",
  "parameters": {
    "path": { "type": "string", "description": "Relative path from workspace root", "required": true }
  }
}
```
**Approval**: `prompt` (write category)

#### `list_dir`
List directory contents.

```json
{
  "name": "list_dir",
  "description": "List directory contents",
  "parameters": {
    "path": { "type": "string", "description": "Relative path from workspace root", "required": true, "default": "." }
  }
}
```
**Approval**: `auto` (read category)

#### `glob`
Find files matching a glob pattern.

```json
{
  "name": "glob",
  "description": "Find files matching a glob pattern",
  "parameters": {
    "pattern": { "type": "string", "description": "Glob pattern (e.g., **/*.ts)", "required": true },
    "path": { "type": "string", "description": "Base directory (relative to workspace root)" }
  }
}
```
**Approval**: `auto` (read category)

#### `grep`
Search file contents with regex.

```json
{
  "name": "grep",
  "description": "Search file contents with regex",
  "parameters": {
    "pattern": { "type": "string", "description": "Regex pattern", "required": true },
    "path": { "type": "string", "description": "Base directory (relative to workspace root)" },
    "include": { "type": "string", "description": "File pattern to include (e.g., *.ts)" },
    "type": { "type": "string", "description": "File type (js, ts, py, etc.)" }
  }
}
```
**Approval**: `auto` (read category)

### Shell Tools (Category: `shell`)

#### `run_command`
Execute a shell command with allowlist and timeout.

```json
{
  "name": "run_command",
  "description": "Run a shell command",
  "parameters": {
    "command": { "type": "string", "description": "Command to execute", "required": true },
    "args": { "type": "array", "items": { "type": "string" }, "description": "Command arguments" },
    "timeout": { "type": "number", "description": "Timeout in milliseconds", "default": 30000 },
    "cwd": { "type": "string", "description": "Working directory (relative to workspace root)" }
  }
}
```
**Approval**: `prompt` (shell category)
**Security**: Validates against command allowlist, 30s default timeout, no shell injection

### Git Tools (Category: `git`)

#### `git_status`
Show working tree status.

```json
{
  "name": "git_status",
  "description": "Show git status",
  "parameters": {}
}
```
**Approval**: `prompt` (git category)

#### `git_diff`
Show changes (staged/unstaged).

```json
{
  "name": "git_diff",
  "description": "Show git diff",
  "parameters": {
    "staged": { "type": "boolean", "description": "Show staged changes", "default": false },
    "path": { "type": "string", "description": "Limit to specific path" }
  }
}
```
**Approval**: `prompt` (git category)

#### `git_commit`
Commit staged changes.

```json
{
  "name": "git_commit",
  "description": "Create a git commit",
  "parameters": {
    "message": { "type": "string", "description": "Commit message", "required": true },
    "addAll": { "type": "boolean", "description": "Stage all changes before commit", "default": false }
  }
}
```
**Approval**: `prompt` (git category)

#### `git_push`
Push commits to remote.

```json
{
  "name": "git_push",
  "description": "Push commits to remote",
  "parameters": {
    "remote": { "type": "string", "description": "Remote name", "default": "origin" },
    "branch": { "type": "string", "description": "Branch name" },
    "force": { "type": "boolean", "description": "Force push", "default": false }
  }
}
```
**Approval**: `prompt` (git category)

### Search Tools (Category: `search`)

#### `tavily_search`
Search the web via Tavily API.

```json
{
  "name": "tavily_search",
  "description": "Search the web using Tavily",
  "parameters": {
    "query": { "type": "string", "description": "Search query", "required": true },
    "max_results": { "type": "number", "description": "Maximum results", "default": 5 },
    "search_depth": { "type": "string", "enum": ["basic", "advanced"], "default": "advanced" },
    "include_domains": { "type": "array", "items": { "type": "string" }, "description": "Domains to include" },
    "exclude_domains": { "type": "array", "items": { "type": "string" }, "description": "Domains to exclude" }
  }
}
```
**Approval**: `auto` (search category)
**Cache**: 5-minute TTL by default

#### `tavily_extract`
Extract content from URLs.

```json
{
  "name": "tavily_extract",
  "description": "Extract content from URLs",
  "parameters": {
    "urls": { "type": "array", "items": { "type": "string" }, "description": "URLs to extract", "required": true },
    "include_images": { "type": "boolean", "description": "Include images in extraction", "default": false }
  }
}
```
**Approval**: `auto` (search category)

---

## CLI Reference

### Commands

```bash
hackculture [options] <command> [args]
```

#### Global Options
| Option | Alias | Description | Default |
|--------|-------|-------------|---------|
| `--workspace` | `-w` | Workspace root directory | `process.cwd()` |
| `--config` | `-c` | Config file path | - |
| `--bifrost-url` | | Bifrost gateway URL | `http://localhost:8080` |
| `--virtual-key` | | Bifrost virtual key | `hackculture-default` |
| `--no-local-models` | | Disable local models | `false` |
| `--privacy-mode` | | Enable privacy mode | `false` |
| `--model` | | Default model | `gpt-4o-mini` |
| `--budget` | | Daily budget USD | `10` |
| `--tavily-key` | | Tavily API key | - |
| `--session-dir` | | Session directory | `.hackculture` |
| `--log-level` | | Log level | `info` |

#### `chat`
Start interactive chat session.

```bash
hackculture chat [options]
```

| Option | Alias | Description |
|--------|-------|-------------|
| `--model` | `-m` | Model for this session |
| `--no-planning` | | Disable planning |
| `--no-tui` | | Use readline fallback |

#### `run`
Run a single prompt and exit.

```bash
hackculture run <prompt> [options]
```

| Option | Alias | Description |
|--------|-------|-------------|
| `--model` | `-m` | Model to use |
| `--no-planning` | | Disable planning |

#### `config`
Show current configuration (merged).

```bash
hackculture config
```

#### `models`
List available models from Bifrost and Ollama.

```bash
hackculture models
```

#### `budget`
Show budget status.

```bash
hackculture budget
```

#### `session`
Resume a previous session.

```bash
hackculture session <sessionId>
```

---

## Configuration Reference

### Complete Config Schema (YAML)

```yaml
# Bifrost Gateway Configuration
bifrost:
  url: "http://localhost:8080"           # Bifrost gateway URL
  virtualKey: "hackculture-default"      # Virtual key for budget tracking
  timeoutMs: 120000                      # Request timeout (ms)
  retryAttempts: 3                       # Retry attempts on failure
  enableCodeMode: true                   # Enable Code Mode (tool context reduction)
  enableSemanticCache: true              # Enable semantic caching

# Budget Configuration
budget:
  dailyUsd: 10                           # Daily spending limit (USD)
  monthlyUsd: 100                        # Monthly spending limit (USD)
  perTaskUsd: 5                          # Per-task limit (USD)
  alertThresholds: [50, 80, 100]         # Alert percentages
  onExceed: "pause_and_alert"            # Behavior on limit: pause_and_alert | fail | notify_only
  webhookUrl: ""                         # Optional webhook for alerts

# Privacy Configuration
privacy:
  defaultConfidential: false             # Treat all code as confidential by default
  confidentialPaths: []                  # Paths that are confidential (glob patterns)
  enforceLocalOnly: true                 # Architectural guarantee: confidential → local only
  fallbackChain: ["qwen2.5:3b", "phi4-mini:3.8b", "smollm2:1.7b"]

# Approval Configuration
approval:
  read: "auto"                           # read_file, list_dir, glob, grep
  write: "prompt"                        # write_file, edit_file, delete_file
  shell: "prompt"                        # run_command
  git: "prompt"                          # git_status, git_diff, git_commit, git_push
  search: "auto"                         # tavily_search, tavily_extract
  allowlist:
    commands: []                         # Commands that bypass shell approval
    paths: []                            # Paths that bypass write approval

# Local Models (Ollama) Configuration
localModels:
  ollamaUrl: "http://localhost:11434"    # Ollama server URL
  maxVramGb: 4                           # Max VRAM for model selection (RTX 3050 = 4GB)
  preferredModels:
    coding: "qwen2.5:3b"                 # Model for coding tasks
    reasoning: "phi4-mini:3.8b"          # Model for reasoning tasks
    basic: "smollm2:1.7b"                # Model for basic tasks
    classification: "smollm2:1.7b"       # Model for classification
  autoPull: true                         # Auto-pull missing models
  cpuFallback: true                      # Fallback to CPU if VRAM exceeded

# Tavily Search Configuration
tavily:
  apiKey: ""                             # Tavily API key (or via CLI/env)
  timeoutMs: 30000                       # Request timeout (ms)
  maxResults: 5                          # Default max results
  searchDepth: "advanced"                # basic | advanced
  cacheTtlMs: 300000                     # Cache TTL (ms)

# Session Configuration
session:
  sessionDir: "./sessions"               # Session storage directory
  maxTokensBeforeCompact: 100000         # Trigger compaction at this token count
  compactModel: "qwen2.5:3b"             # Model for summarization
  retainCompactedTurns: 10               # Retain last N turns after compaction
```

### Environment Variables

| Variable | Config Path | Description |
|----------|-------------|-------------|
| `OPENAI_API_KEY` | `bifrost.providers.openai.api_key_env` | OpenAI API key for Bifrost |
| `ANTHROPIC_API_KEY` | `bifrost.providers.anthropic.api_key_env` | Anthropic API key for Bifrost |
| `GOOGLE_API_KEY` | `bifrost.providers.google.api_key_env` | Google API key for Bifrost |
| `TAVILY_API_KEY` | `tavily.apiKey` | Tavily search API key |

### Bifrost Gateway Config (`docker/bifrost/config.yaml`)

```yaml
virtual_keys:
  hackculture-default:
    budget:
      daily_usd: 10
      monthly_usd: 100
      per_request_usd: 5
    models:
      - openai/gpt-4o-mini
      - openai/gpt-4o
      - anthropic/claude-sonnet-4
      - anthropic/claude-haiku-4
      - google/gemini-1.5-pro
      - google/gemini-1.5-flash
    rate_limit:
      requests_per_minute: 100
      tokens_per_minute: 500000

providers:
  openai:
    api_key_env: OPENAI_API_KEY
    base_url: "https://api.openai.com/v1"
  anthropic:
    api_key_env: ANTHROPIC_API_KEY
    base_url: "https://api.anthropic.com"
  google:
    api_key_env: GOOGLE_API_KEY
    base_url: "https://generativelanguage.googleapis.com/v1beta"

routing:
  complexity_router:
    enabled: true
    rules:
      - name: "simple-classification"
        condition: "task.type == 'classification' || task.type == 'extraction'"
        models:
          - openai/gpt-4o-mini
          - anthropic/claude-haiku-4
      - name: "code-tasks"
        condition: "task.type == 'coding'"
        models:
          - anthropic/claude-sonnet-4
          - openai/gpt-4o
      - name: "reasoning"
        condition: "task.type == 'reasoning'"
        models:
          - anthropic/claude-sonnet-4
          - openai/gpt-4o
      - name: "default"
        models:
          - openai/gpt-4o-mini
          - anthropic/claude-haiku-4

caching:
  enabled: true
  semantic_cache:
    enabled: true
    similarity_threshold: 0.95
    max_entries: 10000
    ttl_seconds: 86400
  code_mode:
    enabled: true
  prompt_cache:
    enabled: true
    auto_inject_checkpoints: true

failover:
  enabled: true
  chains:
    - name: "openai-primary"
      primary: "openai/gpt-4o"
      fallbacks:
        - "anthropic/claude-sonnet-4"
        - "google/gemini-1.5-pro"
    - name: "openai-mini"
      primary: "openai/gpt-4o-mini"
      fallbacks:
        - "anthropic/claude-haiku-4"
        - "google/gemini-1.5-flash"

logging:
  level: "info"
  format: "json"

metrics:
  enabled: true
  port: 9090
```

---

## TypeScript Types

### Core Types

```typescript
// Agent
interface AgentConfig {
  name: string;
  systemPrompt: string;
  maxIterations: number;
  maxTokens: number;
  enablePlanning: boolean;
  tokenBudget: number;
}

interface AgentContext {
  workspaceRoot: string;
  approvalPolicy: ApprovalPolicy;
  sessionId: string;
  agentConfig: AgentConfig;
  sessionState: SessionState;
  routerContext: RouterContext;
}

interface PlanStep {
  id: string;
  description: string;
  tool?: string;
  args?: Record<string, unknown>;
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: unknown;
  error?: string;
}

// Router
interface RouterContext {
  request: ChatCompletionRequest;
  isConfidential: boolean;
  taskType: TaskType;
  preferredModel?: string;
}

interface RouteDecision {
  target: 'bifrost' | 'local';
  model: string;
  reason: string;
  estimatedCost?: number;
  fallback?: RouteDecision;
}

type TaskType = 'coding' | 'reasoning' | 'classification' | 'basic' | 'extraction';

// Budget
interface BudgetStatus {
  used: number;
  limit: number;
  remaining: number;
  percentage: number;
  monthlyUsed?: number;
  monthlyLimit?: number;
  costPerRequest?: number;
}

// Session
interface SessionState {
  messages: AgentMessage[];
  currentPlan?: Plan;
  totalTokens: number;
  iteration: number;
  metadata: Record<string, unknown>;
}

// Approval
type ApprovalAction = 'auto' | 'prompt' | 'batch' | 'deny';

interface ApprovalPolicy {
  read: ApprovalAction;
  write: ApprovalAction;
  shell: ApprovalAction;
  git: ApprovalAction;
  search: ApprovalAction;
  allowlist?: {
    commands: string[];
    paths: string[];
  };
}

// Tools
interface ToolContext {
  workspaceRoot: string;
  approvalPolicy: ApprovalPolicy;
  sessionId?: string;
  isConfidential?: boolean;
}

interface ToolResult {
  success: boolean;
  output?: unknown;
  error?: string;
  requiresApproval?: boolean;
  approved?: boolean;
  metadata?: Record<string, unknown>;
}

// Bifrost
interface ChatCompletionRequest {
  model: string;
  messages: Array<{ role: 'system' | 'user' | 'assistant' | 'tool'; content: string; tool_calls?: ToolCall[] }>;
  temperature?: number;
  max_tokens?: number;
  tools?: ToolDefinition[];
  tool_choice?: 'auto' | 'none' | { type: 'function'; function: { name: string } };
}

interface ChatCompletionResponse {
  id: string;
  object: 'chat.completion';
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: { role: 'assistant'; content: string; tool_calls?: ToolCall[] };
    finish_reason: 'stop' | 'length' | 'tool_calls';
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

// Ollama
interface OllamaChatRequest {
  model: string;
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  options?: {
    temperature?: number;
    num_predict?: number;
  };
}

interface OllamaChatResponse {
  model: string;
  created_at: string;
  message: { role: 'assistant'; content: string; tool_calls?: unknown };
  done: boolean;
  prompt_eval_count: number;
  eval_count: number;
}
```

---

## Error Codes

| Code | Description |
|------|-------------|
| `TOOL_NOT_FOUND` | Tool name not registered |
| `APPROVAL_REQUIRED` | Operation requires user approval |
| `APPROVAL_DENIED` | User denied approval |
| `BUDGET_EXCEEDED` | Cost would exceed budget limit |
| `PRIVACY_VIOLATION` | Confidential code routed to cloud (should never happen) |
| `BIFROST_UNAVAILABLE` | Gateway health check failed |
| `OLLAMA_UNAVAILABLE` | Local model server unreachable |
| `MODEL_NOT_FOUND` | Requested model not available |
| `SESSION_NOT_FOUND` | Session ID doesn't exist |
| `PATH_TRAVERSAL` | File path escapes workspace root |
| `COMMAND_NOT_ALLOWED` | Shell command not in allowlist |
| `CONFIG_INVALID` | Configuration validation failed |

---

## Events / Hooks

The agent emits events for observability:

```typescript
// Session events
session:created    // { sessionId }
session:loaded     // { sessionId, messageCount }
session:compacted  // { sessionId, tokensBefore, tokensAfter }
session:closed     // { sessionId }

// Routing events
routing:decision   // { target, model, reason, estimatedCost }
routing:fallback   // { from, to, reason }

// Budget events
budget:check       // { estimatedCost, allowed, remaining }
budget:recorded    // { cost, totalUsed }
budget:alert       // { threshold, percentage }
budget:exceeded    // { limit, attempted }

// Tool events
tool:start         // { name, args }
tool:complete      // { name, success, duration }
tool:approval      // { name, decision }

// Model events
model:request      // { target, model, tokens }
model:response     // { target, model, tokens, duration }
model:error        // { target, model, error }
```

---

*For architecture details, see [ARCHITECTURE.md](ARCHITECTURE.md). For quick start, see [README.md](README.md).*