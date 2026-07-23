# Verified Review and Report Contract

Build one verified, deduplicated structure before rendering:

```json
{
  "schemaVersion": "1",
  "summary": {
    "reviewTarget": "<URL or identifier>",
    "description": "Brief description of the reviewed change.",
    "baseRevision": "<immutable revision>",
    "headRevision": "<immutable revision>",
    "limitations": []
  },
  "findings": [
    {
      "severity": "Major",
      "title": "Validation occurs after the first write",
      "location": {
        "file": "src/example.java",
        "lines": "42-48",
        "symbol": "ExampleService.save"
      },
      "problem": "...",
      "impact": "...",
      "suggestedFix": "...",
      "evidence": ["..."],
      "sourceLayers": ["unit-correctness"]
    }
  ]
}
```

## Consolidation rules

- Include only candidates verified against the frozen review target.
- Give every finding a concise `title` that summarizes the verified problem without adding a new claim.
- Preserve the strongest verified evidence and the narrowest accurate location.
- Assign the highest justified severity, not automatically the highest proposed severity.
- Merge candidates only when they share one root cause and one material fix.
- Preserve multiple `sourceLayers` when independent layers found the same defect.
- State material requirement, target, coverage, or check limitations in `summary.limitations`.
- Do not use a finding to represent uncertainty alone.

## Severity rules

- `Critical`: The change can cause catastrophic or broadly unrecoverable impact, such as severe data loss, exploitable security failure, or a release-blocking outage with no practical mitigation.
- `Major`: The change can produce incorrect behavior, regression, requirement failure, compatibility break, significant reliability risk, or a test gap likely to hide such a defect.
- `Minor`: The change introduces a localized, low-impact quality or maintainability problem that remains worth fixing.

Use confidence to decide whether a candidate is sufficiently proven; do not lower impact severity merely because discovery was difficult.

## Deterministic Markdown

Render the brief change summary first. Include material limitations in the same summary section.

When findings exist:

1. Group them under `## Critical`, `## Major`, and `## Minor` in that order.
2. Omit empty severity groups.
3. Sort within each group deterministically by file, then starting line, then symbol.
4. Render every finding in this exact field order:
   - Location: file or class, line or line range, and symbol when available.
   - Problem and impact.
   - Suggested fix.
   - Evidence.
5. Preserve meaning and verified evidence; do not introduce new judgment while formatting.

Use this shape:

```markdown
# Review summary

<Brief change description. Material limitations, if any.>

## Major

### <Concise finding title>

- Location: `src/example.java:42-48` (`ExampleService.save`)
- Problem and impact: <problem> <impact>
- Suggested fix: <brief actionable fix>
- Evidence: <verified evidence>
```

When there are no verified findings, render:

```markdown
# Review summary

<Brief change description. Material limitations, if any.>

No issues found.
```

Never render `No issues found.` as a claim of complete requirement satisfaction when material limitations exist; state the limitations directly in the summary.

Reject malformed final input rather than guessing missing content. The renderer must not discover findings, alter severity, change evidence, edit code, or post comments.
