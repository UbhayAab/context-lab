// Codex harness. Runs the official Codex CLI the user signed in to with ChatGPT.
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { agentEnv, clip, runProcess } from '../proc.mjs';

export const HARNESS = 'codex';

function codexBinary() {
  if (process.env.CODEX_BIN) return process.env.CODEX_BIN;
  const root = join(process.env.LOCALAPPDATA ?? '', 'OpenAI', 'Codex', 'bin');
  try {
    const dirs = readdirSync(root)
      .map((d) => join(root, d, 'codex.exe'))
      .filter((p) => { try { return statSync(p).isFile(); } catch { return false; } })
      .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
    if (dirs.length) return dirs[0];
  } catch { /* fall through to PATH */ }
  return 'codex';
}

export async function runAgent({ cwd, prompt, model, effort = 'medium', timeoutMs, onStep }) {
  const steps = [];
  let usage = null;
  let lastMessage = '';
  let errorText = null;
  const push = (s) => { steps.push(s); onStep?.(s); };

  const args = [
    'exec', '--skip-git-repo-check', '-s', 'read-only', '--json',
    '-m', model, '-c', `model_reasoning_effort="${effort}"`, '-C', cwd, prompt,
  ];
  const proc = await runProcess(codexBinary(), args, {
    cwd, env: agentEnv(), input: '', timeoutMs,
    onLine(line) {
      let ev;
      try { ev = JSON.parse(line); } catch { return; }
      if (ev.type === 'item.completed') {
        const it = ev.item ?? {};
        if (it.type === 'command_execution') {
          push({ kind: 'tool', tool: 'shell', input: it.command, output: clip(it.aggregated_output ?? '', 3000), isError: it.exit_code !== 0 });
        } else if (it.type === 'agent_message' && it.text) {
          lastMessage = it.text;
          push({ kind: 'text', text: it.text });
        }
      }
      if (ev.type === 'turn.completed') usage = ev.usage;
      if (ev.type === 'error' || ev.type === 'turn.failed') errorText = ev.message ?? ev.error?.message ?? JSON.stringify(ev);
    },
  });

  return {
    finalText: lastMessage,
    steps,
    resolvedModel: model,
    effort,
    usage: {
      inputTokens: usage?.input_tokens ?? null,
      cachedInputTokens: usage?.cached_input_tokens ?? null,
      outputTokens: (usage?.output_tokens ?? 0) + (usage?.reasoning_output_tokens ?? 0),
      turns: steps.filter((s) => s.kind === 'tool').length + 1,
    },
    exitCode: proc.code,
    timedOut: proc.timedOut,
    durationMs: proc.durationMs,
    error: proc.code === 0 && !errorText ? null : clip(errorText || proc.stderr || 'codex exited non-zero', 1500),
  };
}
