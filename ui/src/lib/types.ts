import type { Combined, Consensus, Feedback, Impacts, Proposal } from './types-analytics';
export * from './types-analytics';

export type Mode = 'local' | 'connected' | 'snapshot';
export type Route = 'subscription' | 'local-bridge' | 'api-key';
export type Allowed = 'subscription' | 'api-key' | 'partner' | 'unverified' | 'not-allowed';

export interface HarnessModel {
  combo: string;
  label: string;
  intelligence: string;
  route: Route;
}

export interface Harness {
  id: string;
  name: string;
  vendor: string;
  installed: boolean;
  signedIn: boolean;
  version: string | null;
  signInHint: string;
  models: HarnessModel[];
  recordedOnly?: boolean;
}

export interface MixCell {
  harness: string;
  intelligence: string;
  allowed: Allowed;
  how: string;
}

export interface MixMatrix {
  harnesses: string[];
  intelligence: string[];
  rules: string[];
  cells: MixCell[];
}

export interface Status {
  mode: Mode;
  app: string;
  version: string;
  harnesses: Harness[];
  mixMatrix: MixMatrix;
}

export type VersionStatus = 'active' | 'pending_review' | 'superseded' | 'proposed';

export interface ArtifactVersion {
  version: string;
  status: VersionStatus;
  body: string;
  changelog: string[] | null;
  proposal?: Proposal | null;
}

export interface Artifact {
  ref: string;
  kind: string;
  title: string;
  versions: ArtifactVersion[];
}

export interface ReleaseHistoryItem {
  version: string;
  status: string;
  at: string;
  note: string;
  evidenceRunId?: string;
}

export interface Releases {
  active: string;
  candidate: string | null;
  history: ReleaseHistoryItem[];
}

export interface ContextPayload {
  artifacts: Artifact[];
  releases: Releases;
  rendered: Record<string, string>;
}

export interface Question {
  id: string;
  text: string;
  golden: number;
}

export interface Cell {
  combo: string;
  contextVersion: string;
  n: number;
  correct: number;
  accuracy: number;
  errors: number;
  noAnswer: number;
  medianSeconds: number | null;
  medianInputTokens: number | null;
  medianOutputTokens: number | null;
}

export type Variant = 'default' | 'review';

export interface RunSummary {
  runId: string;
  variant?: Variant;
  status: 'complete' | 'running';
  startedAt: string;
  finishedAt: string | null;
  combos: string[];
  versions: string[];
  done: number;
  total: number;
  cells: Cell[];
}

export interface Step {
  kind: 'tool' | 'text';
  tool?: string;
  input?: string;
  output?: string;
  text?: string;
  isError?: boolean;
  index?: number;
}

export interface Usage {
  inputTokens?: number | null;
  outputTokens?: number | null;
  turns?: number | null;
}

export interface RunRecord {
  runId: string;
  combo: string;
  harness: string;
  model: string;
  via: string | null;
  contextVersion: string;
  questionId: string;
  question: string;
  golden: number;
  answer: number | null;
  correct: boolean;
  startedAt: string;
  durationMs: number;
  finalText: string;
  steps: Step[];
  usage: Usage;
  error: string | null;
}

export interface RunDetail {
  manifest: { runId: string; startedAt: string };
  cells: Cell[];
  results: RunRecord[];
}

export interface Snapshot {
  generatedAt: string;
  status: Status;
  context: ContextPayload;
  questions: Question[];
  runs: RunSummary[];
  runDetails: Record<string, RunDetail>;
  feedback?: Feedback | null;
  feedbackReview?: Feedback | null;
  combined?: Combined | null;
  consensus?: Consensus | null;
  impacts?: Impacts | null;
}

export interface DonePayload {
  finalText: string;
  answer: number | null;
  golden: number | null;
  correct: boolean | null;
  questionId?: string | null;
  durationMs: number;
  usage: Usage;
  error: string | null;
  steps?: Step[];
}

/** One agent's attempt inside a chat turn. A compare turn holds several. */
export interface AgentRun {
  id: string;
  combo: string;
  contextVersion: string;
  status: 'streaming' | 'done' | 'error';
  steps: Step[];
  finalText: string;
  answer: number | null;
  golden: number | null;
  correct: boolean | null;
  durationMs: number;
  usage: Usage;
  error: string | null;
  startedAt: number;
  recorded?: { runId: string; at: string };
}

export type ChatMessage =
  | { id: string; role: 'user'; text: string }
  | { id: string; role: 'assistant'; runs: AgentRun[]; compare: boolean };

export interface Chat {
  id: string;
  title: string;
  createdAt: number;
  messages: ChatMessage[];
}
