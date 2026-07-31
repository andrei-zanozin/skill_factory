---
description: Send selected findings from the latest deep-review report to Bitbucket
agent: send-comments
---

Send findings `$ARGUMENTS` from the most recent completed deep-review report in this OpenCode session as Bitbucket pull-request inline comments.

Treat `$ARGUMENTS` as one comma-separated list of unique positive integers. Allow optional whitespace around commas, as in `1, 3`. Reject missing values, duplicate numbers, non-integers, numbers less than one, empty items and trailing commas. On invalid input, stop and show this usage:

`/send-comments <comment-number>[, <comment-number>...]`

This command is valid only immediately after a complete deep-review report in the same session. Do not start or repeat a review. Stop without calling a posting integration when the report is absent, incomplete, stale relative to a newer report in the session or does not contain every requested number.

Use the latest report as the only source of comment content and reviewed revisions. For every selected finding:

1. Copy its complete finding block exactly as rendered in the report.
2. Remove only the `- Location:` line. Preserve the heading, problem and impact, suggested fix, evidence, Markdown and spacing exactly. Do not summarize, rewrite or add severity, attribution or metadata.
3. Parse the removed location into its repository-relative file path and numeric starting and ending lines. Stop if the location has no numeric line or cannot be parsed unambiguously.

Read the report's review target, base revision and head revision. Resolve the Git remote that owns the reviewed branch using only validated read-only Git operations. Stop when the source branch or owning remote is ambiguous. Do not check out, switch, fetch, reset or modify a branch.

Call `bitbucket-send-comments` exactly once with the complete selected batch, the owning remote URL, normalized source branch and full reviewed head revision. Do not use shell commands, generic HTTP tools or another integration to post comments.

The Bitbucket tool must preflight the complete batch before posting. Relay a blocked result without retrying through another mechanism. For a completed or partial result, report the status and Bitbucket link for every requested number. Never claim that a comment was posted when the tool did not return a created comment identifier or an `already-posted` result.
