// Types for cross-run analytics: agent feedback, merged matrix, agreement, business impact, AI drafts.
import type { Cell, Variant } from './types';

export interface FeedbackQuote {
  combo: string;
  questionId: string;
  text: string;
}

export interface FeedbackTopic {
  id: string;
  label: string;
  fix: string;
  mentions: number;
  agentsRaising: string[];
  byCombo: Record<string, number>;
  quotes: FeedbackQuote[];
}

export interface Feedback {
  runId: string;
  variant: Variant;
  contextVersion: string;
  fixVersion: string | null;
  answersAnalyzed: number;
  agents: string[];
  topics: FeedbackTopic[];
  silentAgents: string[];
  fixesAnticipated: number;
  fixesTotal: number;
  method: string;
}

/** An AI-drafted version: who drafted it, from what, and what it was never shown. */
export interface Proposal {
  proposedBy: string;
  basedOn: string;
  createdAt: string;
  assumptions: string[];
  evidence: { quotes: number; disagreements: number; agreement: string };
  evidenceRunIds: string[];
  sawGoldenAnswers: boolean;
  sawHumanFix: boolean;
}

/** All unprompted runs merged: newest record wins per agent, version and question. */
export interface Combined {
  cells: Cell[];
  source: Record<string, string>;
  versions: string[];
  combos: string[];
}

export interface ConsensusGroup {
  answer: number | null;
  combos: string[];
}

export interface ConsensusQuestion {
  questionId: string;
  question: string;
  golden: number;
  agree: boolean;
  groups: ConsensusGroup[];
  majority: number | null;
  majorityShare: number;
  dissenters: string[];
}

export interface ConsensusVersion {
  contextVersion: string;
  agreed: number;
  total: number;
  agents: string[];
  questions: ConsensusQuestion[];
}

export type Consensus = Record<string, ConsensusVersion>;

export interface ImpactRow {
  questionId: string;
  question: string;
  before: number | null;
  after: number | null;
  delta: number | null;
  pct: number | null;
  beforeAgreed: boolean;
  afterAgreed: boolean;
}

export interface Impact {
  fromVersion: string;
  toVersion: string;
  rows: ImpactRow[];
  moved: number;
  total: number;
  /** Rows where one side had no agent majority (an even split), so no delta exists. */
  unresolved?: number;
  biggest: ImpactRow | null;
}

export type Impacts = Record<string, Impact>;

export interface Analytics {
  combined: Combined | null;
  consensus: Consensus | null;
  impacts: Impacts | null;
}
