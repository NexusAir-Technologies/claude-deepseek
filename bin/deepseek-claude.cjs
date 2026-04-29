#!/usr/bin/env node
const {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  appendFileSync,
  copyFileSync,
  readdirSync,
  lstatSync,
  symlinkSync,
} = require('fs')
const { homedir } = require('os')
const { delimiter, dirname, join, resolve } = require('path')
const { spawn, execSync } = require('child_process')

const originalCwd = process.cwd()
const projectDir = resolve(dirname(__dirname))
const legacyClaudeConfigDir = join(homedir(), '.claude')
const legacyClaudeConfigPath = join(homedir(), '.claude.json')
const configDir = join(homedir(), '.deepseek-claude')
const settingsPath = join(configDir, 'settings.json')
const deepseekClaudeConfigPath = join(configDir, '.claude.json')
const DEEPSEEK_MCP_ENV_BLOCKLIST = new Set([
  'ANTHROPIC_BASE_URL',
  'ANTHROPIC_AUTH_TOKEN',
  'CLAUDE_CODE_OAUTH_TOKEN',
  'CLAUDE_CONFIG_DIR',
])

const DEEPSEEK_MODEL_ALIASES = {
  default: 'deepseek-v4-pro',
  'deepseek-v4-pro': 'deepseek-v4-pro',
  'deepseek-v4-pro[1m]': 'deepseek-v4-pro',
  'deepseek-reasoner': 'deepseek-v4-pro',
  'deepseek-v4-flash': 'deepseek-chat',
  'deepseek-chat': 'deepseek-chat',
}
const DEEPSEEK_EFFORT_INPUT_LEVELS = ['auto', 'low', 'medium', 'high', 'max']
const DEEPSEEK_DEFAULT_MODEL = 'deepseek-v4-pro'
const DEEPSEEK_DEFAULT_EFFORT = 'low'
const DEEPSEEK_MODELS = [
  {
    value: 'deepseek-v4-pro',
    displayName: 'DeepSeek V4 Pro',
    description: 'DeepSeek V4 Pro reasoning model',
    supportsEffort: true,
    supportsMaxEffort: true,
  },
  {
    value: 'deepseek-chat',
    displayName: 'DeepSeek Chat',
    description: 'DeepSeek chat model',
  },
]

const defaultSettings = {
  $schema: 'https://json.schemastore.org/claude-code-settings.json',
  env: {
    DISABLE_TELEMETRY: '1',
    DISABLE_ERROR_REPORTING: '1',
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
    CLAUDE_CODE_DISABLE_NONSTREAMING_FALLBACK: '1',
    CLAUDE_CODE_USE_NATIVE_FILE_SEARCH: '1',
    MCP_TIMEOUT: '60000',
    API_TIMEOUT_MS: '3000000',
    ANTHROPIC_BASE_URL: 'https://api.deepseek.com/anthropic',
  },
  includeCoAuthoredBy: false,
  model: DEEPSEEK_DEFAULT_MODEL,
}

function getPackageVersion() {
  try {
    return JSON.parse(readFileSync(join(projectDir, 'package.json'), 'utf8')).version
  } catch {
    return 'unknown'
  }
}

function logVsCodeShim(message, data) {
  if (process.env.DEEPSEEK_CLAUDE_VSCODE !== '1') return

  try {
    const payload = data ? ` ${JSON.stringify(data)}` : ''
    appendFileSync(join(configDir, 'vscode-shim.log'), `${new Date().toISOString()} ${message}${payload}\n`)
  } catch {
    // Ignore logging failures in the launcher.
  }
}

function isVsCodeAuthStatusRequest(args) {
  return (
    process.env.DEEPSEEK_CLAUDE_VSCODE === '1' &&
    args[0] === 'auth' &&
    args[1] === 'status' &&
    args.includes('--json')
  )
}

function writeVsCodeAuthStatus() {
  const status = {
    loggedIn: true,
    authMethod: 'third_party',
    apiProvider: 'anthropic',
    apiKeySource: 'DeepSeek',
  }
  process.stdout.write(`${JSON.stringify(status, null, 2)}\n`)
  logVsCodeShim('auth_status_proxy_response', status)
  process.exit(0)
}

function getContentLength(content) {
  if (typeof content === 'string') return content.length
  if (Array.isArray(content)) return content.length
  if (content && typeof content === 'object') return Object.keys(content).length
  return undefined
}

function normalizeVsCodeUserMessage(message) {
  if (message?.type !== 'user') return message

  const content = message.message?.content
  if (!content || typeof content !== 'object' || Array.isArray(content)) return message

  const text =
    typeof content.text === 'string'
      ? content.text
      : typeof content.content === 'string'
        ? content.content
        : typeof content.value === 'string'
          ? content.value
          : typeof content.message === 'string'
            ? content.message
            : undefined

  if (!text) {
    logVsCodeShim('user_content_object_unhandled', { keys: Object.keys(content) })
    return message
  }

  const normalized = {
    ...message,
    message: {
      ...message.message,
      content: text,
    },
  }
  logVsCodeShim('user_content_normalized', { from: 'object', to: 'string', length: text.length })
  return normalized
}

function describeVsCodeInputMessage(message) {
  const summary = {
    type: message?.type,
    subtype: message?.request?.subtype,
    requestId: message?.request_id,
    uuid: message?.uuid,
  }

  if (message?.type === 'user') {
    const content = message.message?.content
    summary.contentType = Array.isArray(content) ? 'array' : typeof content
    summary.contentLength = getContentLength(content)
    if (content && typeof content === 'object' && !Array.isArray(content)) {
      summary.contentKeys = Object.keys(content)
    }
  }

  return summary
}

function describeVsCodeOutputMessage(message) {
  return {
    type: message?.type,
    subtype: message?.subtype ?? message?.response?.subtype,
    requestId: message?.request_id ?? message?.response?.request_id,
    uuid: message?.uuid,
    isError: message?.is_error,
  }
}

function logVsCodeTextChunk(buffer, label, chunk) {
  buffer.value += chunk.toString()
  let newlineIndex = buffer.value.indexOf('\n')
  while (newlineIndex !== -1) {
    const line = buffer.value.slice(0, newlineIndex).trim()
    buffer.value = buffer.value.slice(newlineIndex + 1)
    if (line) {
      logVsCodeShim(label, { text: line.slice(0, 1000), length: line.length })
    }
    newlineIndex = buffer.value.indexOf('\n')
  }
}

function logVsCodeOutputChunk(buffer, chunk) {
  buffer.value += chunk.toString()
  let newlineIndex = buffer.value.indexOf('\n')
  while (newlineIndex !== -1) {
    const line = buffer.value.slice(0, newlineIndex).trim()
    buffer.value = buffer.value.slice(newlineIndex + 1)
    if (line) {
      try {
        logVsCodeShim('child_stdout_message', describeVsCodeOutputMessage(JSON.parse(line)))
      } catch {
        logVsCodeShim('child_stdout_non_json', { length: line.length })
      }
    }
    newlineIndex = buffer.value.indexOf('\n')
  }
}

function toApiModel(model) {
  return DEEPSEEK_MODEL_ALIASES[model] || model
}

function fromApiModel(model) {
  return Object.entries(DEEPSEEK_MODEL_ALIASES).find(([, apiModel]) => apiModel === model)?.[0] || model
}

function modelSupportsEffort(model) {
  return model === DEEPSEEK_DEFAULT_MODEL
}

function normalizeEffort(effort) {
  if (typeof effort !== 'string') return undefined
  const normalized = effort.toLowerCase()
  return DEEPSEEK_EFFORT_INPUT_LEVELS.includes(normalized) ? normalized : undefined
}

function readCurrentEffort() {
  try {
    const settings = JSON.parse(readFileSync(settingsPath, 'utf8'))
    const effort = normalizeEffort(settings?.deepseek?.effort)
    return effort === 'auto' ? DEEPSEEK_DEFAULT_EFFORT : effort || DEEPSEEK_DEFAULT_EFFORT
  } catch {
    return DEEPSEEK_DEFAULT_EFFORT
  }
}

function readCurrentModel() {
  try {
    const settings = JSON.parse(readFileSync(settingsPath, 'utf8'))
    const model = typeof settings?.model === 'string' && settings.model ? settings.model : DEEPSEEK_DEFAULT_MODEL
    return fromApiModel(model)
  } catch {
    return DEEPSEEK_DEFAULT_MODEL
  }
}

function persistCurrentModel(model) {
  const displayModel = fromApiModel(model)
  if (!DEEPSEEK_MODELS.some(item => item.value === displayModel)) return
  const apiModel = toApiModel(displayModel)
  try {
    const settings = JSON.parse(readFileSync(settingsPath, 'utf8'))
    settings.model = apiModel
    settings.env = {
      ...(settings.env || {}),
      CLAUDE_CODE_SUBAGENT_MODEL: apiModel,
      ANTHROPIC_BASE_URL: defaultSettings.env.ANTHROPIC_BASE_URL,
    }
    writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, {
      mode: 0o600,
    })
    logVsCodeShim('model_persisted', { model: displayModel, apiModel })
  } catch (error) {
    logVsCodeShim('model_persist_error', { model, message: error.message })
  }
}

function persistCurrentEffort(effort) {
  const normalizedEffort = normalizeEffort(effort)
  if (!normalizedEffort) return
  try {
    const settings = JSON.parse(readFileSync(settingsPath, 'utf8'))
    settings.deepseek = {
      ...(settings.deepseek || {}),
      effort: normalizedEffort,
    }
    writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, {
      mode: 0o600,
    })
    logVsCodeShim('effort_persisted', { effort: normalizedEffort })
  } catch (error) {
    logVsCodeShim('effort_persist_error', { effort: normalizedEffort, message: error.message })
  }
}

function writeControlSuccess(message, response = {}) {
  process.stdout.write(
    `${JSON.stringify({
      type: 'control_response',
      response: {
        subtype: 'success',
        request_id: message.request_id,
        response,
      },
    })}\n`,
  )
}

function getRequestModel(message) {
  return message.request?.model || message.request?.modelId || message.request?.value
}

function effortFromThinkingTokens(tokens) {
  if (tokens === null) return 'auto'
  if (!Number.isInteger(tokens)) return undefined
  if (tokens <= 50) return 'low'
  if (tokens <= 85) return 'medium'
  if (tokens <= 100) return 'high'
  return 'max'
}

function getRequestEffort(message) {
  if (Object.hasOwn(message.request || {}, 'max_thinking_tokens')) {
    return effortFromThinkingTokens(message.request.max_thinking_tokens)
  }
  return (
    message.request?.effort ||
    message.request?.effortLevel ||
    message.request?.level ||
    message.request?.value
  )
}

function buildInitializeResponse(message, childPid) {
  return {
    type: 'control_response',
    response: {
      subtype: 'success',
      request_id: message.request_id,
      response: {
        commands: [],
        agents: [],
        models: DEEPSEEK_MODELS,
        output_style: 'default',
        available_output_styles: ['default'],
        account: {
          apiProvider: 'anthropic',
          apiKeySource: 'DeepSeek',
        },
        pid: childPid,
      },
    },
  }
}

function buildGetSettingsResponse(message) {
  const currentModel = readCurrentModel()
  const supportsEffort = modelSupportsEffort(currentModel)
  const currentEffort = supportsEffort ? readCurrentEffort() : null
  const effectiveSettings = {
    model: currentModel,
    env: {
      ANTHROPIC_BASE_URL: 'https://api.deepseek.com/anthropic',
    },
    permissions: {
      allow: [],
      deny: [],
      ask: [],
    },
  }

  return {
    type: 'control_response',
    response: {
      subtype: 'success',
      request_id: message.request_id,
      response: {
        effective: effectiveSettings,
        sources: [
          {
            source: 'userSettings',
            settings: effectiveSettings,
          },
        ],
        applied: {
          model: currentModel,
          effort: currentEffort,
        },
      },
    },
  }
}

function removeArgWithValue(args, name) {
  const result = []
  for (let index = 0; index < args.length; index++) {
    if (args[index] === name) {
      index++
      continue
    }
    result.push(args[index])
  }
  return result
}

function getForwardArgs() {
  const args = process.argv.slice(2)
  if (
    process.env.DEEPSEEK_CLAUDE_VSCODE === '1' &&
    args.includes('--output-format') &&
    args.includes('stream-json') &&
    args.includes('--input-format')
  ) {
    const vscodeArgs = removeArgWithValue(args, '--resume')
    if (vscodeArgs.length !== args.length) {
      logVsCodeShim('resume_arg_stripped', { originalArgs: args.length, forwardArgs: vscodeArgs.length })
    }
    if (!vscodeArgs.includes('--print') && !vscodeArgs.includes('-p')) {
      vscodeArgs.unshift('--print')
    }
    if (!vscodeArgs.includes('--verbose')) {
      vscodeArgs.unshift('--verbose')
    }
    if (!vscodeArgs.includes('--strict-mcp-config')) {
      vscodeArgs.push('--strict-mcp-config')
    }
    if (!vscodeArgs.includes('--bare')) {
      vscodeArgs.push('--bare')
    }
    return vscodeArgs
  }
  return args
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

function readJson(file, fallback) {
  if (!existsSync(file)) return fallback
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return fallback
  }
}

function writeJsonWithBackup(file, value, suffix = 'deepseek.bak') {
  mkdirSync(dirname(file), { recursive: true })
  if (existsSync(file)) {
    const backup = `${file}.${suffix}`
    if (!existsSync(backup)) copyFileSync(file, backup)
  }
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 })
}

function filterDeepSeekMcpServerEnv(server) {
  if (!server || typeof server !== 'object' || !server.env || typeof server.env !== 'object') {
    return server
  }
  const env = Object.fromEntries(
    Object.entries(server.env).filter(([key]) => !DEEPSEEK_MCP_ENV_BLOCKLIST.has(key.toUpperCase())),
  )
  return { ...server, env }
}

function filterDeepSeekMcpServers(servers) {
  if (!servers || typeof servers !== 'object') return undefined
  return Object.fromEntries(
    Object.entries(servers).map(([name, server]) => [name, filterDeepSeekMcpServerEnv(server)]),
  )
}

function inheritLegacyDir(name) {
  const deepseekDir = join(configDir, name)
  const legacyDir = join(legacyClaudeConfigDir, name)
  if (existsSync(deepseekDir) || !existsSync(legacyDir)) return
  try {
    symlinkSync(legacyDir, deepseekDir, 'dir')
  } catch (error) {
    logVsCodeShim(`${name}_symlink_failed`, { message: error.message })
  }
}

function inheritLegacySkillsDir() {
  inheritLegacyDir('skills')
}

function inheritLegacyCommandsDir() {
  inheritLegacyDir('commands')
}

function inheritLegacyMcpConfig() {
  const legacyConfig = readJson(legacyClaudeConfigPath, {})
  const deepseekConfig = readJson(deepseekClaudeConfigPath, {})
  let changed = false

  const legacyMcpServers = filterDeepSeekMcpServers(legacyConfig.mcpServers)
  if (legacyMcpServers && Object.keys(legacyMcpServers).length > 0) {
    const existing = deepseekConfig.mcpServers || {}
    const merged = { ...legacyMcpServers, ...existing }
    if (JSON.stringify(merged) !== JSON.stringify(existing)) {
      deepseekConfig.mcpServers = merged
      changed = true
    }
  }

  const legacyProjects = legacyConfig.projects || {}
  const deepseekProjects = deepseekConfig.projects || {}
  for (const [projectPath, projectConfig] of Object.entries(legacyProjects)) {
    const legacyProjectMcpServers = filterDeepSeekMcpServers(projectConfig?.mcpServers)
    if (!legacyProjectMcpServers || Object.keys(legacyProjectMcpServers).length === 0) continue
    const existingProject = deepseekProjects[projectPath] || {}
    const existingServers = existingProject.mcpServers || {}
    const mergedServers = { ...legacyProjectMcpServers, ...existingServers }
    if (JSON.stringify(mergedServers) === JSON.stringify(existingServers)) continue
    deepseekProjects[projectPath] = {
      ...existingProject,
      mcpServers: mergedServers,
    }
    changed = true
  }

  if (changed) {
    deepseekConfig.projects = deepseekProjects
    writeJsonWithBackup(deepseekClaudeConfigPath, deepseekConfig, 'mcp-inherit.bak')
  }
}

function ensureCliCompatibilityAssets() {
  inheritLegacySkillsDir()
  inheritLegacyCommandsDir()
  inheritLegacyMcpConfig()
}

function countDirectoryEntries(dir) {
  if (!existsSync(dir)) return 0
  try {
    return readdirSync(dir).length
  } catch {
    return 0
  }
}

function pathState(path) {
  if (!existsSync(path)) return 'missing'
  try {
    const stat = lstatSync(path)
    if (stat.isSymbolicLink?.()) return 'symlink'
    if (stat.isDirectory()) return 'directory'
    if (stat.isFile()) return 'file'
  } catch {
    return 'unknown'
  }
  return 'present'
}

function doctorCliIntegration() {
  ensureCliCompatibilityAssets()
  const deepseekConfig = readJson(deepseekClaudeConfigPath, {})
  const legacyConfig = readJson(legacyClaudeConfigPath, {})
  const currentProject = originalCwd
  const deepseekProjectServers = deepseekConfig.projects?.[currentProject]?.mcpServers || {}
  const legacyProjectServers = legacyConfig.projects?.[currentProject]?.mcpServers || {}
  const skillsDir = join(configDir, 'skills')
  const legacySkillsDir = join(legacyClaudeConfigDir, 'skills')
  const commandsDir = join(configDir, 'commands')
  const legacyCommandsDir = join(legacyClaudeConfigDir, 'commands')

  console.log(`DeepSeek CLI doctor
CLI settings: ${existsSync(settingsPath) ? settingsPath : 'missing'}
DeepSeek config: ${existsSync(deepseekClaudeConfigPath) ? deepseekClaudeConfigPath : 'missing'}
Legacy Claude config: ${existsSync(legacyClaudeConfigPath) ? legacyClaudeConfigPath : 'missing'}
Skills dir: ${skillsDir} (${pathState(skillsDir)}, entries=${countDirectoryEntries(skillsDir)})
Legacy skills dir: ${legacySkillsDir} (${pathState(legacySkillsDir)}, entries=${countDirectoryEntries(legacySkillsDir)})
Commands dir: ${commandsDir} (${pathState(commandsDir)}, entries=${countDirectoryEntries(commandsDir)})
Legacy commands dir: ${legacyCommandsDir} (${pathState(legacyCommandsDir)}, entries=${countDirectoryEntries(legacyCommandsDir)})
DeepSeek top-level MCP: ${Object.keys(deepseekConfig.mcpServers || {}).length}
Legacy top-level MCP: ${Object.keys(legacyConfig.mcpServers || {}).length}
DeepSeek project MCP (${currentProject}): ${Object.keys(deepseekProjectServers).length}
Legacy project MCP (${currentProject}): ${Object.keys(legacyProjectServers).length}`)
}

function handleCliCommand(args) {
  if (args[0] !== 'doctor') return false
  doctorCliIntegration()
  return true
}

const cliArgs = process.argv.slice(2)
if (handleCliCommand(cliArgs)) {
  process.exit(0)
}

mkdirSync(configDir, { recursive: true })
ensureCliCompatibilityAssets()

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

function readConfigApiKey() {
  try {
    const config = JSON.parse(readFileSync(deepseekClaudeConfigPath, 'utf8'))
    if (typeof config?.env?.ANTHROPIC_API_KEY === 'string' && config.env.ANTHROPIC_API_KEY) {
      return { key: config.env.ANTHROPIC_API_KEY, source: 'config_env' }
    }
    if (typeof config?.apiKeyHelper === 'string' && config.apiKeyHelper.trim()) {
      const key = execSync(config.apiKeyHelper, {
        encoding: 'utf8',
        env: process.env,
        cwd: originalCwd,
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: 5000,
      }).trim()
      if (key) return { key, source: 'config_apiKeyHelper' }
    }
  } catch {
    return undefined
  }

  return undefined
}

function readSettingsApiKey() {
  try {
    const settings = JSON.parse(readFileSync(settingsPath, 'utf8'))
    if (typeof settings?.env?.ANTHROPIC_API_KEY === 'string' && settings.env.ANTHROPIC_API_KEY) {
      return { key: settings.env.ANTHROPIC_API_KEY, source: 'settings_env' }
    }
    if (typeof settings?.apiKeyHelper === 'string' && settings.apiKeyHelper.trim()) {
      const key = execSync(settings.apiKeyHelper, {
        encoding: 'utf8',
        env: process.env,
        cwd: originalCwd,
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: 5000,
      }).trim()
      if (key) return { key, source: 'apiKeyHelper' }
    }
  } catch {
    return undefined
  }

  return undefined
}

function resolveConfiguredApiKey() {
  if (process.env.DEEPSEEK_CLAUDE_VSCODE === '1') {
    const isolatedApiKey = readSettingsApiKey() || readConfigApiKey()
    if (isolatedApiKey) return isolatedApiKey
    if (process.env.ANTHROPIC_API_KEY) return { key: process.env.ANTHROPIC_API_KEY, source: 'env' }
    return undefined
  }

  if (process.env.ANTHROPIC_API_KEY) return { key: process.env.ANTHROPIC_API_KEY, source: 'env' }
  return readSettingsApiKey() || readConfigApiKey()
}

process.env.CLAUDE_CONFIG_DIR = configDir
process.env.CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST = '1'
process.env.ANTHROPIC_BASE_URL = 'https://api.deepseek.com/anthropic'
const configuredApiKey = resolveConfiguredApiKey()
if (configuredApiKey?.key) {
  process.env.ANTHROPIC_API_KEY = configuredApiKey.key
}
delete process.env.ANTHROPIC_AUTH_TOKEN
delete process.env.CLAUDE_CODE_OAUTH_TOKEN
process.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC ||= '1'
process.env.CLAUDE_CODE_DISABLE_NONSTREAMING_FALLBACK ||= '1'
process.env.CLAUDE_CODE_SUBAGENT_MODEL ||= toApiModel(readCurrentModel())
process.env.CLAUDE_CODE_USE_NATIVE_FILE_SEARCH ||= '1'
if (process.env.DEEPSEEK_CLAUDE_VSCODE === '1') {
  process.env.MCP_TIMEOUT = process.env.DEEPSEEK_VSCODE_MCP_TIMEOUT || '5000'
}
process.env.PATH = [
  join(projectDir, 'node_modules', '.bin'),
  join(homedir(), '.bun', 'bin'),
  process.env.PATH,
]
  .filter(Boolean)
  .join(delimiter)

const originalArgs = process.argv.slice(2)
if (isVsCodeAuthStatusRequest(originalArgs)) {
  writeVsCodeAuthStatus()
}

const bun = resolveBunBinary()
const forwardArgs = getForwardArgs()
const args = ['run', join(projectDir, 'src/dev-entry.ts')].concat(forwardArgs)

logVsCodeShim('launch', {
  packageVersion: getPackageVersion(),
  launcherPath: __filename,
  argv: process.argv.slice(2),
  forwardArgs,
  bun,
  args,
  cwd: originalCwd,
  node: process.execPath,
  mcpTimeout: process.env.MCP_TIMEOUT,
  configDir: process.env.CLAUDE_CONFIG_DIR,
  baseUrl: process.env.ANTHROPIC_BASE_URL,
  hasApiKey: Boolean(process.env.ANTHROPIC_API_KEY),
  apiKeySource: configuredApiKey?.source,
})

const child = spawn(bun, args, {
  cwd: originalCwd,
  env: process.env,
  stdio: process.env.DEEPSEEK_CLAUDE_VSCODE === '1' ? ['pipe', 'pipe', 'pipe'] : 'inherit',
})

logVsCodeShim('child_spawned', {
  pid: child.pid,
  stdin: Boolean(child.stdin),
  stdout: Boolean(child.stdout),
  stderr: Boolean(child.stderr),
})

let childExited = false
let forwardingSignal = false

function signalChild(signal, reason) {
  if (childExited || !child.pid) return
  try {
    logVsCodeShim('child_signal_send', { signal, reason, pid: child.pid })
    child.kill(signal)
  } catch (error) {
    logVsCodeShim('child_signal_error', { signal, reason, message: error.message })
  }
}

function endChildInput(reason) {
  if (!child.stdin || child.stdin.destroyed) return
  try {
    logVsCodeShim('child_stdin_end_request', { reason })
    child.stdin.end()
  } catch (error) {
    logVsCodeShim('child_stdin_end_error', { reason, message: error.message })
  }
}

function handleParentSignal(signal) {
  logVsCodeShim('parent_signal', { signal })
  forwardingSignal = true
  signalChild(signal, 'parent_signal')
  setTimeout(() => process.exit(128), 1000).unref()
}

for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(signal, () => handleParentSignal(signal))
}

if (process.env.DEEPSEEK_CLAUDE_VSCODE === '1') {
  let bufferedInput = ''

  function maybeProxyControlRequests() {
    const forwardedLines = []
    let newlineIndex = bufferedInput.indexOf('\n')
    while (newlineIndex !== -1) {
      const originalLine = bufferedInput.slice(0, newlineIndex)
      const line = originalLine.trim()
      bufferedInput = bufferedInput.slice(newlineIndex + 1)
      let shouldForward = true
      let forwardedLine = originalLine
      if (line) {
        try {
          const message = JSON.parse(line)
          logVsCodeShim('stdin_message', describeVsCodeInputMessage(message))
          const normalizedMessage = normalizeVsCodeUserMessage(message)
          if (normalizedMessage !== message) {
            forwardedLine = JSON.stringify(normalizedMessage)
          }
          if (message.type === 'control_request') {
            if (message.request?.subtype === 'set_model') {
              const model = getRequestModel(message)
              if (model) {
                const forwardedMessage = {
                  ...normalizedMessage,
                  request: {
                    ...(normalizedMessage.request || {}),
                    model: toApiModel(model),
                    value: toApiModel(model),
                  },
                }
                forwardedLine = JSON.stringify(forwardedMessage)
              }
            } else if (message.request?.subtype === 'update_settings' && message.request?.settings?.model) {
              const forwardedMessage = {
                ...normalizedMessage,
                request: {
                  ...(normalizedMessage.request || {}),
                  settings: {
                    ...normalizedMessage.request.settings,
                    model: toApiModel(message.request.settings.model),
                  },
                },
              }
              forwardedLine = JSON.stringify(forwardedMessage)
            }
          }
          if (
            message.type === 'control_request' &&
            message.request?.subtype === 'initialize' &&
            message.request_id
          ) {
            process.stdout.write(`${JSON.stringify(buildInitializeResponse(message, child.pid))}\n`)
            shouldForward = false
            logVsCodeShim('initialize_proxy_response', { requestId: message.request_id })
          } else if (
            message.type === 'control_request' &&
            message.request?.subtype === 'get_settings' &&
            message.request_id
          ) {
            process.stdout.write(`${JSON.stringify(buildGetSettingsResponse(message))}\n`)
            shouldForward = false
            logVsCodeShim('get_settings_proxy_response', { requestId: message.request_id })
          } else if (
            message.type === 'control_request' &&
            message.request?.subtype === 'set_model' &&
            message.request_id
          ) {
            const model = getRequestModel(message)
            persistCurrentModel(model)
            writeControlSuccess(message, { model: readCurrentModel() })
            shouldForward = false
            logVsCodeShim('set_model_proxy_response', { requestId: message.request_id, model })
          } else if (
            message.type === 'control_request' &&
            message.request?.subtype === 'update_settings' &&
            message.request_id
          ) {
            const model = message.request?.settings?.model
            if (model) persistCurrentModel(model)
            writeControlSuccess(message, buildGetSettingsResponse(message).response.response)
            shouldForward = false
            logVsCodeShim('update_settings_proxy_response', { requestId: message.request_id, model })
          } else if (
            message.type === 'control_request' &&
            (message.request?.subtype === 'set_max_thinking_tokens' ||
              message.request?.subtype === 'set_effort') &&
            message.request_id
          ) {
            const effort = getRequestEffort(message)
            persistCurrentEffort(effort)
            writeControlSuccess(message, { effort: readCurrentEffort() })
            shouldForward = false
            logVsCodeShim('set_effort_proxy_response', { requestId: message.request_id, effort })
          } else if (
            message.type === 'control_request' &&
            message.request?.subtype === 'interrupt' &&
            message.request_id
          ) {
            logVsCodeShim('interrupt_received', { requestId: message.request_id })
            shouldForward = false
            signalChild('SIGINT', 'control_interrupt')
          } else if (
            message.type === 'control_request' &&
            message.request?.subtype === 'end_session' &&
            message.request_id
          ) {
            logVsCodeShim('end_session_received', {
              requestId: message.request_id,
              reason: message.request?.reason,
            })
            shouldForward = false
            endChildInput('control_end_session')
            signalChild('SIGTERM', 'control_end_session')
          }
        } catch (error) {
          logVsCodeShim('control_proxy_parse_error', { message: error.message })
        }
      }
      if (shouldForward) {
        forwardedLines.push(`${forwardedLine}\n`)
      }
      newlineIndex = bufferedInput.indexOf('\n')
    }
    return forwardedLines.join('')
  }

  process.stdin.on('data', chunk => {
    const text = chunk.toString()
    bufferedInput += text
    const forwardedText = maybeProxyControlRequests()

    if (forwardedText && !child.stdin.destroyed) {
      logVsCodeShim('stdin_forward', { length: forwardedText.length })
      child.stdin.write(forwardedText)
    }
  })

  process.stdin.on('end', () => {
    if (bufferedInput && !child.stdin.destroyed) {
      logVsCodeShim('stdin_forward_trailing', { length: bufferedInput.length })
      child.stdin.write(bufferedInput)
      bufferedInput = ''
    }
    logVsCodeShim('stdin_end')
    child.stdin.end()
  })
  process.stdin.on('error', error => {
    logVsCodeShim('stdin_error', { message: error.message })
    child.stdin.destroy(error)
  })

  const childStdoutBuffer = { value: '' }
  child.stdout.on('data', chunk => {
    logVsCodeOutputChunk(childStdoutBuffer, chunk)
    process.stdout.write(chunk)
  })
  child.stdout.on('end', () => {
    if (childStdoutBuffer.value.trim()) {
      try {
        logVsCodeShim(
          'child_stdout_message',
          describeVsCodeOutputMessage(JSON.parse(childStdoutBuffer.value.trim())),
        )
      } catch {
        logVsCodeShim('child_stdout_trailing_non_json', {
          length: childStdoutBuffer.value.trim().length,
        })
      }
      childStdoutBuffer.value = ''
    }
  })
  const childStderrBuffer = { value: '' }
  child.stderr.on('data', chunk => {
    logVsCodeTextChunk(childStderrBuffer, 'child_stderr_line', chunk)
    process.stderr.write(chunk)
  })
  child.stderr.on('end', () => {
    if (childStderrBuffer.value.trim()) {
      logVsCodeShim('child_stderr_trailing', {
        text: childStderrBuffer.value.trim().slice(0, 1000),
        length: childStderrBuffer.value.trim().length,
      })
      childStderrBuffer.value = ''
    }
  })
}

child.on('error', error => {
  logVsCodeShim('child_error', { message: error.message })
  console.error('Failed to start DeepSeek Claude: Bun runtime was not found.')
  console.error('Please install Bun first: https://bun.sh/docs/installation')
  console.error('If Bun is already installed, set BUN_BINARY to the full bun executable path.')
  process.exit(1)
})

child.on('exit', (code, signal) => {
  childExited = true
  logVsCodeShim('child_exit', { code, signal })
  if (signal && !forwardingSignal) {
    process.kill(process.pid, signal)
    return
  }
  process.exit(code || 0)
})
