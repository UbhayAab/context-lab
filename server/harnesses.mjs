// Which agent harnesses are on this machine, signed in, and which models each can drive.
// Also the harness x intelligence rulebook, with sources, so the UI never implies a combo
// is allowed when the vendor's terms say otherwise.
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const HOME = process.env.USERPROFILE ?? process.env.HOME ?? '';
const CACHE_MS = 60_000;
let cache = { at: 0, value: null };

function version(cmd, args = ['--version']) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', windowsHide: true, timeout: 15_000 });
  if (r.error || r.status !== 0) return null;
  return (r.stdout || '').trim().split('\n')[0] || null;
}

function codexBin() {
  const root = join(process.env.LOCALAPPDATA ?? '', 'OpenAI', 'Codex', 'bin');
  try {
    for (const d of readdirSync(root)) { const p = join(root, d, 'codex.exe'); if (existsSync(p)) return p; }
  } catch { /* not installed */ }
  return null;
}

function grokSignedIn() {
  const r = spawnSync('grok', ['models'], { encoding: 'utf8', windowsHide: true, timeout: 15_000 });
  return !r.error && !/not authenticated/i.test((r.stdout || '') + (r.stderr || ''));
}

function detect() {
  const claudeV = version('claude');
  const bridge = existsSync(join(HOME, 'tools', 'codex-bridge', 'server.mjs'));
  const codex = codexBin();
  const grokV = version('grok');
  return [
    {
      id: 'claude-code', name: 'Claude Code', vendor: 'Anthropic', installed: !!claudeV,
      signedIn: existsSync(join(HOME, '.claude', '.credentials.json')), version: claudeV,
      signInHint: 'Run `claude` once and sign in with your Claude plan.',
      models: [
        { combo: 'claude-code:haiku', label: 'Claude Haiku', intelligence: 'Claude', route: 'subscription' },
        { combo: 'claude-code:sonnet', label: 'Claude Sonnet', intelligence: 'Claude', route: 'subscription' },
        { combo: 'claude-code:opus', label: 'Claude Opus', intelligence: 'Claude', route: 'subscription' },
        ...(bridge ? [{ combo: 'claude-code:gpt-6.1-sol@bridge', label: 'GPT-6.1 Sol', intelligence: 'GPT', route: 'local-bridge' }] : []),
      ],
    },
    {
      id: 'codex', name: 'Codex', vendor: 'OpenAI', installed: !!codex,
      signedIn: existsSync(join(HOME, '.codex', 'auth.json')), version: codex ? version(codex) : null,
      signInHint: 'Open the Codex app or run `codex login` with your ChatGPT plan.',
      models: [{ combo: 'codex:gpt-6.1-sol', label: 'GPT-6.1 Sol', intelligence: 'GPT', route: 'subscription' }],
    },
    {
      id: 'grok', name: 'Grok Build', vendor: 'xAI', installed: !!grokV,
      signedIn: grokV ? grokSignedIn() : false, version: grokV,
      signInHint: 'Run `grok` and approve the device code at accounts.x.ai.',
      models: [{ combo: 'grok:grok-4.7', label: 'Grok 4.7', intelligence: 'Grok', route: 'subscription' }],
    },
  ];
}

export function harnessStatus() {
  if (!cache.value || Date.now() - cache.at > CACHE_MS) cache = { at: Date.now(), value: detect() };
  return cache.value;
}

// Sources: code.claude.com/docs/en/legal-and-compliance (Anthropic, read 2026-11-16);
// developers.openai.com/siwc/request-client-id (OpenAI, read 2026-11-16).
export const MIX_MATRIX = {
  harnesses: ['Claude Code', 'Codex', 'Grok Build', 'OpenCode', 'Your own harness'],
  intelligence: ['Claude', 'GPT', 'Grok', 'Gemini / open models'],
  rules: [
    'A Claude plan only powers Anthropic\'s own apps, including the unmodified Claude Code binary. Any other harness needs an Anthropic API key.',
    'A ChatGPT plan powers Codex, and third-party apps OpenAI has approved for Sign in with ChatGPT (partner program, waitlist).',
    'Everything else works with the provider\'s API key, directly or through an Anthropic- or OpenAI-compatible gateway.',
  ],
  cells: [
    { harness: 'Claude Code', intelligence: 'Claude', allowed: 'subscription', how: 'Sign in with your Claude plan inside Claude Code.' },
    { harness: 'Claude Code', intelligence: 'GPT', allowed: 'api-key', how: 'Point ANTHROPIC_BASE_URL at an Anthropic-compatible gateway with an OpenAI key. Measured here through the author\'s local bridge.' },
    { harness: 'Claude Code', intelligence: 'Grok', allowed: 'api-key', how: 'Gateway with an xAI API key.' },
    { harness: 'Claude Code', intelligence: 'Gemini / open models', allowed: 'api-key', how: 'Gateway with that provider\'s key.' },
    { harness: 'Codex', intelligence: 'Claude', allowed: 'api-key', how: 'OpenAI-compatible gateway with an Anthropic API key. A Claude plan is not allowed here.' },
    { harness: 'Codex', intelligence: 'GPT', allowed: 'subscription', how: 'Sign in with your ChatGPT plan.' },
    { harness: 'Codex', intelligence: 'Grok', allowed: 'api-key', how: 'Custom model provider with an xAI API key.' },
    { harness: 'Codex', intelligence: 'Gemini / open models', allowed: 'api-key', how: 'Custom model provider.' },
    { harness: 'Grok Build', intelligence: 'Grok', allowed: 'subscription', how: 'Sign in with your xAI account.' },
    { harness: 'Grok Build', intelligence: 'Claude', allowed: 'unverified', how: 'Not checked yet.' },
    { harness: 'Grok Build', intelligence: 'GPT', allowed: 'unverified', how: 'Not checked yet.' },
    { harness: 'Grok Build', intelligence: 'Gemini / open models', allowed: 'unverified', how: 'Not checked yet.' },
    { harness: 'OpenCode', intelligence: 'Claude', allowed: 'api-key', how: 'Anthropic API key. Claude plan sign-in is not allowed for third-party apps.' },
    { harness: 'OpenCode', intelligence: 'GPT', allowed: 'partner', how: 'Sign in with ChatGPT (OpenCode is an approved partner).' },
    { harness: 'OpenCode', intelligence: 'Grok', allowed: 'api-key', how: 'xAI API key.' },
    { harness: 'OpenCode', intelligence: 'Gemini / open models', allowed: 'api-key', how: 'Provider key or a local model.' },
    { harness: 'Your own harness', intelligence: 'Claude', allowed: 'api-key', how: 'Anthropic API key.' },
    { harness: 'Your own harness', intelligence: 'GPT', allowed: 'api-key', how: 'OpenAI API key, or Sign in with ChatGPT once OpenAI approves the app.' },
    { harness: 'Your own harness', intelligence: 'Grok', allowed: 'api-key', how: 'xAI API key.' },
    { harness: 'Your own harness', intelligence: 'Gemini / open models', allowed: 'api-key', how: 'Provider key or a local model.' },
  ],
};
