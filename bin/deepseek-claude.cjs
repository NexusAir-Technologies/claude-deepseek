#!/usr/bin/env node
const { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } = require('fs')
const { homedir } = require('os')
const { delimiter, dirname, join, resolve } = require('path')
const { spawn, execSync } = require('child_process')

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

function buildInitializeResponse(message, childPid) {
  return {
    type: 'control_response',
    response: {
      subtype: 'success',
      request_id: message.request_id,
      response: {
        commands: [],
        agents: [],
        models: [],
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
  const effectiveSettings = {
    model: 'deepseek-v4-pro',
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
          model: 'deepseek-v4-pro',
          effort: null,
        },
      },
    },
  }
}

function getForwardArgs() {
  const args = process.argv.slice(2)
  if (
    process.env.DEEPSEEK_CLAUDE_VSCODE === '1' &&
    args.includes('--output-format') &&
    args.includes('stream-json') &&
    args.includes('--input-format')
  ) {
    const vscodeArgs = [...args]
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
  if (process.env.ANTHROPIC_API_KEY) return { key: process.env.ANTHROPIC_API_KEY, source: 'env' }

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
process.env.CLAUDE_CODE_SUBAGENT_MODEL ||= 'deepseek-v4-pro'
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

if (process.env.DEEPSEEK_CLAUDE_VSCODE === '1') {
  let bufferedInput = ''

  function maybeProxyControlRequests() {
    const forwardedLines = []
    let newlineIndex = bufferedInput.indexOf('\n')
    while (newlineIndex !== -1) {
      const originalLine = bufferedInput.slice(0, newlineIndex)
      const line = originalLine.trim()
      bufferedInput = bufferedInput.slice(newlineIndex + 1)
      let forwardedLine = originalLine
      if (line) {
        try {
          const message = JSON.parse(line)
          logVsCodeShim('stdin_message', describeVsCodeInputMessage(message))
          const normalizedMessage = normalizeVsCodeUserMessage(message)
          if (normalizedMessage !== message) {
            forwardedLine = JSON.stringify(normalizedMessage)
          }
          if (
            message.type === 'control_request' &&
            message.request?.subtype === 'initialize' &&
            message.request_id
          ) {
            process.stdout.write(`${JSON.stringify(buildInitializeResponse(message, child.pid))}\n`)
            logVsCodeShim('initialize_proxy_response', { requestId: message.request_id })
          } else if (
            message.type === 'control_request' &&
            message.request?.subtype === 'get_settings' &&
            message.request_id
          ) {
            process.stdout.write(`${JSON.stringify(buildGetSettingsResponse(message))}\n`)
            logVsCodeShim('get_settings_proxy_response', { requestId: message.request_id })
          }
        } catch (error) {
          logVsCodeShim('control_proxy_parse_error', { message: error.message })
        }
      }
      forwardedLines.push(`${forwardedLine}\n`)
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
  logVsCodeShim('child_exit', { code, signal })
  if (signal) {
    process.kill(process.pid, signal)
    return
  }
  process.exit(code || 0)
})
