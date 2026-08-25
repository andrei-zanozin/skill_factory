---
description: Send selected review findings from this session to Bitbucket
agent: send-comments
---

Send findings `$ARGUMENTS` from the most recent completed deep-review report or its later review discussion in this OpenCode session as Bitbucket pull-request comments.

Treat `$ARGUMENTS` as one comma-separated list of unique positive integers. Allow optional whitespace around commas, as in `1, 3`. Reject missing values, duplicate numbers, non-integers, numbers less than one, empty items and trailing commas. On invalid input, stop and show this usage:

`/send-comments <comment-number>[, <comment-number>...]`

Find the latest completed deep-review report in the session. Do not start or repeat a review. Use that report as the sole source of the review target, base revision and head revision. Stop without calling a posting integration when the report is absent or incomplete.

For every selected number, use its most recent complete finding block from that report or from later review checks and discussion in the same session. Report an incomplete or malformed selected finding as skipped without posting it.

1. Copy the complete finding block exactly as rendered and pass its enclosing or associated `Critical`, `Major` or `Minor` severity separately.
2. Extract every explicit repository path from its `Location:` line, in order, with lines only when stated; mark pull-request-wide scope only when stated. Never invent or discard locations.
3. Pass the exact block and all extracted locations. The tool replaces the numbered heading with `### <severity>: <title>`, tries every changed location with lines for inline placement, uses a general comment when none can be anchored, and skips a finding whose format or locations are invalid.

Resolve the Git remote that owns the report's reviewed branch using only validated read-only Git operations. Stop when the source branch or owning remote is ambiguous. Do not check out, switch, fetch, reset or modify a branch.

If any publishable finding remains, call `bitbucket-send-comments` exactly once with that batch, the owning remote URL, normalized source branch and full reviewed head revision. Do not use shell commands, generic HTTP tools or another integration to post comments.

The tool preflights every publishable finding before writing. Relay global blocks without another posting mechanism; otherwise report each requested number's placement, placement reason, status and Bitbucket link. Never claim success without a created comment identifier or an `already-posted` result.
