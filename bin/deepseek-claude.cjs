#!/usr/bin/env node
const {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  appendFileSync,
  readdirSync,
  statSync,
  copyFileSync,
  chmodSync,
} = require('fs')
const { homedir } = require('os')
const { delimiter, dirname, join, resolve } = require('path')
const { spawn, execSync } = require('child_process')

const originalCwd = process.cwd()
const projectDir = resolve(dirname(__dirname))
const configDir = join(homedir(), '.deepseek-claude')
const settingsPath = join(configDir, 'settings.json')

const DEEPSEEK_DEFAULT_MODEL = 'deepseek-v4-pro[1m]'
const DEEPSEEK_DEFAULT_FAST_MODEL = 'deepseek-v4-flash'
const DEEPSEEK_API_EFFORT_LEVELS = ['low', 'medium', 'high', 'max']
const DEEPSEEK_VSCODE_EFFORT_LEVELS = ['low', 'medium', 'high', 'xhigh', 'max']
const DEEPSEEK_EFFORT_LEVELS = DEEPSEEK_VSCODE_EFFORT_LEVELS
const DEEPSEEK_DEFAULT_EFFORT = 'max'
const DEEPSEEK_SUPPORTED_CAPABILITIES = 'effort,xhigh_effort,max_effort,thinking,adaptive_thinking,interleaved_thinking'
const DEEPSEEK_VSCODE_COMMANDS = [
  {
    type: 'local-jsx',
    name: 'effort',
    description: 'Set effort level for model usage',
    argumentHint: '[low|medium|high|xhigh|max]',
  },
  {
    type: 'local-jsx',
    name: 'model',
    description: 'Set the AI model for Claude Code',
    argumentHint: '[model]',
  },
]
const DEEPSEEK_MODEL_ALIASES = {
  default: DEEPSEEK_DEFAULT_MODEL,
  'deepseek-v4-pro': DEEPSEEK_DEFAULT_MODEL,
  'deepseek-v4-pro[1m]': DEEPSEEK_DEFAULT_MODEL,
  'deepseek-reasoner': DEEPSEEK_DEFAULT_MODEL,
  'deepseek-v4-flash': DEEPSEEK_DEFAULT_FAST_MODEL,
  'deepseek-chat': DEEPSEEK_DEFAULT_FAST_MODEL,
}
const DEEPSEEK_REASONING_MODEL_VALUES = new Set(['deepseek-v4-pro[1m]'])
const DEEPSEEK_MODELS = [
  {
    value: DEEPSEEK_DEFAULT_MODEL,
    displayName: 'DeepSeek V4 Pro',
    description: 'DeepSeek V4 Pro · 1M context reasoning mode',
    supportsEffort: true,
    supportedEffortLevels: DEEPSEEK_EFFORT_LEVELS,
  },
  {
    value: DEEPSEEK_DEFAULT_FAST_MODEL,
    displayName: 'DeepSeek V4 Flash',
    description: 'DeepSeek V4 Flash · faster model for subagents and everyday tasks',
  },
]

const defaultSettings = {
  $schema: 'https://json.schemastore.org/claude-code-settings.json',
  env: {
    DISABLE_TELEMETRY: '1',
    DISABLE_ERROR_REPORTING: '1',
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
    CLAUDE_CODE_DISABLE_NONSTREAMING_FALLBACK: '1',
    CLAUDE_CODE_SUBAGENT_MODEL: DEEPSEEK_DEFAULT_FAST_MODEL,
    CLAUDE_CODE_EFFORT_LEVEL: DEEPSEEK_DEFAULT_EFFORT,
    ANTHROPIC_MODEL: DEEPSEEK_DEFAULT_MODEL,
    ANTHROPIC_DEFAULT_OPUS_MODEL: DEEPSEEK_DEFAULT_MODEL,
    ANTHROPIC_DEFAULT_SONNET_MODEL: DEEPSEEK_DEFAULT_MODEL,
    ANTHROPIC_DEFAULT_HAIKU_MODEL: DEEPSEEK_DEFAULT_FAST_MODEL,
    ANTHROPIC_DEFAULT_OPUS_MODEL_SUPPORTED_CAPABILITIES: DEEPSEEK_SUPPORTED_CAPABILITIES,
    ANTHROPIC_DEFAULT_SONNET_MODEL_SUPPORTED_CAPABILITIES: DEEPSEEK_SUPPORTED_CAPABILITIES,
    ANTHROPIC_CUSTOM_MODEL_OPTION_SUPPORTED_CAPABILITIES: DEEPSEEK_SUPPORTED_CAPABILITIES,
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
  if (model === 'deepseek-chat') return DEEPSEEK_DEFAULT_FAST_MODEL
  if (model === DEEPSEEK_DEFAULT_FAST_MODEL) return DEEPSEEK_DEFAULT_FAST_MODEL
  return DEEPSEEK_DEFAULT_MODEL
}

function normalizeDisplayModel(model) {
  const displayModel = fromApiModel(model)
  if (DEEPSEEK_MODELS.some(item => item.value === displayModel)) return displayModel
  return DEEPSEEK_DEFAULT_MODEL
}

function normalizeEffort(effort) {
  if (typeof effort === 'number' && Number.isFinite(effort)) {
    if (effort >= 31999) return 'max'
    if (effort >= 16000) return 'high'
    if (effort >= 8000) return 'medium'
    return 'low'
  }
  const value = String(effort || '').toLowerCase()
  if (DEEPSEEK_VSCODE_EFFORT_LEVELS.includes(value)) return value
  return DEEPSEEK_DEFAULT_EFFORT
}

function toApiEffort(effort) {
  const normalized = normalizeEffort(effort)
  if (normalized === 'xhigh') return 'high'
  if (DEEPSEEK_API_EFFORT_LEVELS.includes(normalized)) return normalized
  return DEEPSEEK_DEFAULT_EFFORT
}

function modelSupportsEffort(model) {
  return DEEPSEEK_REASONING_MODEL_VALUES.has(model)
}

function effortToMaxThinkingTokens(effort) {
  switch (normalizeEffort(effort)) {
    case 'max':
      return 31999
    case 'xhigh':
      return 24000
    case 'high':
      return 16000
    case 'medium':
      return 8000
    case 'low':
    default:
      return 4000
  }
}

function readCurrentEffort() {
  try {
    const settings = JSON.parse(readFileSync(settingsPath, 'utf8'))
    return normalizeEffort(settings?.deepseek?.effort)
  } catch {
    return DEEPSEEK_DEFAULT_EFFORT
  }
}

function readCurrentModel() {
  try {
    const settings = JSON.parse(readFileSync(settingsPath, 'utf8'))
    const model = typeof settings?.model === 'string' && settings.model ? settings.model : DEEPSEEK_DEFAULT_MODEL
    return normalizeDisplayModel(model)
  } catch {
    return DEEPSEEK_DEFAULT_MODEL
  }
}

function buildEffortState(model = readCurrentModel()) {
  const supportsEffort = modelSupportsEffort(model)
  const effort = supportsEffort ? readCurrentEffort() : null
  const maxThinkingTokens = supportsEffort ? effortToMaxThinkingTokens(effort) : null
  return {
    effort,
    effortLevel: effort,
    currentEffort: effort,
    defaultEffort: supportsEffort ? DEEPSEEK_DEFAULT_EFFORT : null,
    defaultEffortLevel: supportsEffort ? DEEPSEEK_DEFAULT_EFFORT : null,
    maxThinkingTokens,
    supportsEffort,
    supportsMaxEffort: supportsEffort,
    supportedEffortLevels: supportsEffort ? DEEPSEEK_EFFORT_LEVELS : [],
  }
}

function buildModelDescriptor(model) {
  const descriptor = { ...model }
  if (!modelSupportsEffort(model.value)) {
    return {
      ...descriptor,
      supportsEffort: false,
      supportsMaxEffort: false,
      supportedEffortLevels: [],
    }
  }
  return {
    ...descriptor,
    ...buildEffortState(model.value),
  }
}

function buildModelDescriptors() {
  return DEEPSEEK_MODELS.map(buildModelDescriptor)
}

function persistCurrentModel(model) {
  const displayModel = normalizeDisplayModel(model)
  if (!DEEPSEEK_MODELS.some(item => item.value === displayModel)) return
  const apiModel = toApiModel(displayModel)
  try {
    const settings = JSON.parse(readFileSync(settingsPath, 'utf8'))
    settings.model = displayModel
    settings.env = {
      ...defaultSettings.env,
      ...(settings.env || {}),
      CLAUDE_CODE_SUBAGENT_MODEL: DEEPSEEK_DEFAULT_FAST_MODEL,
      CLAUDE_CODE_EFFORT_LEVEL:
        settings.env?.CLAUDE_CODE_EFFORT_LEVEL || DEEPSEEK_DEFAULT_EFFORT,
      ANTHROPIC_MODEL: displayModel,
      ANTHROPIC_DEFAULT_OPUS_MODEL: DEEPSEEK_DEFAULT_MODEL,
      ANTHROPIC_DEFAULT_SONNET_MODEL: DEEPSEEK_DEFAULT_MODEL,
      ANTHROPIC_DEFAULT_HAIKU_MODEL: DEEPSEEK_DEFAULT_FAST_MODEL,
      ANTHROPIC_DEFAULT_OPUS_MODEL_SUPPORTED_CAPABILITIES: DEEPSEEK_SUPPORTED_CAPABILITIES,
      ANTHROPIC_DEFAULT_SONNET_MODEL_SUPPORTED_CAPABILITIES: DEEPSEEK_SUPPORTED_CAPABILITIES,
      ANTHROPIC_CUSTOM_MODEL_OPTION_SUPPORTED_CAPABILITIES: DEEPSEEK_SUPPORTED_CAPABILITIES,
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
  const normalized = normalizeEffort(effort)
  try {
    const settings = JSON.parse(readFileSync(settingsPath, 'utf8'))
    settings.deepseek = {
      ...(settings.deepseek || {}),
      effort: normalized,
    }
    writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, {
      mode: 0o600,
    })
    logVsCodeShim('effort_persisted', { effort: normalized })
  } catch (error) {
    logVsCodeShim('effort_persist_error', { effort: normalized, message: error.message })
  }
}

function writeControlSuccess(message, response = {}) {
  const controlResponse = {
    type: 'control_response',
    response: {
      subtype: 'success',
      request_id: message.request_id,
      response,
    },
  }
  logVsCodeShim('control_success_response', {
    requestId: message.request_id,
    requestSubtype: message.request?.subtype,
    response,
  })
  process.stdout.write(`${JSON.stringify(controlResponse)}\n`)
}

function getRequestModel(message) {
  return message.request?.model || message.request?.modelId || message.request?.value
}

function getRequestEffort(message) {
  const request = message.request || {}
  return (
    request.effort ||
    request.effortLevel ||
    request.level ||
    request.value ||
    request.maxThinkingTokens ||
    request.max_thinking_tokens ||
    request.maxTokens ||
    request.tokens ||
    request.settings?.effort ||
    request.settings?.effortLevel ||
    request.settings?.maxThinkingTokens ||
    request.settings?.max_thinking_tokens
  )
}

function buildInitializeResponse(message, childPid) {
  const currentModel = readCurrentModel()
  const effortState = buildEffortState(currentModel)
  return {
    type: 'control_response',
    response: {
      subtype: 'success',
      request_id: message.request_id,
      response: {
        commands: DEEPSEEK_VSCODE_COMMANDS,
        agents: [],
        models: buildModelDescriptors(),
        model: currentModel,
        ...effortState,
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
  const effortState = buildEffortState(currentModel)
  const effectiveSettings = {
    model: currentModel,
    effort: effortState.effort,
    effortLevel: effortState.effortLevel,
    maxThinkingTokens: effortState.maxThinkingTokens,
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
          ...effortState,
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

function readSettingsFile() {
  try {
    return JSON.parse(readFileSync(settingsPath, 'utf8'))
  } catch {
    return undefined
  }
}

function hasDeepSeekCliConfig() {
  const settings = readSettingsFile()
  const hasBaseUrl =
    typeof settings?.env?.ANTHROPIC_BASE_URL === 'string' && settings.env.ANTHROPIC_BASE_URL.trim()
  const hasKey =
    (typeof settings?.env?.ANTHROPIC_AUTH_TOKEN === 'string' && settings.env.ANTHROPIC_AUTH_TOKEN.trim()) ||
    (typeof settings?.env?.ANTHROPIC_API_KEY === 'string' && settings.env.ANTHROPIC_API_KEY.trim())
  return Boolean(hasBaseUrl && hasKey)
}

function assertDeepSeekCliConfigured() {
  if (hasDeepSeekCliConfig()) return

  console.error(`DeepSeek CLI 尚未完成配置，无法管理 VS Code 集成。

请先在 CLI 中配置 DeepSeek API URL 和 API Key，例如：

  deepseek-claude login

或手动确认以下文件包含 env.ANTHROPIC_BASE_URL 和 env.ANTHROPIC_AUTH_TOKEN / env.ANTHROPIC_API_KEY：

  ${settingsPath}`)
  process.exit(1)
}

function getExtensionSearchRoots() {
  return [
    join(homedir(), '.vscode-server', 'extensions'),
    join(homedir(), '.vscode', 'extensions'),
    join(homedir(), '.cursor-server', 'extensions'),
    join(homedir(), '.cursor', 'extensions'),
    join(homedir(), '.windsurf-server', 'extensions'),
    join(homedir(), '.windsurf', 'extensions'),
  ]
}

function findClaudeCodeExtensionDirs() {
  const dirs = []
  for (const root of getExtensionSearchRoots()) {
    if (!existsSync(root)) continue
    for (const entry of readdirSync(root)) {
      if (!entry.startsWith('anthropic.claude-code-')) continue
      const fullPath = join(root, entry)
      try {
        if (statSync(fullPath).isDirectory()) dirs.push(fullPath)
      } catch {
        // Ignore entries that disappear during scanning.
      }
    }
  }
  return dirs.sort()
}

function getNativeBinaryPath(extensionDir) {
  return join(extensionDir, 'resources', 'native-binary', 'claude')
}

function selectLatestExtensionDir() {
  const dirs = findClaudeCodeExtensionDirs()
  return dirs[dirs.length - 1]
}

function isDeepSeekWrapper(path) {
  try {
    const content = readFileSync(path, 'utf8')
    return content.includes('DEEPSEEK_CLAUDE_VSCODE=1') || content.includes('deepseek-claude.cjs')
  } catch {
    return false
  }
}

function requireNativeBinary() {
  const extensionDir = selectLatestExtensionDir()
  if (!extensionDir) {
    console.error(`未找到 VS Code Claude Code 插件目录。
请先安装官方 Claude Code VS Code 插件，然后重新执行：

  deepseek-claude vscode install`)
    process.exit(1)
  }

  const target = getNativeBinaryPath(extensionDir)
  if (!existsSync(target)) {
    console.error(`未找到 Claude Code native binary：${target}`)
    process.exit(1)
  }

  return { extensionDir, target, backup: `${target}.official-backup` }
}

function installVsCodeIntegration() {
  assertDeepSeekCliConfigured()
  const { extensionDir, target, backup } = requireNativeBinary()

  if (!existsSync(backup)) {
    if (isDeepSeekWrapper(target)) {
      console.error(`当前 VS Code 启动入口已经是 DeepSeek wrapper，但官方备份不存在：${backup}
为避免覆盖错误备份，请重新安装官方 Claude Code VS Code 插件后再执行 install。`)
      process.exit(1)
    }
    copyFileSync(target, backup)
    chmodSync(backup, 0o755)
  }

  writeFileSync(
    target,
    `#!/usr/bin/env bash
export DEEPSEEK_CLAUDE_VSCODE=1
export CLAUDE_CONFIG_DIR="$HOME/.deepseek-claude"
exec "${__filename}" "$@"
`,
    { mode: 0o755 },
  )
  chmodSync(target, 0o755)

  console.log(`DeepSeek VS Code 集成已启用。
插件目录: ${extensionDir}
启动入口: ${target}
官方备份: ${backup}

请在 VS Code 执行 Developer: Reload Window，或重启 VS Code。`)
}

function restoreVsCodeIntegration() {
  assertDeepSeekCliConfigured()
  const { extensionDir, target, backup } = requireNativeBinary()

  if (!existsSync(backup)) {
    console.error(`未找到官方 Claude Code binary 备份，无法自动 restore：${backup}
建议在 VS Code 中重新安装 Claude Code 插件恢复官方版本。`)
    process.exit(1)
  }

  copyFileSync(backup, target)
  chmodSync(target, 0o755)

  console.log(`已还原官方 Claude Code VS Code 启动入口。
插件目录: ${extensionDir}
启动入口: ${target}

请在 VS Code 执行 Developer: Reload Window，或重启 VS Code。`)
}

function doctorVsCodeIntegration() {
  const settings = readSettingsFile()
  const extensionDir = selectLatestExtensionDir()
  const target = extensionDir ? getNativeBinaryPath(extensionDir) : undefined
  const backup = target ? `${target}.official-backup` : undefined
  const state = target && existsSync(target) ? (isDeepSeekWrapper(target) ? 'deepseek wrapper' : 'official/unknown') : 'missing'

  console.log(`DeepSeek VS Code doctor
CLI settings: ${existsSync(settingsPath) ? settingsPath : 'missing'}
API URL: ${settings?.env?.ANTHROPIC_BASE_URL ? 'present' : 'missing'}
API Key: ${settings?.env?.ANTHROPIC_AUTH_TOKEN || settings?.env?.ANTHROPIC_API_KEY ? 'present' : 'missing'}
VS Code extension: ${extensionDir || 'missing'}
Native binary: ${target || 'missing'}
Native state: ${state}
Official backup: ${backup && existsSync(backup) ? backup : 'missing'}`)
}

function handleVsCodeCommand(args) {
  if (args[0] !== 'vscode') return false

  const command = args[1]
  if (command === 'install') installVsCodeIntegration()
  else if (command === 'restore') restoreVsCodeIntegration()
  else if (command === 'doctor') doctorVsCodeIntegration()
  else {
    console.error(`未知 VS Code 命令：${command || ''}

用法：
  deepseek-claude vscode install
  deepseek-claude vscode restore
  deepseek-claude vscode doctor`)
    process.exit(1)
  }
  return true
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

const cliArgs = process.argv.slice(2)
if (handleVsCodeCommand(cliArgs)) {
  process.exit(0)
}

mkdirSync(configDir, { recursive: true })

if (!existsSync(settingsPath)) {
  writeFileSync(settingsPath, `${JSON.stringify(defaultSettings, null, 2)}\n`, {
    mode: 0o600,
  })
} else {
  try {
    const currentSettings = JSON.parse(readFileSync(settingsPath, 'utf8'))
    const currentModel = normalizeDisplayModel(currentSettings.model ?? defaultSettings.model)
    const mergedSettings = {
      ...currentSettings,
      env: {
        ...defaultSettings.env,
        ...(currentSettings.env || {}),
        CLAUDE_CODE_SUBAGENT_MODEL: DEEPSEEK_DEFAULT_FAST_MODEL,
        CLAUDE_CODE_EFFORT_LEVEL:
          currentSettings.env?.CLAUDE_CODE_EFFORT_LEVEL || DEEPSEEK_DEFAULT_EFFORT,
        ANTHROPIC_MODEL: normalizeDisplayModel(currentSettings.env?.ANTHROPIC_MODEL || currentModel),
        ANTHROPIC_DEFAULT_OPUS_MODEL: DEEPSEEK_DEFAULT_MODEL,
        ANTHROPIC_DEFAULT_SONNET_MODEL: DEEPSEEK_DEFAULT_MODEL,
        ANTHROPIC_DEFAULT_HAIKU_MODEL: DEEPSEEK_DEFAULT_FAST_MODEL,
        ANTHROPIC_DEFAULT_OPUS_MODEL_SUPPORTED_CAPABILITIES: DEEPSEEK_SUPPORTED_CAPABILITIES,
        ANTHROPIC_DEFAULT_SONNET_MODEL_SUPPORTED_CAPABILITIES: DEEPSEEK_SUPPORTED_CAPABILITIES,
        ANTHROPIC_CUSTOM_MODEL_OPTION_SUPPORTED_CAPABILITIES: DEEPSEEK_SUPPORTED_CAPABILITIES,
        ANTHROPIC_BASE_URL: defaultSettings.env.ANTHROPIC_BASE_URL,
      },
      includeCoAuthoredBy:
        currentSettings.includeCoAuthoredBy ?? defaultSettings.includeCoAuthoredBy,
      model: currentModel,
    }
    writeFileSync(settingsPath, `${JSON.stringify(mergedSettings, null, 2)}\n`, {
      mode: 0o600,
    })
  } catch {
    // Keep user settings intact if they are temporarily invalid.
  }
}

function resolveConfiguredApiKey() {
  if (process.env.ANTHROPIC_AUTH_TOKEN) return { key: process.env.ANTHROPIC_AUTH_TOKEN, source: 'auth_token_env' }
  if (process.env.ANTHROPIC_API_KEY) return { key: process.env.ANTHROPIC_API_KEY, source: 'api_key_env' }

  try {
    const settings = JSON.parse(readFileSync(settingsPath, 'utf8'))
    if (typeof settings?.env?.ANTHROPIC_AUTH_TOKEN === 'string' && settings.env.ANTHROPIC_AUTH_TOKEN) {
      return { key: settings.env.ANTHROPIC_AUTH_TOKEN, source: 'settings_auth_token' }
    }
    if (typeof settings?.env?.ANTHROPIC_API_KEY === 'string' && settings.env.ANTHROPIC_API_KEY) {
      return { key: settings.env.ANTHROPIC_API_KEY, source: 'settings_api_key' }
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

process.env.CLAUDE_CONFIG_DIR = configDir
process.env.CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST = '1'
process.env.ANTHROPIC_BASE_URL = 'https://api.deepseek.com/anthropic'
const configuredApiKey = resolveConfiguredApiKey()
if (configuredApiKey?.key) {
  process.env.ANTHROPIC_AUTH_TOKEN = configuredApiKey.key
  process.env.ANTHROPIC_API_KEY = configuredApiKey.key
}
delete process.env.CLAUDE_CODE_OAUTH_TOKEN
process.env.ANTHROPIC_MODEL ||= DEEPSEEK_DEFAULT_MODEL
process.env.ANTHROPIC_DEFAULT_OPUS_MODEL ||= DEEPSEEK_DEFAULT_MODEL
process.env.ANTHROPIC_DEFAULT_SONNET_MODEL ||= DEEPSEEK_DEFAULT_MODEL
process.env.ANTHROPIC_DEFAULT_HAIKU_MODEL ||= DEEPSEEK_DEFAULT_FAST_MODEL
process.env.ANTHROPIC_DEFAULT_OPUS_MODEL_SUPPORTED_CAPABILITIES ||= DEEPSEEK_SUPPORTED_CAPABILITIES
process.env.ANTHROPIC_DEFAULT_SONNET_MODEL_SUPPORTED_CAPABILITIES ||= DEEPSEEK_SUPPORTED_CAPABILITIES
process.env.ANTHROPIC_CUSTOM_MODEL_OPTION_SUPPORTED_CAPABILITIES ||= DEEPSEEK_SUPPORTED_CAPABILITIES
process.env.CLAUDE_CODE_EFFORT_LEVEL ||= DEEPSEEK_DEFAULT_EFFORT
process.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC ||= '1'
process.env.CLAUDE_CODE_DISABLE_NONSTREAMING_FALLBACK ||= '1'
process.env.CLAUDE_CODE_SUBAGENT_MODEL ||= DEEPSEEK_DEFAULT_FAST_MODEL
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
  hasApiKey: Boolean(process.env.ANTHROPIC_AUTH_TOKEN || process.env.ANTHROPIC_API_KEY),
  authTokenPresent: Boolean(process.env.ANTHROPIC_AUTH_TOKEN),
  anthropicModel: process.env.ANTHROPIC_MODEL,
  defaultOpusModel: process.env.ANTHROPIC_DEFAULT_OPUS_MODEL,
  defaultSonnetModel: process.env.ANTHROPIC_DEFAULT_SONNET_MODEL,
  defaultHaikuModel: process.env.ANTHROPIC_DEFAULT_HAIKU_MODEL,
  subagentModel: process.env.CLAUDE_CODE_SUBAGENT_MODEL,
  effortLevel: process.env.CLAUDE_CODE_EFFORT_LEVEL,
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
            const initializeResponse = buildInitializeResponse(message, child.pid)
            process.stdout.write(`${JSON.stringify(initializeResponse)}\n`)
            shouldForward = false
            logVsCodeShim('initialize_proxy_response', {
              requestId: message.request_id,
              models: initializeResponse.response.response.models,
            })
          } else if (
            message.type === 'control_request' &&
            message.request?.subtype === 'get_settings' &&
            message.request_id
          ) {
            const settingsResponse = buildGetSettingsResponse(message)
            process.stdout.write(`${JSON.stringify(settingsResponse)}\n`)
            shouldForward = false
            logVsCodeShim('get_settings_proxy_response', {
              requestId: message.request_id,
              response: settingsResponse.response.response,
            })
          } else if (
            message.type === 'control_request' &&
            message.request?.subtype === 'set_model' &&
            message.request_id
          ) {
            const model = getRequestModel(message)
            persistCurrentModel(model)
            writeControlSuccess(message, buildGetSettingsResponse(message).response.response.applied)
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
            writeControlSuccess(message, buildGetSettingsResponse(message).response.response.applied)
            shouldForward = false
            logVsCodeShim('set_effort_proxy_response', { requestId: message.request_id, effort })
          } else if (
            message.type === 'control_request' &&
            message.request?.subtype === 'apply_flag_settings' &&
            message.request_id
          ) {
            const effort = getRequestEffort(message)
            const model = message.request?.settings?.model
            if (model) persistCurrentModel(model)
            if (effort) persistCurrentEffort(effort)
            writeControlSuccess(message, buildGetSettingsResponse(message).response.response)
            shouldForward = false
            logVsCodeShim('apply_flag_settings_proxy_response', { requestId: message.request_id, model, effort })
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
