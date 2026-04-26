#!/usr/bin/env node
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectDir = resolve(__dirname, '..')
const configDir = join(homedir(), '.deepseek-claude')
const settingsPath = join(configDir, 'settings.json')

const defaultSettings = {
  $schema: 'https://json.schemastore.org/claude-code-settings.json',
  env: {
    DISABLE_TELEMETRY: '1',
    DISABLE_ERROR_REPORTING: '1',
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
    MCP_TIMEOUT: '60000',
    API_TIMEOUT_MS: '3000000',
    ANTHROPIC_BASE_URL: 'https://api.deepseek.com/anthropic',
  },
  includeCoAuthoredBy: false,
  model: 'deepseek-v4-pro',
}

mkdirSync(configDir, { recursive: true })

if (!existsSync(settingsPath)) {
  writeFileSync(settingsPath, `${JSON.stringify(defaultSettings, null, 2)}\n`, {
    mode: 0o600,
  })
}

process.env.CLAUDE_CONFIG_DIR = configDir

const bun = process.env.BUN_BINARY || 'bun'
const result = spawnSync(bun, ['run', join(projectDir, 'src/dev-entry.ts'), ...process.argv.slice(2)], {
  cwd: projectDir,
  env: process.env,
  stdio: 'inherit',
})

if (result.error) {
  console.error(`Failed to start DeepSeek Claude: ${result.error.message}`)
  process.exit(1)
}

process.exit(result.status ?? 1)
