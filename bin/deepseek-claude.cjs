#!/usr/bin/env node
const { existsSync, mkdirSync, writeFileSync } = require('fs')
const { homedir } = require('os')
const { delimiter, dirname, join, resolve } = require('path')
const { spawnSync } = require('child_process')

const originalCwd = process.cwd()
const projectDir = resolve(dirname(__dirname))
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

function resolveBunBinary() {
  if (process.env.BUN_BINARY) return process.env.BUN_BINARY

  const binaryName = process.platform === 'win32' ? 'bun.exe' : 'bun'
  const bunCandidates = [
    join(projectDir, 'node_modules', '.bin', binaryName),
    join(projectDir, 'node_modules', 'bun', 'bin', process.platform === 'win32' ? 'bun.exe' : 'bun'),
    join(homedir(), '.bun', 'bin', binaryName),
    '/usr/local/bin/bun',
    '/opt/homebrew/bin/bun',
  ]

  for (const candidate of bunCandidates) {
    if (existsSync(candidate)) return candidate
  }

  return 'bun'
}

mkdirSync(configDir, { recursive: true })

if (!existsSync(settingsPath)) {
  writeFileSync(settingsPath, `${JSON.stringify(defaultSettings, null, 2)}\n`, {
    mode: 0o600,
  })
}

process.env.CLAUDE_CONFIG_DIR = configDir
process.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC ||= '1'
process.env.CLAUDE_CODE_DISABLE_NONSTREAMING_FALLBACK ||= '1'
process.env.CLAUDE_CODE_SUBAGENT_MODEL ||= 'deepseek-v4-pro'
process.env.PATH = [
  join(projectDir, 'node_modules', '.bin'),
  join(homedir(), '.bun', 'bin'),
  process.env.PATH,
]
  .filter(Boolean)
  .join(delimiter)

const bun = resolveBunBinary()
const result = spawnSync(bun, ['run', join(projectDir, 'src/dev-entry.ts')].concat(process.argv.slice(2)), {
  cwd: originalCwd,
  env: process.env,
  stdio: 'inherit',
})

if (result.error) {
  console.error('Failed to start DeepSeek Claude: Bun runtime was not found.')
  console.error('Please install Bun first: https://bun.sh/docs/installation')
  console.error('If Bun is already installed, set BUN_BINARY to the full bun executable path.')
  process.exit(1)
}

process.exit(result.status || 0)
