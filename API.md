# Context Lab API contract (UI <-> local bridge)

The UI works in three modes, chosen at load:

1. `local` - served by the local bridge (`node --no-warnings server/server.mjs`, default http://127.0.0.1:4318). Same-origin `/api/*`.
2. `connected` - UI hosted elsewhere, talking to a bridge on the user's machine at `http://127.0.0.1:4318`. Same API; every request sends header `X-Lab-Client: 1`.
3. `snapshot` - no bridge reachable. UI reads `./data/snapshot.json` (same shapes, read-only). Live agent runs and release approval are disabled; recorded traces stay fully browsable.

All JSON. All requests from the UI send `X-Lab-Client: 1`.

## GET /api/status
```json
{ "mode": "local", "app": "context-lab", "version": "0.3.0",
  "harnesses": [
    { "id": "claude-code", "name": "Claude Code", "vendor": "Anthropic", "installed": true, "signedIn": true,
      "version": "2.1.325", "signInHint": "claude  (then /login)",
      "models": [ { "combo": "claude-code:sonnet", "label": "Claude Sonnet", "intelligence": "Claude", "route": "subscription" },
                  { "combo": "claude-code:gpt-6.1-sol@bridge", "label": "GPT-6.1 Sol", "intelligence": "GPT", "route": "local-bridge" } ] }
  ],
  "mixMatrix": { "harnesses": ["Claude Code", ...], "intelligence": ["Claude", "GPT", "Grok", "Gemini / open models"],
                 "cells": [ { "harness": "Claude Code", "intelligence": "GPT", "how": "...", "allowed": "api-key|subscription|partner|local-only|not-allowed", "measured": true } ] } }
```
`route`: `subscription` (official client, user's own sign-in), `local-bridge` (author's personal gateway, not distributable), `api-key`.

## GET /api/context
```json
{ "artifacts": [ { "ref": "demo/metric/net-revenue", "kind": "metric", "title": "Net revenue",
                   "versions": [ { "version": "1.0.0", "status": "active", "body": "...", "changelog": null } ] } ],
  "releases": { "active": "1.0.0", "candidate": "1.1.0",
                "history": [ { "version": "1.0.0", "status": "active", "at": "...", "note": "..." } ] },
  "rendered": { "1.0.0": "# Context release ...markdown the agent sees...", "1.1.0": "..." } }
```

## GET /api/questions
`[ { "id": "q01", "text": "What is total net revenue across all time?", "golden": 469762.8 } ]`

## GET /api/runs
Newest first. `status` is `complete` or `running`.
```json
[ { "runId": "2026-11-15T19-40-00-000Z-matrix1", "status": "complete", "startedAt": "...", "finishedAt": "...",
    "combos": ["claude-code:haiku", ...], "versions": ["1.0.0", "1.1.0"], "done": 96, "total": 96,
    "cells": [ { "combo": "claude-code:haiku", "contextVersion": "1.0.0", "n": 12, "correct": 1, "accuracy": 8.3,
                 "errors": 0, "noAnswer": 0, "medianSeconds": 13.2, "medianInputTokens": 39000, "medianOutputTokens": 1300 } ] } ]
```

## GET /api/runs/:runId
`{ "manifest": {...}, "cells": [...], "results": [ Record ] }`

Record (one agent run on one question):
```json
{ "runId": "...", "combo": "claude-code:haiku", "harness": "claude-code", "model": "haiku", "via": null,
  "contextVersion": "1.0.0", "questionId": "q11", "question": "What is net revenue for customer C017?",
  "golden": 1538.16, "answer": 3077.37, "correct": false, "startedAt": "...", "durationMs": 13900,
  "finalText": "Net revenue for C017 is 3077.37 ... ANSWER: 3077.37",
  "steps": [ { "kind": "tool", "tool": "Bash", "input": "node q.mjs \"SELECT ...\"", "output": "[{...}]", "isError": false },
             { "kind": "text", "text": "..." } ],
  "usage": { "inputTokens": 38930, "outputTokens": 1439, "turns": 4 }, "error": null }
```

## POST /api/agent/run  (streamed)
Body: `{ "combo": "claude-code:sonnet", "contextVersion": "1.1.0", "question": "..." }` (question <= 500 chars).
Response: `text/event-stream`. Events:
- `event: start` `data: {"combo": "...", "contextVersion": "..."}`
- `event: step` `data: Step` (same shape as Record.steps items, streamed as they happen; a tool step may be re-sent with `output` filled, matched by `index`)
- `event: done` `data: {"finalText", "answer", "golden" (null if not a benchmark question), "correct" (null if not benchmark), "durationMs", "usage", "error"}`

## POST /api/release
Body: `{ "version": "1.1.0", "note": "Reviewed by ..." }` (note required, >= 8 chars).
- 200 `{ "releases": {...} }` when the gate passes.
- 409 `{ "error": "gate", "reasons": ["claude-code:haiku regressed on q03", ...], "evidenceRunId": "..." }`.
Gate: in the newest complete run containing both the active and candidate version, every combo must score at least as well on the candidate, with no question correct on active and wrong on candidate.
