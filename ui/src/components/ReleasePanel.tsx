// Release step: active vs candidate, the evaluation gate, a required review note, and history.
import { useState } from 'react';
import { ShieldCheck, ShieldAlert } from 'lucide-react';
import { useRunDetail, useStore } from '../lib/store';
import { approveRelease } from '../lib/api';
import { computeGate, pickGateRun } from '../lib/gate';
import { fmtDate } from '../lib/format';
import { Badge, Button, Card, ErrorNote, Spinner, cx } from './ui';
export function ReleasePanel() {
  const { context, runs, mode, refreshContext } = useStore();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string[] | null>(null);
  const rel = context!.releases;
  const gateRun = rel.candidate ? pickGateRun(runs, rel.active, rel.candidate) : null;
  const { detail, loading } = useRunDetail(gateRun?.runId);
  const gate = rel.candidate ? computeGate(gateRun, detail ?? null, rel.active, rel.candidate) : null;
  const live = mode !== 'snapshot';

  const approve = async () => {
    if (!rel.candidate) return;
    setBusy(true); setErr(null);
    try {
      const res = await approveRelease(rel.candidate, note.trim());
      if (res.releases) { setNote(''); await refreshContext(); } else setErr(res.reasons?.length ? res.reasons : [res.error ?? 'Release failed']);
    } catch (e) {
      setErr([(e as Error).message]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="p-5">
      <p className="text-[13px] font-semibold text-ink">Release</p>
      <div className="mt-3 space-y-1.5 text-[13px]">
        <p className="flex justify-between gap-2"><span className="text-muted">Active</span><span className="font-medium text-ink">Net revenue {rel.active}</span></p>
        <p className="flex justify-between gap-2"><span className="text-muted">Candidate</span><span className="font-medium text-ink">{rel.candidate ? `Net revenue ${rel.candidate}` : 'None pending'}</span></p>
      </div>
      {rel.candidate && gate && (
        <div className={cx('mt-4 rounded-xl px-3.5 py-3 text-[13px]', loading ? 'bg-hover text-muted' : gate.ok ? 'bg-pass-soft text-pass' : 'bg-warn-soft text-warn')}>
          {loading ? <span className="flex items-center gap-2"><Spinner /> Checking the gate</span> : (
            <>
              <p className="flex items-center gap-2 font-medium">
                {gate.ok ? <ShieldCheck className="h-4 w-4" /> : <ShieldAlert className="h-4 w-4" />}
                {gate.ok ? `No regressions across ${gate.agents} agents` : 'Gate not passed'}
              </p>
              {!gate.ok && <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-[12.5px]">{gate.reasons.slice(0, 6).map((r) => <li key={r}>{r}</li>)}</ul>}
              {gate.evidenceRunId && <p className="mt-1 text-[12px] opacity-80">Evidence: run {gate.evidenceRunId.replace(/^.*Z-/, '')}</p>}
            </>
          )}
        </div>
      )}
      {rel.candidate && (
        <div className="mt-4 space-y-2.5">
          <label className="block text-[12.5px] font-medium text-ink-2" htmlFor="review-note">Review note</label>
          <textarea id="review-note" value={note} onChange={(e) => setNote(e.target.value)} rows={3} disabled={!live}
            placeholder={live ? 'What you checked, and who signed off' : 'Approval needs the local bridge'}
            className="w-full resize-none rounded-xl border border-line bg-surface px-3 py-2 text-[13.5px] text-ink outline-none placeholder:text-faint focus:border-line-strong disabled:opacity-60" />
          <Button variant="primary" className="w-full" disabled={!live || busy || note.trim().length < 8 || !gate?.ok} onClick={approve}>
            {busy ? <Spinner /> : `Approve and release ${rel.candidate}`}
          </Button>
          {!live && <p className="text-[12px] text-muted">Recorded mode is read-only.</p>}
          {live && note.trim().length > 0 && note.trim().length < 8 && <p className="text-[12px] text-muted">A note of at least 8 characters is required.</p>}
          {err && <ErrorNote>{err.join('. ')}</ErrorNote>}
        </div>
      )}
      <div className="mt-5 border-t border-line pt-4">
        <p className="mb-2 text-[12px] font-medium text-faint">History</p>
        <ul className="space-y-2.5">
          {[...rel.history].reverse().map((h) => (
            <li key={h.version + h.at} className="text-[12.5px]">
              <p className="flex items-center gap-2"><span className="font-medium text-ink">{h.version}</span><Badge tone={h.status === 'active' ? 'pass' : 'neutral'}>{h.status}</Badge><span className="ml-auto text-muted">{fmtDate(h.at)}</span></p>
              <p className="mt-0.5 text-muted">{h.note}</p>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}
