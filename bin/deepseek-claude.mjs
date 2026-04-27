#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync, execSync } from 'node:child_process'

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
    CLAUDE_CODE_DISABLE_NONSTREAMING_FALLBACK: '1',
    CLAUDE_CODE_SUBAGENT_MODEL: 'deepseek-v4-pro',
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
} else {
  try {
    const currentSettings = JSON.parse(readFileSync(settingsPath, 'utf8'))
    const mergedSettings = {
      ...currentSettings,
      env: {
        ...defaultSettings.env,
        ...(currentSettings.env || {}),
        ANTHROPIC_BASE_URL: defaultSettings.env.ANTHROPIC_BASE_URL,
      },
      includeCoAuthoredBy:
        currentSettings.includeCoAuthoredBy ?? defaultSettings.includeCoAuthoredBy,
      model: currentSettings.model ?? defaultSettings.model,
    }
    writeFileSync(settingsPath, `${JSON.stringify(mergedSettings, null, 2)}\n`, {
      mode: 0o600,
    })
  } catch {
    // Keep user settings intact if they are temporarily invalid.
  }
}

function resolveConfiguredApiKey() {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY

  try {
    const settings = JSON.parse(readFileSync(settingsPath, 'utf8'))
    if (typeof settings?.env?.ANTHROPIC_API_KEY === 'string' && settings.env.ANTHROPIC_API_KEY) {
      return settings.env.ANTHROPIC_API_KEY
    }
    if (typeof settings?.apiKeyHelper === 'string' && settings.apiKeyHelper.trim()) {
      const key = execSync(settings.apiKeyHelper, {
        encoding: 'utf8',
        env: process.env,
        cwd: process.cwd(),
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: 5000,
      }).trim()
      if (key) return key
    }
  } catch {
    return undefined
  }

  return undefined
}

process.env.CLAUDE_CONFIG_DIR = configDir
process.env.CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST = '1'
process.env.ANTHROPIC_BASE_URL = 'https://api.deepseek.com/anthropic'
const configuredApiKey = resolveConfiguredApiKey()
if (configuredApiKey) {
  process.env.ANTHROPIC_API_KEY = configuredApiKey
}
delete process.env.ANTHROPIC_AUTH_TOKEN
delete process.env.CLAUDE_CODE_OAUTH_TOKEN
process.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC ||= '1'
process.env.CLAUDE_CODE_DISABLE_NONSTREAMING_FALLBACK ||= '1'
process.env.CLAUDE_CODE_SUBAGENT_MODEL ||= 'deepseek-v4-pro'

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
