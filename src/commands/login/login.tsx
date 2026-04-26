import { feature } from 'bun:bundle'
import * as React from 'react'
import { useState } from 'react'
import { resetCostState } from '../../bootstrap/state.js'
import {
  clearTrustedDeviceToken,
  enrollTrustedDevice,
} from '../../bridge/trustedDevice.js'
import type { LocalJSXCommandContext } from '../../commands.js'
import { ConfigurableShortcutHint } from '../../components/ConfigurableShortcutHint.js'
import { Dialog } from '../../components/design-system/Dialog.js'
import TextInput from '../../components/TextInput.js'
import { useMainLoopModel } from '../../hooks/useMainLoopModel.js'
import { Box, Text } from '../../ink.js'
import { refreshGrowthBookAfterAuthChange } from '../../services/analytics/growthbook.js'
import { refreshPolicyLimits } from '../../services/policyLimits/index.js'
import { refreshRemoteManagedSettings } from '../../services/remoteManagedSettings/index.js'
import type { LocalJSXCommandOnDone } from '../../types/command.js'
import { saveApiKey } from '../../utils/auth.js'
import { saveGlobalConfig } from '../../utils/config.js'
import { stripSignatureBlocks } from '../../utils/messages.js'
import {
  checkAndDisableAutoModeIfNeeded,
  checkAndDisableBypassPermissionsIfNeeded,
  resetAutoModeGateCheck,
  resetBypassPermissionsCheck,
} from '../../utils/permissions/bypassPermissionsKillswitch.js'
import { resetUserCache } from '../../utils/user.js'

function normalizeDeepSeekBaseUrl(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) {
    return null
  }

  try {
    const withProtocol = /^https?:\/\//i.test(trimmed)
      ? trimmed
      : `https://${trimmed}`
    const url = new URL(withProtocol)

    if (!['https:', 'http:'].includes(url.protocol)) {
      return null
    }

    if (url.host !== 'api.deepseek.com') {
      return null
    }

    const path = url.pathname.replace(/\/+$/, '')
    if (path === '' || path === '/') {
      url.pathname = '/anthropic'
    } else if (path !== '/anthropic') {
      return null
    }

    return `${url.origin}${url.pathname}`
  } catch {
    return null
  }
}

async function validateDeepSeekApiKey(baseUrl: string, apiKey: string): Promise<void> {
  const response = await fetch(`${baseUrl}/v1/messages`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'deepseek-v4-pro',
      max_tokens: 1,
      messages: [{ role: 'user', content: 'ping' }],
    }),
    signal: AbortSignal.timeout(15_000),
  })

  if (response.status === 401) {
    throw new Error('DeepSeek API Key 无效或已过期（401），请重新输入')
  }

  if (!response.ok) {
    throw new Error(`DeepSeek API Key 验证失败（HTTP ${response.status}）`)
  }
}

export async function call(
  onDone: LocalJSXCommandOnDone,
  context: LocalJSXCommandContext,
): Promise<React.ReactNode> {
  return (
    <Login
      onDone={async success => {
        context.onChangeAPIKey()
        context.setMessages(stripSignatureBlocks)
        if (success) {
          resetCostState()
          void refreshRemoteManagedSettings()
          void refreshPolicyLimits()
          resetUserCache()
          refreshGrowthBookAfterAuthChange()
          clearTrustedDeviceToken()
          void enrollTrustedDevice()
          resetBypassPermissionsCheck()
          const appState = context.getAppState()
          void checkAndDisableBypassPermissionsIfNeeded(
            appState.toolPermissionContext,
            context.setAppState,
          )
          if (feature('TRANSCRIPT_CLASSIFIER')) {
            resetAutoModeGateCheck()
            void checkAndDisableAutoModeIfNeeded(
              appState.toolPermissionContext,
              context.setAppState,
              appState.fastMode,
            )
          }
          context.setAppState(prev => ({
            ...prev,
            authVersion: prev.authVersion + 1,
          }))
        }
        onDone(success ? 'DeepSeek 登录成功' : '登录已取消')
      }}
    />
  )
}

export function Login(props: {
  onDone: (success: boolean, mainLoopModel: string) => void
  startingMessage?: string
}): React.ReactNode {
  const mainLoopModel = useMainLoopModel()
  const [baseUrl, setBaseUrl] = useState('https://api.deepseek.com/anthropic')
  const [apiKey, setApiKey] = useState('')
  const [step, setStep] = useState<'base_url' | 'api_key'>('base_url')
  const [error, setError] = useState<string | null>(null)
  const [isValidating, setIsValidating] = useState(false)
  const [baseUrlCursorOffset, setBaseUrlCursorOffset] = useState(0)
  const [apiKeyCursorOffset, setApiKeyCursorOffset] = useState(0)

  const submitBaseUrl = () => {
    const normalized = normalizeDeepSeekBaseUrl(baseUrl)
    if (!normalized) {
      setError('请输入有效 DeepSeek Anthropic 地址（如 https://api.deepseek.com/anthropic）')
      return
    }
    setBaseUrl(normalized)
    setError(null)
    setStep('api_key')
  }

  const submitApiKey = async () => {
    const normalizedBaseUrl = normalizeDeepSeekBaseUrl(baseUrl)
    if (!normalizedBaseUrl) {
      setError('Base URL 无效，请返回上一步重新输入')
      setStep('base_url')
      return
    }

    const trimmedKey = apiKey.trim()
    if (!trimmedKey) {
      setError('请输入 DeepSeek API Key')
      return
    }

    setIsValidating(true)
    try {
      await validateDeepSeekApiKey(normalizedBaseUrl, trimmedKey)
      await saveApiKey(trimmedKey)
      saveGlobalConfig(current => ({
        ...current,
        env: {
          ...(current.env ?? {}),
          ANTHROPIC_BASE_URL: normalizedBaseUrl,
          ANTHROPIC_API_KEY: trimmedKey,
        },
      }))
      process.env.ANTHROPIC_BASE_URL = normalizedBaseUrl
      process.env.ANTHROPIC_API_KEY = trimmedKey
      setError(null)
      props.onDone(true, mainLoopModel)
    } catch (e) {
      const message = e instanceof Error ? e.message : 'DeepSeek API Key 验证失败'
      setError(message)
    } finally {
      setIsValidating(false)
    }
  }

  return (
    <Dialog
      title="Login"
      onCancel={() => props.onDone(false, mainLoopModel)}
      color="permission"
      inputGuide={exitState =>
        exitState.pending ? (
          <Text>Press {exitState.keyName} again to exit</Text>
        ) : (
          <ConfigurableShortcutHint
            action="confirm:no"
            context="Confirmation"
            fallback="Esc"
            description="cancel"
          />
        )
      }
    >
      <Box flexDirection="column">
        <Text>使用 DeepSeek Anthropic 兼容接口登录</Text>
        {step === 'base_url' ? (
          <>
            <Text dimColor>Step 1/2: 输入 Base URL</Text>
            <Box marginTop={1}>
              <TextInput
                value={baseUrl}
                onChange={setBaseUrl}
                onSubmit={submitBaseUrl}
                columns={80}
                cursorOffset={baseUrlCursorOffset}
                onChangeCursorOffset={setBaseUrlCursorOffset}
                focus
                showCursor
              />
            </Box>
          </>
        ) : (
          <>
            <Text dimColor>Step 2/2: 输入 DeepSeek API Key</Text>
            <Text dimColor>Base URL: {baseUrl}</Text>
            <Box marginTop={1}>
              <TextInput
                value={apiKey}
                onChange={setApiKey}
                onSubmit={() => {
                  if (!isValidating) {
                    void submitApiKey()
                  }
                }}
                columns={80}
                cursorOffset={apiKeyCursorOffset}
                onChangeCursorOffset={setApiKeyCursorOffset}
                mask="*"
                placeholder={isValidating ? '正在验证...' : 'sk-...'}
                focus={!isValidating}
                showCursor
              />
            </Box>
            {isValidating ? (
              <Box marginTop={1}>
                <Text dimColor>正在验证 DeepSeek API Key...</Text>
              </Box>
            ) : null}
            <Box marginTop={1}>
              <Text dimColor>
                按 Enter 保存并生效；若要修改 URL，按 Esc 取消后重开 /login。
              </Text>
            </Box>
          </>
        )}
        {error ? (
          <Box marginTop={1}>
            <Text color="error">{error}</Text>
          </Box>
        ) : null}
      </Box>
    </Dialog>
  )
}
