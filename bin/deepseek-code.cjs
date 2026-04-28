#!/usr/bin/env node
const {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} = require('fs')
const { spawnSync } = require('child_process')
const { delimiter, dirname, join } = require('path')
const { homedir, platform } = require('os')

const args = process.argv.slice(2)
const configDir = join(homedir(), '.deepseek-claude')
const wrapperDir = join(configDir, 'bin')
const wrapperPath = join(wrapperDir, 'claude-vscode-wrapper')
const deepseekClaudePath = join(dirname(__filename), 'deepseek-claude.cjs')
const managedEnvNames = new Set([
  'DEEPSEEK_CLAUDE_VSCODE',
  'ANTHROPIC_BASE_URL',
  'ANTHROPIC_API_KEY',
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'NO_PROXY',
  'http_proxy',
  'https_proxy',
  'no_proxy',
])

function parseArgs(argv) {
  const options = {
    command: 'open',
    editor: 'code',
    patch: false,
    rest: [],
  }

  for (const arg of argv) {
    if (arg === '--status') options.command = 'status'
    else if (arg === '--doctor') options.command = 'doctor'
    else if (arg === '--restore') options.command = 'restore'
    else if (arg === '--patch') options.patch = true
    else if (arg === '--cursor') options.editor = 'cursor'
    else if (arg === '-h' || arg === '--help' || arg === 'help') options.command = 'help'
    else options.rest.push(arg)
  }

  return options
}

function readJson(file, fallback) {
  if (!existsSync(file)) return fallback
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch (error) {
    throw new Error(`Failed to parse JSON: ${file}: ${error.message}`)
  }
}

function writeJsonWithBackup(file, value) {
  mkdirSync(dirname(file), { recursive: true })
  if (existsSync(file)) {
    const backup = `${file}.deepseek.bak`
    if (!existsSync(backup)) copyFileSync(file, backup)
  }
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 })
}

function isWsl() {
  if (process.platform !== 'linux') return false
  try {
    const text = readFileSync('/proc/version', 'utf8').toLowerCase()
    return text.includes('microsoft') || text.includes('wsl')
  } catch {
    return false
  }
}

function detectWindowsHost() {
  if (!isWsl()) return undefined
  try {
    const result = spawnSync('sh', ['-lc', "ip route | awk '/default/ {print $3; exit}'"], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    const host = result.stdout.trim()
    return host || undefined
  } catch {
    return undefined
  }
}

function normalizeProxyValue(value) {
  if (!value) return undefined
  const windowsHost = detectWindowsHost()
  if (windowsHost && value.includes('127.0.0.1')) {
    return value.replaceAll('127.0.0.1', windowsHost)
  }
  return value
}

function readDeepSeekSettings() {
  return readJson(join(configDir, 'settings.json'), {})
}

function getEnvValue(settings, name) {
  return process.env[name] || settings?.env?.[name]
}

function buildEnvironmentVariables() {
  const settings = readDeepSeekSettings()
  const env = []
  const baseUrl = getEnvValue(settings, 'ANTHROPIC_BASE_URL') || 'https://api.deepseek.com/anthropic'
  const apiKey = getEnvValue(settings, 'ANTHROPIC_API_KEY')
  const httpProxy = normalizeProxyValue(
    getEnvValue(settings, 'HTTP_PROXY') || getEnvValue(settings, 'http_proxy'),
  )
  const httpsProxy = normalizeProxyValue(
    getEnvValue(settings, 'HTTPS_PROXY') || getEnvValue(settings, 'https_proxy') || httpProxy,
  )
  const noProxy = getEnvValue(settings, 'NO_PROXY') || getEnvValue(settings, 'no_proxy') || 'localhost,127.0.0.1,::1'

  env.push({ name: 'DEEPSEEK_CLAUDE_VSCODE', value: '1' })
  env.push({ name: 'ANTHROPIC_BASE_URL', value: baseUrl })
  if (apiKey) env.push({ name: 'ANTHROPIC_API_KEY', value: apiKey })
  if (httpProxy) {
    env.push({ name: 'HTTP_PROXY', value: httpProxy })
    env.push({ name: 'http_proxy', value: httpProxy })
  }
  if (httpsProxy) {
    env.push({ name: 'HTTPS_PROXY', value: httpsProxy })
    env.push({ name: 'https_proxy', value: httpsProxy })
  }
  env.push({ name: 'NO_PROXY', value: noProxy })
  env.push({ name: 'no_proxy', value: noProxy })

  return env
}

function getSettingsPath(editor) {
  if (process.env.DEEPSEEK_CODE_SETTINGS_PATH) return process.env.DEEPSEEK_CODE_SETTINGS_PATH
  const home = homedir()
  const candidates = editor === 'cursor'
    ? [join(home, '.cursor-server', 'data', 'User', 'settings.json'), join(home, '.config', 'Cursor', 'User', 'settings.json')]
    : [join(home, '.vscode-server', 'data', 'User', 'settings.json'), join(home, '.config', 'Code', 'User', 'settings.json')]

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }
  return candidates[0]
}

function createWrapper() {
  mkdirSync(wrapperDir, { recursive: true })
  const body = `#!/usr/bin/env bash
export DEEPSEEK_CLAUDE_VSCODE=1
export CLAUDE_CONFIG_DIR="$HOME/.deepseek-claude"
exec "${deepseekClaudePath}" "$@"
`
  writeFileSync(wrapperPath, body, { mode: 0o755 })
  chmodSync(wrapperPath, 0o755)
  return wrapperPath
}

function mergeEnvironmentVariables(existing, injected) {
  const kept = Array.isArray(existing)
    ? existing.filter(item => item && !managedEnvNames.has(item.name))
    : []
  return [...kept, ...injected]
}

function configureSettings(editor) {
  const settingsPath = getSettingsPath(editor)
  const settings = readJson(settingsPath, {})
  const wrapper = createWrapper()
  settings.claudeCode = settings.claudeCode || undefined
  settings['claudeCode.claudeProcessWrapper'] = wrapper
  settings['claudeCode.disableLoginPrompt'] = true
  settings['claudeCode.environmentVariables'] = mergeEnvironmentVariables(
    settings['claudeCode.environmentVariables'],
    buildEnvironmentVariables(),
  )
  writeJsonWithBackup(settingsPath, settings)
  return settingsPath
}

function restoreSettings(editor) {
  const settingsPath = getSettingsPath(editor)
  const settings = readJson(settingsPath, {})
  delete settings['claudeCode.claudeProcessWrapper']
  delete settings['claudeCode.disableLoginPrompt']
  if (Array.isArray(settings['claudeCode.environmentVariables'])) {
    settings['claudeCode.environmentVariables'] = settings['claudeCode.environmentVariables'].filter(
      item => item && !managedEnvNames.has(item.name),
    )
    if (settings['claudeCode.environmentVariables'].length === 0) {
      delete settings['claudeCode.environmentVariables']
    }
  }
  writeJsonWithBackup(settingsPath, settings)
  return settingsPath
}

function printStatus(editor) {
  const settingsPath = getSettingsPath(editor)
  const settings = readJson(settingsPath, {})
  console.log(`Settings: ${settingsPath}`)
  console.log(`Wrapper: ${settings['claudeCode.claudeProcessWrapper'] || 'missing'}`)
  console.log(`Disable login prompt: ${settings['claudeCode.disableLoginPrompt'] === true}`)
  console.log(`Wrapper file: ${existsSync(wrapperPath) ? wrapperPath : 'missing'}`)
}

function printDoctor(editor) {
  const settingsPath = getSettingsPath(editor)
  const settings = readJson(settingsPath, {})
  const deepseekSettings = readDeepSeekSettings()
  const envVars = settings['claudeCode.environmentVariables'] || []
  const hasApiKey = Boolean(
    process.env.ANTHROPIC_API_KEY || deepseekSettings?.env?.ANTHROPIC_API_KEY || envVars.some(item => item?.name === 'ANTHROPIC_API_KEY' && item.value),
  )
  const proxyValues = envVars
    .filter(item => item && /proxy/i.test(item.name))
    .map(item => `${item.name}=${item.value}`)
  const wrongLocalProxy = proxyValues.some(value => value.includes('127.0.0.1')) && isWsl()

  printStatus(editor)
  console.log(`Has API key: ${hasApiKey}`)
  console.log(`Proxy values: ${proxyValues.length ? proxyValues.join(', ') : 'missing'}`)
  console.log(`WSL local proxy risk: ${wrongLocalProxy}`)
  if (wrongLocalProxy) {
    console.log(`Suggested Windows host: ${detectWindowsHost() || 'unknown'}`)
  }
}

function runPatch() {
  const result = spawnSync(join(dirname(__filename), 'deepseek-vscode.cjs'), ['use'], {
    env: process.env,
    stdio: 'inherit',
  })
  if (result.status) process.exit(result.status)
}

function openEditor(editor, rest) {
  const command = process.env.DEEPSEEK_CODE_BINARY || editor
  const launchArgs = rest.length > 0 ? rest : ['.']
  const result = spawnSync(command, launchArgs, { env: process.env, stdio: 'inherit' })
  if (result.error) {
    console.error(`Failed to start ${command}: ${result.error.message}`)
    process.exit(1)
  }
  process.exit(result.status || 0)
}

function printHelp() {
  console.log('Usage: deepseek-code [--cursor] [--status|--doctor|--restore|--patch] [path]')
  console.log('')
  console.log('Default behavior configures VS Code Claude Code settings and opens VS Code.')
}

const options = parseArgs(args)

try {
  if (options.command === 'help') {
    printHelp()
  } else if (options.command === 'status') {
    printStatus(options.editor)
  } else if (options.command === 'doctor') {
    printDoctor(options.editor)
  } else if (options.command === 'restore') {
    const settingsPath = restoreSettings(options.editor)
    console.log(`Restored DeepSeek VS Code settings: ${settingsPath}`)
  } else {
    const settingsPath = configureSettings(options.editor)
    console.log(`Configured DeepSeek VS Code settings: ${settingsPath}`)
    console.log(`Wrapper: ${wrapperPath}`)
    if (options.patch) runPatch()
    openEditor(options.editor, options.rest)
  }
} catch (error) {
  console.error(error.message)
  process.exit(1)
}
