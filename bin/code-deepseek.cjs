#!/usr/bin/env node
const { spawnSync } = require('child_process')
const { join, dirname } = require('path')

console.warn('code-deepseek is deprecated. Use deepseek-code instead.')
const result = spawnSync(join(dirname(__filename), 'deepseek-code.cjs'), process.argv.slice(2), {
  env: process.env,
  stdio: 'inherit',
})

if (result.error) {
  console.error(`Failed to start deepseek-code: ${result.error.message}`)
  process.exit(1)
}

process.exit(result.status || 0)
