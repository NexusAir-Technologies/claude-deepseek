#!/usr/bin/env node
const { existsSync, mkdtempSync, writeFileSync, chmodSync } = require('fs')
const { homedir, tmpdir } = require('os')
const { delimiter, join } = require('path')
const { spawnSync } = require('child_process')

const shimDir = mkdtempSync(join(tmpdir(), 'deepseek-claude-vscode-'))
const shimPath = join(shimDir, process.platform === 'win32' ? 'claude.cmd' : 'claude')

if (process.platform === 'win32') {
  writeFileSync(shimPath, '@echo off\r\ndeepseek-claude %*\r\n')
} else {
  writeFileSync(shimPath, '#!/usr/bin/env bash\nexec deepseek-claude "$@"\n')
  chmodSync(shimPath, 0o755)
}

process.env.PATH = [shimDir, join(homedir(), '.deepseek-claude', 'bin'), process.env.PATH]
  .filter(Boolean)
  .join(delimiter)

const codeCommand = process.env.DEEPSEEK_CODE_BINARY || 'code'
const result = spawnSync(codeCommand, process.argv.slice(2), {
  env: process.env,
  stdio: 'inherit',
})

if (result.error) {
  console.error('Failed to start VS Code with DeepSeek Claude shim.')
  console.error('Please ensure the VS Code CLI command `code` is installed and available in PATH.')
  console.error('You can also set DEEPSEEK_CODE_BINARY to the full VS Code executable path.')
  process.exit(1)
}

process.exit(result.status || 0)
