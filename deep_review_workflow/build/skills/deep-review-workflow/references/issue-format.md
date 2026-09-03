## Output format
Use this exact format for every issue returned by a review subagent, every consolidated issue, and every unanchored pull-request comment:

```markdown
### <severity>: <title>

- Location: <complete verified location line>
- Problem and impact: <problem> <impact>
- Suggested fix: <brief actionable fix>
- Evidence: <verified evidence>
```

Separate multiple issues with an empty line.
Keep the heading structure and the `Location:`, `Problem and impact:`, `Suggested fix:`, and `Evidence:` labels exactly as written and in this order.
For an anchored pull-request comment, remove only the complete `Location:` line. Do not remove it from any other issue or comment.
Before returning or posting an issue, silently validate its structure and correct formatting-only deviations without changing its meaning. If required content is missing, stop instead of inventing it or posting an incomplete issue.
