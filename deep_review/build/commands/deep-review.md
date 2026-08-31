---
description: Deep-review a Bitbucket pull request against a Jira requirement
agent: plan
---

Review one Bitbucket pull request against one Jira requirement.

Accept exactly two whitespace-separated arguments: `$1` is the Bitbucket pull-request URL and `$2` is the Jira issue key or URL. With any other argument count, stop and show:

`/deep-review <bitbucket-pull-request-url> <jira-issue-key-or-url>`

Require an absolute HTTP(S) Bitbucket Data Center URL whose path identifies exactly one project, repository and positive pull-request ID. Reject credentials, query parameters, fragments, and malformed or ambiguous paths. Pass the derived project, repository and ID only to `bitbucket_get_pull_request`; do not search for or infer a different pull request. Pass the Jira value only to `jira-requirement`, which must validate the issue key or permitted Jira URL before retrieval.

Keep the operation read-only. Require the pull request to be open and to expose non-empty source and target branch names and full source and target revisions. Resolve the local Git remote that corresponds to the URL's host, project and repository; stop if the repository, remote or URL context is inconsistent or ambiguous.

Resolve the exact source and target revisions reported by Bitbucket in the local repository and use their merge base as the immutable comparison revision. Require the resolved branch heads to match the Bitbucket revisions; never substitute another branch, pull request or cached revision. Stop when any identity or revision cannot be verified safely. Do not check out, switch, reset or modify a branch.

Load the `deep-code-review` skill. Freeze the validated pull-request URL as the review-target identifier together with its repository, branches, immutable revisions, merge base, diff and normalized Jira result. Enforce every skill orchestration gate. If any gate fails, stop instead of producing a review report; otherwise return only the final report and preserve the complete pull-request URL in its `Review target:` line.
