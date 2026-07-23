---
description: Deep-review a Git branch against a Jira requirement
agent: plan
---

Review the Git branch `$1` against the Jira requirement `$2`.

Treat `$ARGUMENTS` as exactly two required whitespace-separated values: a Git branch name followed by a Jira issue key or URL. If either value is missing, if extra values are present, or if the branch name contains whitespace or does not resolve unambiguously to a local or remote branch, stop and show this usage:

`/deep-review <git-branch> <jira-issue-key-or-url>`

Keep the operation read-only. Validate the branch name before using it and never interpolate it into an unrestricted command. Pass the Jira value only to the narrow read-only requirement integration, which must validate the issue key or permitted Jira URL before retrieval.

Resolve the branch head to an immutable revision. Determine the repository's default branch and use their merge base as the immutable comparison revision. Stop and report the ambiguity if the default branch or either revision cannot be resolved safely. Do not check out, switch, reset, or modify the target branch.

Load the `deep-code-review` skill. Use the resolved branch diff, immutable revisions, and normalized Jira result as the frozen review input, run the complete skill workflow, and return only its final review report.
