---
description: Send selected review findings from this session to Bitbucket
agent: send-comments
---

Send findings `$ARGUMENTS` from the latest completed deep-review report or its later review discussion in this OpenCode session as Bitbucket pull-request comments.

Treat `$ARGUMENTS` as one comma-separated list of unique positive integers. Allow optional whitespace around commas, as in `1, 3`. Reject missing values, duplicate numbers, non-integers, numbers less than one, empty items and trailing commas. On invalid input, stop and show this usage:

`/send-comments <comment-number>[, <comment-number>...]`

Find the latest completed deep-review report in the session. Do not start or repeat a review. Use that report as the sole source of the Bitbucket pull-request URL and reviewed head revision. Stop without calling Bitbucket when the report is absent, incomplete, lacks a full pull-request URL or does not contain a full reviewed head revision. Do not recover an older target through search.

For every selected number, use its most recent complete finding block from that report or from later review checks and discussion in the same session. Report an incomplete or malformed selected finding as skipped without posting it. Keep the exact finding title and body, and use its associated `Critical`, `Major` or `Minor` severity.

Extract every explicit repository path from `Location:` in report order and retain stated line ranges without inventing locations. Follow the dedicated agent's MCP publication sequence: verify the immutable pull request, detect exact duplicates, post inline when an anchor is defined, and otherwise post a general comment retaining `Location:`.

Load `review-comment-format` and use it to render every selected finding's final inline or general comment. Stop before any Bitbucket call if the skill cannot be loaded.

Use only `bitbucket_get_pull_request`, `bitbucket_get_pull_request_comments` and approval-required `bitbucket_add_pull_request_comment`. Do not use pull-request search, another Bitbucket mutation, generic HTTP, or shell commands for publication.

Report each requested number's placement, reason, status and confirmed comment ID. Never construct a browser link or claim success without a created comment ID or an exact `already-posted` match.
