## Output format
Use this exact format for every issue returned by a review subagent, every consolidated issue, and every unanchored pull-request comment:

```markdown
### <severity>: <title>

Location: <repository-relative-path>:<positive-line> (<source|destination>)

Problem and impact: <problem> <impact>

Suggested fix: <brief actionable fix>

Evidence: <verified evidence>
```

Classify issues by severity using only following types: `Critical`, `Major`, `Minor`.

Whire "title", "Problem and impact" and "Suggested fix" speaking a simple clear language, so even junoor developer will understand it.

Separate multiple issues with an empty line.
Keep the heading structure and the `Location:`, `Problem and impact:`, `Suggested fix:`, and `Evidence:` labels exactly as written and in this order.
Use `destination` for a line in the reviewed head, including directly relevant unchanged context, and `source` only for a removed line.
Choose the exact statement described by the finding. Do not use an enclosing declaration or a nearby line only because it can receive an inline comment.
Verify the repository-relative path, line, and side against the effective pull-request diff and the finding evidence.
For an anchored pull-request comment, remove only the complete `Location:` line. Do not remove it from any other issue or comment.
Before returning or posting an issue, silently validate its structure and correct formatting-only deviations without changing its meaning. If required content is missing, stop instead of inventing it or posting an incomplete issue.
