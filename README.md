# Context Lab

Register a context release once, run it through any agent harness with any model, and see what breaks before you ship it.

**Live demo (recorded runs, every trace browsable):** https://ubhayaab.github.io/context-lab/

Built as an independent extension of the ideas in Atlan's open [AI Registry](https://github.com/atlanai/ai-registry) and Trident launch: context artifacts with versions and review, agents observed on real tasks, and agent feedback feeding the next release. It is not Atlan Trident and uses no Atlan code or data. All data is synthetic.

## What is measured (2026-11-16, author's machine)

12 analytics questions over a synthetic commerce database, golden answers computed in SQL from finance's definition. Each agent runs in an isolated folder with a read-only SQL tool and the context release as CONTEXT.md. Every run is the vendor's own unmodified CLI, signed in with the author's own plan.

| Agent (harness x model) | Context 1.0.0 (wrong definition) | Context 1.1.0 (reviewed fix) | Median time on 1.1.0 | Median input tokens on 1.1.0 |
| --- | --- | --- | --- | --- |
| Claude Haiku in Claude Code | 0/12 | 12/12 | 10.4 s | 27.9k |
| Claude Sonnet in Claude Code | 0/12 | 12/12 | 10.3 s | 24.9k |
| GPT-6.1 Sol in Codex | 0/12 | 12/12 | 21.0 s | 82.4k |
| GPT-6.1 Sol in Claude Code (local bridge) | 0/12 | 12/12 | 18.7 s | 18.9k |

What it shows:
- The context release decided correctness for every agent. No model or harness rescued a wrong definition.
- Harness choice changed cost, not correctness: the same GPT model read about 4.4x fewer input tokens inside Claude Code than inside Codex. Caveats: Codex also loads the author's global AGENTS.md, and effort settings differ (Codex medium, bridge maps Claude Code's default).
- Agents can tell you what is wrong with your context. Unprompted, the Claude agents named 3 of the 4 defects the reviewed fix corrected (test accounts in 23 of 24 answers, refunds added in 20, refund date attribution in 4). The GPT agents answered without comment. Asked explicitly to flag anything wrong first (36 more runs, `--variant review`), GPT did raise issues, less consistently: test accounts in 4 of 12 answers in each harness, against 11 of 12 for Claude Haiku. Every agent still followed the definition for its answer, as instructed. The method is keyword matching, so a plain description can count as a flag; treat the counts as upper bounds. See "Agent feedback" in the app and `eval/feedback.mjs`.

Not measured yet: Grok 4.7 in Grok Build (adapter built; the author's free Grok allowance ran out), OpenCode, API-key routes.

## Mix and match: what is allowed

| | Claude | GPT | Grok | Others |
| --- | --- | --- | --- | --- |
| Claude Code | your Claude plan | API key via gateway | API key via gateway | API key via gateway |
| Codex | API key via gateway | your ChatGPT plan | API key | API key |
| OpenCode | API key | ChatGPT plan (approved partner) | API key | API key |
| Your own harness | API key | API key (or Sign in with ChatGPT once approved) | API key | API key |

- Anthropic: a Claude plan only powers Anthropic's own apps, including the unmodified Claude Code binary. Third-party apps may not offer Claude.ai login or route requests through plan credentials. [Source](https://code.claude.com/docs/en/legal-and-compliance)
- OpenAI: Sign in with ChatGPT lets approved third-party apps use a user's plan; client IDs go to selected partners from a waitlist. [Source](https://developers.openai.com/siwc/request-client-id)

So this app never touches credentials. The local bridge drives the official CLIs you are already signed in to, on your machine.

## Run it

Requires Node 24+ and at least one of: Claude Code, Codex, Grok Build, signed in.

```sh
npm run seed          # build the synthetic database
npm test              # 16 checks: scoring, determinism, feedback, server guards
npm run serve         # local bridge + UI on http://127.0.0.1:4318
npm run run -- --combos claude-code:haiku,codex:gpt-6.1-sol --label mine   # your own matrix
```

The hosted copy at https://ubhayaab.github.io/context-lab/ shows the recorded runs and never contacts your machine on its own. To drive your own agents from it, start the bridge with `LAB_ALLOWED_ORIGINS=https://ubhayaab.github.io npm run serve` and open the page with `?connect=1`. The bridge binds 127.0.0.1 only, refuses other origins, and requires a custom header so cross-site pages cannot trigger runs.

## Layout

- `data/seed.mjs` deterministic dataset (seed 42) - `eval/` questions, golden answers, scoring, feedback analysis
- `context/versions.mjs` the context artifacts and the two metric releases
- `harness/` isolated workspaces, one adapter per harness, matrix runner - `server/` local bridge, release gate, snapshot export
- `ui/` the web app - `runs/` recorded runs with full traces

## Limits

Synthetic data, one domain, 12 questions: a demonstration of the loop, not a general benchmark. The feedback analysis is keyword based. Runs were made on consumer plans; token counts include each harness's own system prompt.
