import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const TOKEN_KEY = 'financas.token';

export const tokenStore = {
  async get(): Promise<string | null> {
    try {
      if (Platform.OS === 'web') return globalThis.localStorage?.getItem(TOKEN_KEY) ?? null;
      return await SecureStore.getItemAsync(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  async set(token: string | null): Promise<void> {
    try {
      if (Platform.OS === 'web') {
        if (token) globalThis.localStorage?.setItem(TOKEN_KEY, token);
        else globalThis.localStorage?.removeItem(TOKEN_KEY);
      } else if (token) {
        await SecureStore.setItemAsync(TOKEN_KEY, token);
      } else {
        await SecureStore.deleteItemAsync(TOKEN_KEY);
      }
    } catch {}
  },
};

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

let currentToken: string | null = null;
let onUnauthorized: (() => void) | null = null;

export function setSession(token: string | null, unauthorized: (() => void) | null) {
  currentToken = token;
  onUnauthorized = unauthorized;
}

export async function api<T = void>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method: options.method ?? 'GET',
      headers: {
        ...(options.body !== undefined && { 'content-type': 'application/json' }),
        ...(currentToken && { authorization: `Bearer ${currentToken}` }),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'Sem conexão com o servidor');
  }
  if (response.status === 401 && currentToken) onUnauthorized?.();
  if (!response.ok) {
    let message = `Erro ${response.status}`;
    try {
      const text = (await response.text()).trim();
      try {
        const data = JSON.parse(text);
        if (typeof data?.error === 'string') message = data.error;
      } catch {
        if (text && text.length < 200) message = text;
      }
    } catch {}
    throw new ApiError(response.status, message);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}
