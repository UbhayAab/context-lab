// Child-process helper: line streaming, hard timeout with tree kill, clean env for nested agents.
import { spawn, spawnSync } from 'node:child_process';

// Variables that would make a nested Claude Code think it runs inside this session,
// or make local chat hooks wait for a human.
const STRIP_ENV = ['CLAUDECODE', 'CLAUDE_CODE_SESSION_ID', 'CLAUDE_PID', 'CLAUDE_CODE_ENTRYPOINT'];

export function agentEnv(extra = {}) {
  const env = { ...process.env, CLAUDE_NO_CHAT_WAIT: '1', ...extra };
  for (const k of STRIP_ENV) delete env[k];
  return env;
}

function killTree(pid) {
  if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
  else try { process.kill(-pid, 'SIGKILL'); } catch { /* already gone */ }
}

export function runProcess(cmd, args, { cwd, env, input, timeoutMs = 300_000, onLine } = {}) {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(cmd, args, { cwd, env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    let stdout = '';
    let stderr = '';
    let pending = '';
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; killTree(child.pid); }, timeoutMs);

    child.stdout.on('data', (buf) => {
      const s = buf.toString('utf8');
      stdout += s;
      if (!onLine) return;
      pending += s;
      const lines = pending.split(/\r?\n/);
      pending = lines.pop();
      for (const line of lines) if (line.trim()) onLine(line);
    });
    child.stderr.on('data', (buf) => { stderr += buf.toString('utf8'); });
    child.on('error', (err) => { stderr += `\nspawn error: ${err.message}`; });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (onLine && pending.trim()) onLine(pending);
      resolve({ code, stdout, stderr, timedOut, durationMs: Date.now() - started });
    });
    if (input != null) child.stdin.write(input);
    child.stdin.end();
  });
}

export const clip = (s, n = 4000) => (s && s.length > n ? s.slice(0, n) + `\n... (${s.length - n} more chars)` : s ?? '');
