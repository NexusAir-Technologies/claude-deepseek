#!/usr/bin/env node
const {
  chmodSync,
  existsSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  writeFileSync,
} = require('fs')
const { delimiter, dirname, join } = require('path')
const { homedir, platform } = require('os')

const command = process.argv[2] || 'status'
const backupSuffix = '.official.bak'
const deepseekClaudePath = join(dirname(__filename), 'deepseek-claude.cjs')
const shimBody = `#!/usr/bin/env bash
export DEEPSEEK_CLAUDE_VSCODE=1
exec "${deepseekClaudePath}" "$@"
`

function getExtensionRoots() {
  if (process.env.DEEPSEEK_VSCODE_EXTENSION_DIRS) {
    return process.env.DEEPSEEK_VSCODE_EXTENSION_DIRS.split(delimiter).filter(Boolean)
  }

  const home = homedir()
  return [
    join(home, '.vscode-server', 'extensions'),
    join(home, '.vscode', 'extensions'),
    join(home, '.cursor-server', 'extensions'),
    join(home, '.cursor', 'extensions'),
  ]
}

function findTargets() {
  const targets = []

  for (const root of getExtensionRoots()) {
    if (!existsSync(root)) continue

    for (const entry of readdirSync(root)) {
      if (!entry.startsWith('anthropic.claude-code-')) continue

      const extensionDir = join(root, entry)
      const target = join(extensionDir, 'resources', 'native-binary', 'claude')
      if (existsSync(target)) {
        targets.push({ extensionDir, target, backup: `${target}${backupSuffix}` })
      }
    }
  }

  return targets.sort((a, b) => a.target.localeCompare(b.target))
}

function readPrefix(file) {
  try {
    return readFileSync(file, { encoding: null }).subarray(0, 512)
  } catch {
    return Buffer.alloc(0)
  }
}

function isTextBuffer(buffer) {
  if (buffer.length === 0) return false
  if (buffer.includes(0)) return false
  return buffer.every(byte => byte === 9 || byte === 10 || byte === 13 || (byte >= 32 && byte <= 126))
}

function isDeepSeekShim(file) {
  const prefix = readPrefix(file)
  if (!isTextBuffer(prefix)) return false
  return prefix.toString('utf8').includes('deepseek-claude')
}

function isCurrentShim(file) {
  const prefix = readPrefix(file)
  if (!isTextBuffer(prefix)) return false
  const text = prefix.toString('utf8')
  return text.includes(deepseekClaudePath) && text.includes('DEEPSEEK_CLAUDE_VSCODE=1')
}

function describeTarget(item) {
  const hasBackup = existsSync(item.backup)
  const prefix = readPrefix(item.target)
  const isText = isTextBuffer(prefix)
  const isShim = isDeepSeekShim(item.target)
  const isCurrent = isCurrentShim(item.target)
  const size = statSync(item.target).size

  let state = 'official-native'
  if (isCurrent) state = 'deepseek-shim-current'
  else if (isShim) state = 'deepseek-shim-legacy'
  else if (isText) state = 'unknown-text'

  return { ...item, hasBackup, isText, isShim, isCurrent, size, state }
}

function printStatus(items) {
  if (items.length === 0) {
    console.log('No Claude Code VS Code extension native binary was found.')
    return
  }

  for (const item of items.map(describeTarget)) {
    console.log(`Target: ${item.target}`)
    console.log(`State: ${item.state}`)
    console.log(`Size: ${item.size}`)
    console.log(`Backup: ${item.hasBackup ? item.backup : 'missing'}`)
    console.log('')
  }
}

function ensurePosixUseSupported() {
  if (platform() === 'win32') {
    console.error('deepseek-vscode use is only supported in POSIX/WSL extension environments.')
    process.exit(1)
  }
}

function useDeepSeek(items) {
  ensurePosixUseSupported()

  if (items.length === 0) {
    console.error('No Claude Code VS Code extension native binary was found.')
    process.exit(1)
  }

  console.log('This command patches VS Code/Cursor Claude Code extension binaries.')
  console.log('Restore command: deepseek-vscode restore')
  console.log('')

  let changed = 0
  let failed = 0

  for (const item of items.map(describeTarget)) {
    if (item.isCurrent) {
      console.log(`Already patched: ${item.target}`)
      continue
    }

    if (item.isShim && item.hasBackup) {
      writeFileSync(item.target, shimBody, { mode: 0o755 })
      chmodSync(item.target, 0o755)
      console.log(`Updated patch: ${item.target}`)
      changed++
      continue
    }

    if (item.isShim) {
      console.error(`Refusing to update DeepSeek shim without backup: ${item.target}`)
      failed++
      continue
    }

    if (item.isText) {
      console.error(`Refusing to patch unknown text file: ${item.target}`)
      failed++
      continue
    }

    if (item.hasBackup) {
      console.error(`Refusing to overwrite existing backup: ${item.backup}`)
      failed++
      continue
    }

    renameSync(item.target, item.backup)
    writeFileSync(item.target, shimBody, { mode: 0o755 })
    chmodSync(item.target, 0o755)
    console.log(`Patched: ${item.target}`)
    changed++
  }

  if (changed > 0) {
    console.log('Reload VS Code window or restart VS Code for the change to take effect.')
  }

  if (failed > 0) process.exit(1)
}

function restoreOfficial(items) {
  if (items.length === 0) {
    console.error('No Claude Code VS Code extension native binary was found.')
    process.exit(1)
  }

  let changed = 0
  let failed = 0

  for (const item of items.map(describeTarget)) {
    if (!item.hasBackup) {
      console.error(`Missing backup, cannot restore: ${item.target}`)
      failed++
      continue
    }

    if (!item.isShim) {
      console.error(`Current file is not a DeepSeek shim, restoring anyway: ${item.target}`)
    }

    renameSync(item.backup, item.target)
    chmodSync(item.target, 0o755)
    console.log(`Restored: ${item.target}`)
    changed++
  }

  if (changed > 0) {
    console.log('Reload VS Code window or restart VS Code for the change to take effect.')
  }

  if (failed > 0) process.exit(1)
}

function printHelp() {
  console.log('Usage: deepseek-vscode <status|use|restore>')
  console.log('')
  console.log('Commands:')
  console.log('  status   Show Claude Code extension patch status')
  console.log('  use      Patch extension native binaries to run deepseek-claude')
  console.log('  restore  Restore official extension native binaries from backups')
}

const targets = findTargets()

if (command === 'status') {
  printStatus(targets)
} else if (command === 'use') {
  useDeepSeek(targets)
} else if (command === 'restore') {
  restoreOfficial(targets)
} else if (command === '-h' || command === '--help' || command === 'help') {
  printHelp()
} else {
  console.error(`Unknown command: ${command}`)
  printHelp()
  process.exit(1)
}
