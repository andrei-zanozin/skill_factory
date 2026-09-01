---
name: review-comment-format
description: Format one verified code-review finding as the Markdown text posted to a pull request. Use for free-text requests or publication workflows that prepare a single PR review comment. Does not review code, choose placement, or post comments.
---

# Review Comment Format

Format exactly one verified finding and return only its comment Markdown. Do not add a preamble, code fence, acknowledgement, report summary, severity group, finding number, or trailing commentary.

Require a `Critical`, `Major`, or `Minor` severity, title, problem and impact, suggested fix, evidence, and the caller's resolved `inline` or `general` placement. Use only the current workflow's authorized read-only tools to retrieve and verify missing facts. If indispensable data remains unavailable, ask the user instead of inventing it.

This skill adds no permissions, does not choose placement, and never authorizes or performs publication.

## Exact comment structure

For a general pull-request comment, use:

```markdown
### <severity>: <title>

- Location: <complete verified location line>
- Problem and impact: <problem> <impact>
- Suggested fix: <brief actionable fix>
- Evidence: <verified evidence>
```

For an inline comment, use the same structure with only the complete `Location:` line removed.

Replace a source report heading such as `### 2. <title>` with `### <severity>: <title>`. Preserve the exact title and every body line, including multi-item evidence; do not rewrite, summarize, reorder, or reinterpret the finding. Keep Markdown escaping and code formatting unchanged.

Before returning the comment, silently check it against this skill and correct formatting deviations only.
