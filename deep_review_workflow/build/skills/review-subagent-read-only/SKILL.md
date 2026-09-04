---
name: review-subagent-read-only
description: "Mandatory local read-only repository rules for deep review subagents. Load only when a review layer skill requires it."
---

# Read-only repository inspection

Use the attached local repository root, current PR metadata, and review layer. The orchestrator has already verified that the local checkout is clean and its HEAD equals the full reviewed head commit.

Inspect the repository using all necessary read-only tools. You may read and search files and inspect Git history and diffs. You may call external tools required by the assigned review instructions. Keep all repository evidence tied to the verified reviewed head commit.

Do not modify local files, directories, or Git state. In particular:

- Do not create or use a Git worktree.
- Do not fetch, pull, check out, switch, reset, merge, rebase, stash, clean, commit, or change branches or references.
- Do not create, edit, move, or delete files or directories.
- Do not run builds, tests, generators, formatters, linters, package managers, or other commands that may create artifacts, caches, lock-file changes, or any other local data.

If sufficient evidence cannot be obtained without modifying local data, return `Failed: read-only repository inspection failed: <reason>`. Do not ask the parent agent to perform the modification.
