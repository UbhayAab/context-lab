// Claude Code harness. Runs the unmodified `claude` binary the user already signed in to.
// With `via: 'bridge'` the same harness talks to another model through a local
// Anthropic-compatible gateway (ANTHROPIC_BASE_URL), e.g. GPT through codex-bridge.
import { agentEnv, clip, runProcess } from '../proc.mjs';

export const HARNESS = 'claude-code';
const ALLOWED_TOOLS = 'Bash(node q.mjs:*),Read,Glob,Grep';
const BRIDGE_URL = 'http://127.0.0.1:8317';

function args(model) {
  return [
    '-p', '--model', model,
    '--setting-sources', 'project',
    '--settings', JSON.stringify({ claudeMdExcludes: ['**/*.md'] }),
    '--strict-mcp-config',
    '--tools', 'Bash,Read,Glob,Grep',
    '--allowedTools', ALLOWED_TOOLS,
    '--disable-slash-commands', '--no-session-persistence',
    '--output-format', 'stream-json', '--verbose',
  ];
}

function textOf(content) {
  if (typeof content === 'string') return content;
  return (content ?? []).map((c) => c.text ?? '').join('');
}

export async function runAgent({ cwd, prompt, model, via, timeoutMs, onStep }) {
  const steps = [];
  const pendingTools = new Map();
  let result = null;
  let initModel = null;
  const push = (s) => { steps.push(s); onStep?.(s); };

  const env = agentEnv(via === 'bridge' ? { ANTHROPIC_BASE_URL: BRIDGE_URL } : {});
  const proc = await runProcess('claude', args(model), {
    cwd, env, input: prompt, timeoutMs,
    onLine(line) {
      let ev;
      try { ev = JSON.parse(line); } catch { return; }
      if (ev.type === 'system' && ev.subtype === 'init') initModel = ev.model;
      if (ev.type === 'assistant') {
        for (const c of ev.message?.content ?? []) {
          if (c.type === 'text' && c.text.trim()) push({ kind: 'text', text: c.text });
          if (c.type === 'tool_use') {
            const step = { kind: 'tool', tool: c.name, input: c.input?.command ?? c.input?.file_path ?? JSON.stringify(c.input), output: '' };
            pendingTools.set(c.id, step);
            push(step);
          }
        }
      }
      if (ev.type === 'user') {
        for (const c of ev.message?.content ?? []) {
          if (c.type !== 'tool_result') continue;
          const step = pendingTools.get(c.tool_use_id);
          if (step) { step.output = clip(textOf(c.content), 3000); step.isError = !!c.is_error; }
        }
      }
      if (ev.type === 'result') result = ev;
    },
  });

  const u = result?.usage ?? {};
  return {
    finalText: result?.result ?? '',
    steps,
    resolvedModel: initModel,
    usage: {
      inputTokens: (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0),
      outputTokens: u.output_tokens ?? 0,
      turns: result?.num_turns ?? null,
      apiMs: result?.duration_api_ms ?? null,
      notionalCostUsd: result?.total_cost_usd ?? null,
    },
    exitCode: proc.code,
    timedOut: proc.timedOut,
    durationMs: proc.durationMs,
    error: proc.code === 0 && result && !result.is_error ? null : clip(proc.stderr || result?.result || 'no result event', 1500),
  };
}
