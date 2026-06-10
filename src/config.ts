import fs from 'node:fs';
import path from 'node:path';

function loadDotEnv(filePath: string): void {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadDotEnv(path.resolve(process.cwd(), '.env'));

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function optionalInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
}

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, '');
}

export const config = {
  host: process.env.TRANSLATOR_HOST || '127.0.0.1',
  port: optionalInt('TRANSLATOR_PORT', 3002),
  upstreamBaseUrl: normalizeBaseUrl(required('UPSTREAM_BASE_URL')),
  upstreamApiKey: required('UPSTREAM_API_KEY'),
  upstreamTimeoutMs: optionalInt('UPSTREAM_TIMEOUT_MS', 120_000),
  models: (process.env.TRANSLATOR_MODELS || 'claude-opus-4-7')
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean),
  defaultModel: process.env.DEFAULT_MODEL || 'claude-opus-4-7',
};
