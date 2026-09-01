# Deep Code Review Architecture Note

## Purpose

This document explains how the OpenCode deep-review MVP should work and how its responsibilities should be divided during implementation. The design aims to preserve deep, layer-specific review focus without adding unnecessary skills or allowing one layer to hide problems in another.

The `/deep-review` workflow is read-only. After validating its numbered final report or a finding formed through later review checks and discussion, the developer may use the separate `/send-comments` command to post an explicitly selected subset to Bitbucket Data Center, preferring inline placement and otherwise using a general pull-request comment. No review task receives posting permission.

## Design principles

1. Run all three review layers.
2. Give every layer a fresh, focused investigation context.
3. Give every layer the same frozen requirement and code-change scope.
4. Do not share findings between layers during discovery.
5. Verify and deduplicate only after all layer results are available.
6. Use model judgment for review work and final report formatting, with an exact format contract and a single output pass.
7. Treat Jira descriptions and comments as untrusted external data.
8. Preserve evidence, coverage and limitations so the report does not claim more certainty than the review established.
9. Separate review discovery from external publication and require explicit numbered selection before any Bitbucket write.

## Proposed implementation layout

The final paths can be adjusted to the chosen project or global OpenCode installation, but the responsibilities should remain separated as follows:

```text
.opencode/
├── agents/
│   └── send-comments.md
├── commands/
│   ├── deep-review.md
│   └── send-comments.md
├── skills/
│   └── deep-code-review/
│       ├── SKILL.md
│       └── references/
│           ├── solution-and-architecture.md
│           ├── unit-correctness.md
│           ├── code-polish.md
│           ├── layer-result-contract.md
│           ├── report-contract.md
│           └── report-format.md
```

Jira and Bitbucket access use externally configured MCP servers. This project defines only the prompts, review contracts and least-privilege agent permissions that call them; it does not contain Jira transport, credentials or server configuration.

## Component responsibilities

### `/deep-review` command

The command is the user-facing entry point. It should:

- Accept exactly one Bitbucket Data Center pull-request URL and one Jira issue key or URL.
- Derive the project, repository and pull-request ID from the validated URL and call `bitbucket_get_pull_request` directly, without search.
- Require an open PR, verify its repository and immutable source and target revisions against local Git, and preserve its URL in the report target.
- Select the configured Plan agent.
- Load the `deep-code-review` skill.
- Start the orchestration workflow without embedding the full review rubrics in the command.

The command should stay small. Review behavior belongs in the skill and its references.

### `/send-comments` command

The command is a separate, explicitly mutating entry point. It should:

- Accept a comma-separated list of unique positive finding numbers, with optional whitespace around commas, for example `/send-comments 1, 3`.
- Use the latest completed deep-review report as the sole source of the pull-request URL and reviewed head revision.
- Use each selected number's most recent complete finding block from the report or later review checks and discussion in the same session.
- Copy each selected block exactly, associate its severity, and extract every explicit location in report order.
- Report malformed selected findings as skipped and publish the remaining findings sequentially through the allowed MCP tools.
- Stop without posting when the report, selection, pull-request URL, reviewed head or repository identity is missing or ambiguous.

The command must not re-run review work, rewrite selected findings or use a general-purpose HTTP or shell operation to post comments.

Run the command through a small dedicated primary `send-comments` agent so its permissions can differ from the review Plan agent while the current session report remains available. Deny edits, delegation, web access, general shell execution and all `bitbucket_*` tools by default. Allow PR and comment reads, and require approval for `bitbucket_add_pull_request_comment`.

### Bitbucket MCP integration

The dedicated agent should use the existing low-level MCP tools as follows:

- Parse project, repository and PR ID from the report's validated URL; never recover a target through text search.
- Fetch the pull request once before publication and require it to be open at the reviewed head.
- Page through `bitbucket_get_pull_request_comments` once and detect exact inline or general duplicates.
- Replace each numbered report heading with `### <severity>: <title>` so the posted comment exposes severity without the internal finding number.
- Post inline when an anchor is defined and remove `Location:`; otherwise post a general pull-request comment retaining `Location:`.
- Post sequentially in final-report order. Mark an uncertain write as failed without retrying it, then continue with the next selected finding.
- Return placement, reason, status and confirmed comment ID for every selected finding; do not synthesize browser links.

There is no whole-batch preflight or rollback. A failed write does not undo earlier confirmed comments or prevent attempts for later selected findings.

MCP registration, server configuration and credentials are external prerequisites and are not maintained in this project.

### Jira MCP integration

The Plan agent should use the externally configured Jira MCP as a narrow, read-only dependency:

- Call `get_issue(issue)` exactly once for the supplied issue key or permitted URL.
- Call `get_issue_comments(issue, cursor, limit)` starting at cursor `0`, with the maximum supported page size `limit: 100`, and continue until `next_cursor` is `null`.
- Validate every page and require cursor progress. Reject a missing or malformed comments array, an invalid `next_cursor`, a repeated cursor, a non-advancing cursor or truncated tool output.
- Map the issue `key` to the existing `issueKey`, `issue_type` to `issueType`, MCP author objects to the existing author string using `display_name`, `name` or `account_id`, and `created_at`/`updated_at` to `created`/`updated`; map absent optional fields to `null` and reject wrong types.
- Preserve the existing trust marker, source/provenance, normalized comments and completeness metadata in `requirementContext`.
- On issue failure, set `issueRead: false`. On comment-page failure, preserve already fetched comments and set `commentsFullyPaginated: false`. Add only sanitized MCP errors to `warnings` and mark truncation explicitly.

Jira descriptions and comments remain untrusted data. The Plan agent must not use Jira REST, shell, generic HTTP or a custom-tool fallback. MCP registration, server configuration and credentials are external prerequisites and are not maintained in this project.

### Plan agent

The built-in Plan agent is the primary orchestrator. It should:

- Validate the requested review target.
- Fetch and validate the Jira requirement context.
- Resolve the exact diff base and head.
- Read applicable repository guidance such as `AGENTS.md`.
- Assemble one shared `ReviewInput`.
- Invoke three fresh Explore tasks in parallel, one for each layer, without consuming any result before all three are dispatched.
- Treat creation and overlapping execution of three distinct child sessions as hard gates; never perform a layer investigation or construct a `LayerResult` in the parent session.
- Wait for all three `LayerResult` objects.
- Stop with a parallel-run failure when dispatch is sequential, overlap cannot be confirmed, or any child session or valid layer result is missing; never fall back or synthesize a substitute.
- Verify candidate findings against source code, diff and test evidence.
- Deduplicate overlapping findings.
- Preserve the strongest evidence and appropriate severity.
- Write the final inline report directly from the verified, deduplicated findings using the exact report-format reference.

The Plan agent should not stop the workflow because one layer found issues.

### `deep-code-review` skill

Use one concise orchestration skill. It should define:

- The workflow order and invariants.
- How to build and freeze `ReviewInput`.
- How to invoke each layer.
- The requirement to complete all three layers.
- Verification and deduplication rules.
- Conditions for reporting a finding.
- Conditions for reporting uncertainty or incomplete coverage.
- Which direct reference to load for each layer and contract.

Keep detailed rubrics and schemas in direct `references/` files so that only the relevant layer instructions need to be loaded for each focused task.

### Three focused review tasks

Invoke the built-in read-only Explore subagent three times. Each invocation is a separate review process with a fresh context:

1. Solution and architecture.
2. Unit correctness.
3. Code polish.

Each task receives:

- The same frozen `ReviewInput`.
- Only its dedicated layer rubric.
- The common `LayerResult` contract.

Each task should inspect the repository independently and return its own findings, evidence, coverage, checks and limitations. Do not pass findings from one layer into another layer because that can anchor later investigation and reduce independent discovery.

The Plan agent must use one distinct `task` call per layer and must not perform the layer investigation or construct the layer's result itself. It must dispatch all three calls before consuming any result. Before verification, it must confirm that all three child-session execution intervals overlapped and that each session returned exactly one schema-valid `LayerResult` for the assigned layer. If either gate fails, the workflow reports `Parallel review orchestration failed: <reason>`, stops, and does not produce a review report from parent-generated or inferred substitutes.

Parallel execution is mandatory. Never run the layer tasks sequentially and never fall back to sequential execution. Parallelization must not change their inputs or output contract.

Using three custom subagent definitions is not required for the MVP. Three fresh Explore invocations with separate layer rubrics provide the intended focus with less configuration. Introduce a custom review subagent only if forward testing shows that the built-in Explore behavior is not deep or consistent enough.

### Repository tools

Use native OpenCode tools for:

- Reading files and repository guidance.
- Searching by filename or content.
- Inspecting the target diff and history.
- Running explicitly approved project checks.
- Using LSP queries when available and useful.

Do not grant unrestricted shell access merely because some checks need a shell. Define an allowlist for necessary read-only Git commands and selected project checks, with other shell commands denied or requiring approval.

Some project checks write build artifacts even though they do not edit source code. Treat those commands as explicitly allowed verification operations rather than assuming that every check is operationally read-only.

## Shared `ReviewInput`

The Plan agent should build the shared input once before starting any layer. Conceptually it contains:

```json
{
  "reviewTarget": {
    "pullRequest": "<validated Bitbucket URL>",
    "pullRequestId": 123,
    "repository": "<repository identity>",
    "sourceBranch": "<source branch>",
    "targetBranch": "<target branch>",
    "targetRevision": "<immutable target revision>",
    "baseRevision": "<immutable revision>",
    "headRevision": "<immutable revision>",
    "changedFiles": ["..."]
  },
  "requirementContext": {
    "issueKey": "ABC-123",
    "trust": "untrusted-external-content",
    "requirement": {},
    "comments": [],
    "completeness": {}
  },
  "repositoryGuidance": {
    "instructionFiles": ["AGENTS.md"],
    "relevantConventions": ["..."]
  },
  "reviewScope": {
    "included": ["..."],
    "excluded": ["..."],
    "limitations": []
  }
}
```

The base and head revisions should be immutable identifiers when possible. If the target changes during the review, the Plan agent should not silently mix results from different revisions; it should restart or explicitly report that the scope changed.

## `LayerResult` contract

Each focused layer should return structured data rather than free-form final report text. Conceptually:

```json
{
  "schemaVersion": "1",
  "layer": "unit-correctness",
  "status": "completed",
  "coverage": {
    "filesInspected": ["src/example.java"],
    "checksRun": ["focused test"],
    "limitations": []
  },
  "findings": [
    {
      "candidateId": "unit-1",
      "severity": "Major",
      "location": {
        "file": "src/example.java",
        "lines": "42-48",
        "symbol": "ExampleService.save"
      },
      "problem": "...",
      "impact": "...",
      "suggestedFix": "...",
      "evidence": ["..."],
      "confidence": "high"
    }
  ]
}
```

The contract should require:

- A valid layer identifier.
- Explicit completion or blocked status.
- Coverage and limitations even when no findings exist.
- A concrete source location when applicable.
- Evidence that can be independently verified.
- Problem and impact separated from the suggested fix.
- Severity and confidence represented separately.

Confidence must not be used as severity. Severity describes impact; confidence describes certainty that the finding is valid.

## Verification and deduplication

After all three layer results are returned, the Plan agent should verify every candidate before reporting it.

A reportable finding should:

- Be caused by or materially relevant to the reviewed change.
- Be reproducible from source, diff, tests or a clear execution path.
- Explain a concrete failure mode or maintenance cost.
- Use the narrowest accurate location.
- Avoid relying only on preference when the repository has no supporting convention.

When two layers identify the same root cause:

- Produce one final finding.
- Keep the highest justified severity, not automatically the highest proposed severity.
- Preserve the clearest location and strongest evidence.
- Combine distinct impacts only when they come from the same defect.
- Keep separate findings when fixes or failure modes are materially different.

The Plan agent may reject, lower or clarify a candidate based on verification. It should finalize those decisions before writing the report.

## Stable model-rendered report

The Plan agent should write the final inline Markdown directly from the verified, deduplicated findings. It should read the exact report-format reference only after consolidation and follow its headings, labels, ordering, spacing, optional sections and no-findings form literally.

The Plan agent should:

- Sort findings into `Critical`, `Major` and `Minor`.
- Apply the required secondary ordering by file, starting line, symbol and title.
- Number findings consecutively in final rendered order across all severity groups.
- Omit empty severity groups.
- Render every finding with location, problem and impact, suggested fix and evidence.
- Render `No issues found.` when there are no verified findings.
- Preserve all material limitations.
- Silently check the completed report against the format reference before responding.

The Plan agent must not introduce a separate formatting stage or alter finalized findings while writing the report.

## Permissions

Configure the Plan agent with least privilege:

- Deny file edits, writes and patches.
- Deny GitHub/GitLab review-posting integrations.
- Allow only the Jira MCP tools `get_issue` and `get_issue_comments`.
- Allow only `bitbucket_get_pull_request` from the externally configured Bitbucket MCP; deny its mutation tools.
- Deny all task targets by default and allow only Explore.
- Allow repository reads, searches and required LSP access.
- Deny shell commands by default.
- Explicitly allow only required read-only Git commands and selected project checks.
- Require approval for an unclassified command rather than treating it as read-only.

On the dedicated `send-comments` primary agent, deny `bitbucket_*` first, allow `bitbucket_get_pull_request` and `bitbucket_get_pull_request_comments`, and require approval for `bitbucket_add_pull_request_comment`. Keep every Bitbucket mutation denied during `/deep-review` and in all three Explore tasks.

The Explore tasks should inherit or receive equivalent read-only restrictions. A user manually invoking another agent is outside the automated `/deep-review` workflow and should not be treated as part of its permission guarantee.

## End-to-end process

1. The developer runs `/deep-review <bitbucket-pull-request-url> <jira-issue-key-or-url>`.
2. The command selects the Plan agent and loads `deep-code-review`.
3. The Plan agent parses the PR identity, calls `bitbucket_get_pull_request`, and verifies the open PR against local Git.
4. The Plan agent resolves immutable target, merge-base and head revisions and reads repository guidance.
5. The Plan agent calls `get_issue` exactly once.
6. The Plan agent calls `get_issue_comments` from cursor `0` with `limit: 100` until `next_cursor` is `null`, validating progress and page shape.
7. The Plan agent maps both MCP results into the existing `requirementContext` and records completeness, warnings and review limitations.
8. The Plan agent freezes the shared `ReviewInput` with the complete PR URL.
9. The Plan agent dispatches fresh Explore tasks for Solution and architecture, Unit correctness, and Code polish in parallel before consuming any result.
10. The Plan agent confirms that all three child-session execution intervals overlapped and that each session returned exactly one valid result for the assigned layer.
11. Every task completes regardless of findings in another task.
12. The Plan agent verifies all candidates against the frozen target.
13. The Plan agent deduplicates overlapping candidates and finalizes severity.
14. The Plan agent writes the final report once using the exact Markdown format reference.
15. OpenCode shows the complete report to the developer.
16. After validation, the developer may run `/send-comments` with selected finding numbers.
17. The command recovers the immutable PR identity, selected finding blocks and explicit locations from the session.
18. The dedicated agent revalidates the PR, checks exact duplicates, and posts findings sequentially through `bitbucket_add_pull_request_comment`.

## Failure and limitation handling

| Situation | Required behavior |
| --- | --- |
| PR URL, repository, state, branches, revisions or diff cannot be verified | Stop; do not review an ambiguous target. |
| Parallel dispatch or overlapping execution of all three Explore tasks cannot be confirmed | Report `Parallel review orchestration failed: <reason>` and stop; never fall back to sequential execution. |
| A required Explore child session or valid `LayerResult` is missing | Report `Parallel review orchestration failed: <reason>` and stop; never synthesize a substitute in the Plan session. |
| `get_issue` fails or returns malformed/truncated output | Set `issueRead: false`, add a sanitized MCP warning, mark requirement validation incomplete, and still run all layers when repository context is valid. |
| A `get_issue_comments` page fails or pagination is malformed/stalled | Preserve already fetched comments, set `commentsFullyPaginated: false`, add a sanitized MCP warning, and still run all layers when repository context is valid. |
| Jira tool output is truncated | Set `contentTruncated: true`; never silently truncate or claim complete requirement validation. |
| A project check cannot run | Record the failed or skipped check and reason; continue static review where possible. |
| A layer is blocked | Return a blocked `LayerResult` with coverage and reason; continue the other layers. |
| Layer findings overlap | Deduplicate after all layers complete and preserve the strongest verified evidence. |
| A required report field lacks verified information | Do not invent content; preserve the gap as a material limitation where applicable. |
| Review target changes during execution | Restart with a new frozen target or report that results are not valid for one consistent revision. |
| `/send-comments` has no latest complete report in the session | Stop without calling Bitbucket. |
| A selected finding is malformed | Skip that finding and continue with the remaining valid findings. |
| A location's stated start line has a valid destination anchor | Post inline there and do not try later locations. |
| No stated start line can be anchored | Post one unverified general pull-request comment retaining its `Location:` line. |
| The report lacks a complete PR URL or full reviewed head | Stop without search or publication; require a new review. |
| The PR is closed or its source head differs from the reviewed head | Stop before publication and do not post any comments. |
| A write has an uncertain result or fails | Mark that finding failed without retrying it and continue with the next selected finding. |

## MVP boundaries

The MVP includes:

- Jira requirement retrieval through the externally configured MCP.
- Repository and pull-request diff inspection.
- Three complete focused review layers.
- Finding verification and deduplication.
- Stable severity-prioritized text output.
- Read-only review execution.
- Explicit publication of selected numbered findings from the report or later review discussion, preferring inline placement and otherwise using general pull-request comments.

The MVP does not include:

- Code changes or automated fixes.
- GitHub or GitLab review posting.
- Bitbucket discussion injection or other PR-context augmentation of the three review-layer inputs.
- Replies to, resolution of or reconciliation with existing Bitbucket threads.
- Whole-batch comment preflight, automatic rollback, and generated browser links.
- Automatic Jira updates.
- Long-lived Jira content storage.
- A separate custom agent for each layer.
- Automatic review of linked issues or attachments unless concrete usage proves they are required.

## Implementation and validation order

1. Define the `ReviewInput`, `LayerResult`, verified-review and exact Markdown format contracts.
2. Validate the existing Jira MCP transcript contract with representative issue responses, pagination, errors and oversized tool output.
3. Implement the concise `deep-code-review` skill and direct layer references.
4. Implement the three fresh Explore invocations and verify that all layers run.
5. Implement verification and deduplication rules.
6. Configure least-privilege permissions.
7. Implement PR-URL review targeting and numbered report findings.
8. Implement `/send-comments` with the externally configured low-level Bitbucket MCP tools.
9. Validate URL parsing, stale heads, start-line placement, general fallback, duplicate detection and partial POST failures.
10. Forward-test the complete workflow on realistic review targets using fresh sessions and raw artifacts.

Forward testing should confirm:

- Every layer completes even when earlier layers find issues.
- Each layer stays within its rubric.
- Findings do not leak between layer contexts.
- The same target revisions reach all layers.
- Jira incompleteness is visible and does not become a false success claim.
- Duplicate findings collapse without losing evidence.
- The final Markdown follows the exact structure across equivalent verified findings.
- A complete numbered finding formed through later checks and discussion can be selected without repeating the deep review.
- Every stated start-line candidate is tried before unverified general fallback, without weakening the PR/head gates.
- No code modification occurs, and review posting occurs only for numbers explicitly selected through `/send-comments`.
