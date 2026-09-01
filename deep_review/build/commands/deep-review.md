---
description: Deep-review a Bitbucket pull request against a Jira requirement
agent: plan
---

Review one Bitbucket pull request against one Jira requirement.

Accept exactly two whitespace-separated arguments: `$1` is the Bitbucket pull-request URL and `$2` is the Jira issue key or URL. With any other argument count, stop and show:

`/deep-review <bitbucket-pull-request-url> <jira-issue-key-or-url>`

Require an absolute HTTP(S) Bitbucket Data Center URL whose path identifies exactly one project, repository and positive pull-request ID. Reject credentials, query parameters, fragments, and malformed or ambiguous paths. Pass the derived project, repository and ID only to `bitbucket_get_pull_request`; do not search for or infer a different pull request. For Jira, the Plan agent may call only the externally configured read-only MCP tools `get_issue(issue)` and `get_issue_comments(issue, cursor, limit)`; pass the supplied issue key or URL only to those tools. Do not use Jira REST, shell, generic HTTP, or a custom-tool fallback.

Call `get_issue` exactly once. Then call `get_issue_comments` repeatedly from cursor `0`, always with the maximum supported `limit: 100`, and continue until `next_cursor` is `null`. Validate every structured response, require cursor progress (`next_cursor` must equal the current cursor plus the accepted comment count when non-null), and reject malformed, stalled or truncated output. Map the MCP response into the existing `requirementContext`: `key` to `issueKey`, `issue_type` to `issueType`, author objects to the existing author string, and `created_at`/`updated_at` to `created`/`updated`; preserve trust, provenance, comments and completeness metadata.

If `get_issue` fails, set `issueRead: false`. If a comment-page call fails, preserve already fetched comments and set `commentsFullyPaginated: false`. Add only sanitized MCP errors to `warnings`, mark truncation explicitly, and never claim complete requirement validation after an MCP error, incomplete pagination or truncated tool output. Continue all three review layers when the repository and diff remain valid. Keep the workflow read-only.

Keep the operation read-only. Require the pull request to be open and to expose non-empty source and target branch names and full source and target revisions. Resolve the local Git remote that corresponds to the URL's host, project and repository; stop if the repository, remote or URL context is inconsistent or ambiguous.

Resolve the exact source and target revisions reported by Bitbucket in the local repository and use their merge base as the immutable comparison revision. Require the resolved branch heads to match the Bitbucket revisions; never substitute another branch, pull request or cached revision. Stop when any identity or revision cannot be verified safely. Do not check out, switch, reset or modify a branch.

Load the `deep-code-review` skill. Freeze the validated pull-request URL as the review-target identifier together with its repository, branches, immutable revisions, merge base, diff and normalized Jira result. Enforce every skill orchestration gate. If any gate fails, stop instead of producing a review report; otherwise return only the final report and preserve the complete pull-request URL in its `Review target:` line.
