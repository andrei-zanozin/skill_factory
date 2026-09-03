# Temporary worktree isolation

Create, use, and remove your own temporary Git worktree. Do not ask the parent agent to manage or clean it.

## Setup

1. Use the attached local repository root, source branch, reviewed head commit, PR ID, and review layer.
2. Create a unique temporary root with `mktemp -d`. Include the PR ID and review layer in its prefix and let `mktemp` add the random suffix. Put the worktree at a not-yet-created `worktree` child path.
3. Check whether the full reviewed head commit exists in the repository. If it does not, fetch the source branch from `origin` with `--no-write-fetch-head` so no local branch or `FETCH_HEAD` is changed.
4. Add the worktree with `git worktree add --detach <worktree-path> <reviewed-head>`.
5. In the worktree, require `git rev-parse HEAD` to equal the full reviewed head commit and require the initial `git status --porcelain` output to be empty.

Perform every local file read, search, Git command, build, and test inside this worktree. Do not check out another revision or use the original working tree for review evidence.

## Mandatory cleanup

Treat cleanup as a final step that must be attempted before every return, including findings, `No issues found`, `Done`, setup failure, and review failure.

1. If the worktree was registered, remove only that exact path with `git worktree remove --force` from the attached repository root.
2. Remove the unique temporary root with `rmdir` after it is empty.
3. Never use `git worktree prune`, `rm -rf`, a glob, or a path not created by this subagent.

Return the normal review result only after cleanup succeeds. If setup fails, clean up everything created so far and return `Failed: worktree setup failed: <reason>`. If cleanup fails, return `Failed: worktree cleanup failed: <exact path and reason>`. Do not delegate cleanup to the parent agent.
