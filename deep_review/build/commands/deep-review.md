---
description: Deep-review a Git branch
agent: plan
---

Review the Git branch `$ARGUMENTS`.

Treat `$ARGUMENTS` as exactly one required branch name. If it is empty, contains whitespace, or does not resolve unambiguously to a local or remote branch, stop and show this usage:

`/deep-review <git-branch>`

Keep the operation read-only. Validate the branch name before using it and never interpolate it into an unrestricted command.

Resolve the branch head to an immutable revision. Determine the repository's default branch and use their merge base as the immutable comparison revision. Stop and report the ambiguity if the default branch or either revision cannot be resolved safely. Do not check out, switch, reset, or modify the target branch.

Load the `deep-code-review` skill. Use the resolved branch diff and immutable revisions as the frozen review target, run the complete skill workflow, and return only its final review report.
