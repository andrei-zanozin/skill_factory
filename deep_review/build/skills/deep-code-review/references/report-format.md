# Inline Review Report Format

Return only the final Markdown report. Do not output intermediate JSON, a manifest, a preamble, a code fence, an acknowledgement, or trailing commentary.

## Content integrity

- Use only the final findings established during verification and deduplication.
- Render every final finding exactly once.
- Do not add or remove findings while formatting.
- Do not change severity, meaning, evidence, or limitations while formatting.
- Keep material requirement, target, coverage, and check limitations visible.

## Ordering

- Start with the review summary.
- Group findings under `## Critical`, `## Major`, and `## Minor`, in that order.
- Render one group for every severity represented by the final findings. Never omit a non-empty group and never render an empty group.
- Within each group, sort by file, then starting line, then symbol, then title.

## Exact report structure

This example shows all three severity groups to define their exact order. In an actual report, omit every group that has no findings.

```markdown
# Review summary

<Brief change description.>

Review target: `<review target>` (`<base revision>` → `<head revision>`).

Limitations:
- <material limitation>

## Critical

### 1. <Concise Critical finding title>

- Location: `<file>:<lines>` (`<symbol>`)
- Problem and impact: <problem> <impact>
- Suggested fix: <brief actionable fix>
- Evidence: <one verified evidence item>

## Major

### 2. <Concise Major finding title>

- Location: `<file>:<lines>` (`<symbol>`)
- Problem and impact: <problem> <impact>
- Suggested fix: <brief actionable fix>
- Evidence: <one verified evidence item>

## Minor

### 3. <Concise Minor finding title>

- Location: `<file>:<lines>` (`<symbol>`)
- Problem and impact: <problem> <impact>
- Suggested fix: <brief actionable fix>
- Evidence: <one verified evidence item>
```

Apply these rules literally:

- Always render `# Review summary`, the brief description, and the `Review target:` line.
- Omit the complete `Limitations:` block when there are no material limitations.
- Repeat each limitation as one `- ` list item without combining distinct limitations.
- Use only the severity headings needed for the final findings.
- Repeat the finding block for every finding in the required order.
- Number findings consecutively in their final rendered order across all severity groups, starting at `1`. Never restart numbering for a new severity group and never expose layer candidate IDs.
- Keep the labels `Location:`, `Problem and impact:`, `Suggested fix:`, and `Evidence:` exactly as written and in that order.
- Render the location as `` `<file>` `` when lines are unavailable; otherwise render `` `<file>:<lines>` ``.
- Append `` (`<symbol>`) `` only when a symbol is available.
- Keep paths, revisions, line ranges, and symbols inside backticks.
- Escape Markdown metacharacters in dynamic prose when they would otherwise change its intended display.

For multiple evidence items, replace the single evidence line with:

```markdown
- Evidence:
  - <verified evidence item>
  - <verified evidence item>
```

When there are no verified findings, use:

```markdown
# Review summary

<Brief change description.>

Review target: `<review target>` (`<base revision>` → `<head revision>`).

Limitations:
- <material limitation>

No issues found.
```

Omit the complete `Limitations:` block when there are no material limitations. Never use `No issues found.` to imply complete requirement satisfaction when material limitations exist.

Before sending the response, silently check the report against this reference and fix format deviations in place. Do not create a second rendering pass or describe the check.
