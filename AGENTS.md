# AGENTS.md - AI Coding Agent Instructions

## Project Overview

SubSyncForge is a proxy subscription processing tool for self-hosting scenarios. It fetches subscriptions, filters/tests nodes, and generates configs for Clash/Mihomo, Surge, SingBox, V2Ray, etc.

**Tech Stack**: Node.js 18+, ES Modules, Rollup, Cloudflare Workers, js-yaml, node-fetch

---

## Quick Reference

### Build & Development Commands

| Command | Description |
|---------|-------------|
| `pnpm install` | Install dependencies |
| `pnpm run build` | Build with Rollup → `dist/` |
| `pnpm run sync` | Build + run full sync pipeline |
| `pnpm run dev` | Start Cloudflare Worker locally (port 8787) |
| `pnpm run deploy` | Deploy Worker to Cloudflare |

### Test Commands

| Command | Description |
|---------|-------------|
| `pnpm run test` | Run sync-subscriptions.js (integration smoke test) |
| `pnpm run test:nodes` | Node testing with default core |
| `pnpm run test:nodes:mihomo` | Node testing with Mihomo core |
| `pnpm run test:nodes:v2ray` | Node testing with V2Ray core |
| `pnpm run test:nodes:basic` | Node testing without core (basic connectivity) |
| `pnpm run validate:config` | Validate config files against JSON Schema |

### Utility Commands

| Command | Description |
|---------|-------------|
| `pnpm run local:run` | Run sync with local config (debugging) |
| `pnpm run local:mode1` | Update and test mode via LocalRunManager |
| `pnpm run local:mode2` | Config test mode via LocalRunManager |
| `pnpm run clean` | Clean cache directories |
| `pnpm run blacklist:report` | Generate blacklist report |

---

## Directory Structure

```
SubSyncForge/
├── src/
│   ├── core/                # Main sync pipeline
│   │   ├── SyncManager.js   # Main orchestrator
│   │   ├── config/          # ConfigLoader, ConfigDefaults
│   │   ├── subscription/    # SubscriptionFetcher
│   │   ├── node/            # NodeProcessor
│   │   ├── testing/         # AdvancedNodeTester
│   │   ├── output/          # ConfigGenerator
│   │   └── proxy/           # ProxyManager, ProxyCoreManager
│   ├── converter/           # Subscription format conversion
│   ├── scripts/             # CLI entry points
│   ├── tester/              # Node testing implementations
│   ├── utils/               # Shared utilities
│   └── worker/              # Cloudflare Worker handlers
├── config/                  # User configuration files
├── templates/               # Output template files
├── output/                  # Generated config files (gitignored for data)
├── data/                    # Runtime cache, test results
└── docs/                    # Project documentation
```

---

## Code Style Guidelines

### Module System

- **ES Modules only**: Use `import`/`export`, NOT `require()`/`module.exports`
- Package type is `"module"` in package.json

```javascript
// ✅ Correct
import { SyncManager } from './core/SyncManager.js';
export default class MyClass { }
export { myFunction };

// ❌ Wrong
const x = require('./module');
module.exports = x;
```

### File Extensions

- Always include `.js` extension in imports for ES modules
- Worker entry: `src/worker/index.js`
- Build entry: `src/scripts/sync-subscriptions.js`

### Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Files | PascalCase for classes | `SyncManager.js`, `NodeProcessor.js` |
| Files | camelCase for scripts | `sync-subscriptions.js` |
| Classes | PascalCase | `class SubscriptionFetcher` |
| Functions | camelCase | `async function fetchNodes()` |
| Constants | UPPER_SNAKE_CASE | `const MAX_RETRIES = 3` |
| Config keys | camelCase | `{ outputDir: '', updateInterval: 3600 }` |

### Async Patterns

- Use `async/await` for all async operations
- All main classes use async `initialize()` pattern

```javascript
class SyncManager {
  async initialize() {
    await this.configLoader.loadConfig();
    await this.proxyManager.initialize();
    return this;
  }
  
  async start() {
    // Main workflow
  }
}
```

### Error Handling

- Use try/catch with meaningful error messages
- Log errors via the Logger utility
- Re-throw or handle appropriately based on context

```javascript
try {
  const result = await this.fetcher.fetch(url);
} catch (error) {
  this.logger.error(`Failed to fetch subscription: ${error.message}`);
  throw error; // or handle gracefully
}
```

### Imports Organization

```javascript
// 1. Node.js built-ins
import fs from 'fs';
import path from 'path';

// 2. External dependencies
import yaml from 'js-yaml';
import fetch from 'node-fetch';

// 3. Local modules (relative paths)
import { Logger } from '../utils/Logger.js';
import { ConfigLoader } from './config/ConfigLoader.js';
```

---

## Configuration Files

### Primary Config Files

| File | Purpose |
|------|---------|
| `config/custom.yaml` | Main runtime config (outputs, testing, options) |
| `config/subscriptions.json` | Subscription sources and conversion rules |
| `config/blacklist.yaml` | Node blacklist rules |
| `config/schema/` | JSON Schema for validation |

### Config Structure (custom.yaml)

```yaml
options:
  outputDir: output
  dataDir: data
  deduplication: true

testing:
  coreType: mihomo  # mihomo | v2ray | none
  autoRename: true
  concurrency: 10
  timeout: 5000

outputs:
  - name: mihomo
    format: yaml
    template: templates/mihomo.yaml
```

---

## Key Modules & Entry Points

### SyncManager (Main Orchestrator)

```javascript
import SyncManager from './src/core/SyncManager.js';

const manager = new SyncManager();
await manager.initialize();
const result = await manager.start();
```

### Worker Routes

| Route | Handler |
|-------|---------|
| `GET /api/subscriptions` | List subscriptions |
| `POST /api/convert` | Convert subscription |
| `GET /api/status` | Service status |
| `GET /api/health` | Health check |
| `GET /output/:groupName` | Get group output |

---

## Testing Guidelines

### Current State

- **No unit test framework** configured yet (Vitest/Jest recommended)
- `pnpm run test` runs a full sync as integration smoke test
- `pnpm run validate:config` validates config schema

### Recommended Test Approach

1. Before changes: `pnpm run validate:config`
2. After changes: `pnpm run test` (runs full sync)
3. For node testing: `pnpm run test:nodes:basic`

### Test Data Locations

- `data/test_results/` - Node test results (gitignored)
- `data/cache/` - Subscription cache (gitignored)
- `.cores/` - Downloaded Mihomo/V2Ray cores (gitignored)

---

## CI/CD

### GitHub Actions Workflows

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `sync-subscriptions.yml` | Every 6 hours | Full sync pipeline |
| `test-nodes-advanced.yml` | Daily 2:00 UTC / Manual | Node testing with cores |

---

## Common Patterns

### Adding New Output Format

1. Create template in `templates/`
2. Add output config in `config/custom.yaml`
3. Extend `ConfigGenerator.js` if custom logic needed

### Adding New Subscription Parser

1. Add parser in `src/converter/parser/formats/`
2. Register in `SubscriptionParser.js`

### Adding New Node Filter

1. Extend `NodeProcessor.js` with new filter logic
2. Add config option in `ConfigDefaults.js`

---

## Important Notes

- Worker is currently returning example data, not integrated with full pipeline
- First run downloads Mihomo/V2Ray cores to `.cores/` (requires network + write permission)
- Always run `pnpm run build` before `pnpm run sync` for production
- Config changes require restart of sync process
