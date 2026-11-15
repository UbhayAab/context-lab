// Grok Build harness. Runs the official `grok` CLI the user signed in to with their xAI account.
// Subagents, plan mode and web search are off. Grok 1.0.77's --tools flag did not recognise its own
// tool names (run_terminal_command, read_file), so the tool set is not narrowed further.
import { agentEnv, clip, runProcess } from '../proc.mjs';

export const HARNESS = 'grok';

export async function runAgent({ cwd, prompt, model, timeoutMs, onStep }) {
  const steps = [];
  const tools = new Map();
  let textBuf = '';
  let allText = '';
  let end = null;
  const push = (s) => { steps.push(s); onStep?.(s); };
  const flushText = () => {
    if (textBuf.trim()) push({ kind: 'text', text: textBuf.trim() });
    textBuf = '';
  };

  const args = [
    '-p', prompt, '--output-format', 'streaming-json', '-m', model, '--cwd', cwd,
    '--allow', 'Bash(node q.mjs:*)', '--allow', 'Read',
    '--no-subagents', '--no-plan', '--disable-web-search',
  ];
  const proc = await runProcess('grok', args, {
    cwd, env: agentEnv(), input: '', timeoutMs,
    onLine(line) {
      let ev;
      try { ev = JSON.parse(line); } catch { return; }
      if (ev.type === 'text' && typeof ev.data === 'string') { textBuf += ev.data; allText += ev.data; }
      if (ev.type === 'tool_call') {
        flushText();
        const input = ev.rawInput?.command ?? ev.rawInput?.target_file ?? JSON.stringify(ev.rawInput ?? {});
        const step = { kind: 'tool', tool: ev.toolName ?? ev.title, input, output: '' };
        tools.set(ev.toolCallId, step);
        push(step);
      }
      if (ev.type === 'tool_call_update' && (ev.status === 'completed' || ev.status === 'failed')) {
        const step = tools.get(ev.toolCallId);
        if (step) {
          step.output = clip((ev.content ?? []).map((c) => c.content?.text ?? '').join('\n'), 3000);
          step.isError = ev.status === 'failed';
        }
      }
      if (ev.type === 'end') end = ev;
    },
  });
  flushText();

  const u = end?.usage ?? {};
  return {
    finalText: allText,
    steps,
    resolvedModel: model,
    usage: {
      inputTokens: (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0),
      outputTokens: (u.output_tokens ?? 0) + (u.reasoning_tokens ?? 0),
      turns: end?.num_turns ?? null,
      notionalCostUsd: end?.total_cost_usd ?? null,
    },
    exitCode: proc.code,
    timedOut: proc.timedOut,
    durationMs: proc.durationMs,
    error: proc.code === 0 && end ? null : clip(proc.stderr || 'grok ended without an end event', 1500),
  };
}
