---
description: Deep-review a Bitbucket pull request against a Jira requirement
agent: review
---

Execute a deep code review now.

This is an execution request, not a request to write a plan. Complete the review without editing files, changing Git state, or posting comments. Do not ask for confirmation and do not stop after describing the steps.

Review the Bitbucket pull request in `$1` against the Jira requirement in `$2`.

Accept exactly two whitespace-separated arguments:

- `$1`: the Bitbucket pull-request URL.
- `$2`: the Jira issue key or URL.

With any other argument count, stop and show:

`/deep-review <bitbucket-pull-request-url> <jira-issue-key-or-url>`

Load the `deep-code-review` skill and follow it completely. It defines the Bitbucket validation, Jira MCP retrieval and normalization, immutable review scope, three-layer parallel orchestration, verification gates, and final report format. Use only the externally configured read-only MCP tools allowed by that skill; never use Jira REST, generic HTTP, or custom-tool fallbacks.

Return the completed final review report only. If a required safety or orchestration gate fails, report that failure instead of inventing review results.
