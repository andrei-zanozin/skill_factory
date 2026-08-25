---
description: Deep-review a Git branch against an optional target branch and Jira requirement
agent: plan
---

Review a source Git branch against a target Git branch and a Jira requirement.

Distinguish the command form only by the number of whitespace-separated arguments:

- With exactly two arguments, treat `$1` as the source Git branch, use `develop` as the target Git branch, and treat `$2` as the Jira issue key or URL.
- With exactly three arguments, treat `$1` as the source Git branch, `$2` as the target Git branch, and `$3` as the Jira issue key or URL.
- With any other argument count, stop and show this usage:

`/deep-review <source-branch> [target-branch] <jira-issue-key-or-url>`

Keep the operation read-only. Validate both branch names before using them and never interpolate either into an unrestricted command. Pass the Jira value only to the narrow read-only requirement integration, which must validate the issue key or permitted Jira URL before retrieval.

Resolve the source and selected target branch heads to immutable revisions and use their merge base as the immutable comparison revision. Use only the target selected by the argument-count rules above: the explicit target for three arguments or `develop` for two arguments. Never infer, substitute, or fall back to any other default, cached, historical, or previously used branch. Stop and report the ambiguity if either branch or revision cannot be resolved safely. Do not check out, switch, reset, or modify either branch.

Load the `deep-code-review` skill. Use the resolved source/target branch diff, immutable revisions, and normalized Jira result as the frozen review input, then run the complete skill workflow. Enforce all of the skill's orchestration gates; if any gate fails, stop instead of producing a review report. Otherwise, return only the skill's final review report.
