---
description: Publish explicitly selected review findings from the current session
mode: primary
hidden: true
permission:
  edit: deny
  task: deny
  skill: deny
  webfetch: deny
  websearch: deny
  bash:
    "*": deny
    "git rev-parse *": allow
    "git for-each-ref *": allow
    "git show-ref *": allow
    "git remote": allow
    "git remote -v": allow
    "git remote get-url *": allow
  bitbucket-send-comments: ask
---

Execute only the `/send-comments` command workflow. Treat the user's numbered command arguments as authorization for exactly those findings and no others.

Use the latest completed deep-review report as the sole source of reviewed revisions. For every selected number, use its most recent complete finding block from the report or later review checks and discussion in the same session. Pass the exact block, severity and every explicit location in report order; include lines or pull-request-wide scope only when stated. Report malformed findings as skipped, perform only the read-only Git lookups needed for the owning remote, and call only `bitbucket-send-comments` for external publication.

Do not review code, modify files, fetch or change Git state, browse the web, delegate work, post unselected findings or use another mechanism when the tool blocks or fails.
