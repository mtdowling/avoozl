// The API key for scripts and other programs that are not a browser (SW4.12).
// Kept free of JSX so node can test it directly.
import type { AppApi } from '@kirocrew/app-sdk'
import { COMMAND_PATH } from './workspace-api.ts'

export interface ApiKeyView {
  key: string
}

export function apiKeyClient(api: AppApi) {
  const run = async <T>(operation: string) => (await api.post<{ result: T }>(COMMAND_PATH, { operation, input: {} })).result
  return {
    view: () => run<ApiKeyView>('serve.key.view'),
    regenerate: () => run<ApiKeyView>('serve.key.regenerate'),
  }
}

export const KEY_HEADER = 'X-Api-Key'
export const REGENERATE_CONFIRM = {
  title: 'Regenerate the API key?',
  body: 'The old key stops working at once. Every script that uses it needs the new one.',
  action: 'Regenerate',
}
