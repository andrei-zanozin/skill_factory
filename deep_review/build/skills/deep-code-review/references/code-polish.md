# Code Polish Review Rubric

Perform only Layer 3. Review clarity, maintainability, consistency, naming, style, formatting, and other small but actionable quality issues.

## Investigation

1. Review code style and formatting.
   - Apply explicit repository guidance, nearby established patterns, linters, and formatter rules.
   - Look for misleading structure, inconsistent formatting not handled automatically, dead or duplicated code, unnecessary complexity, and comments that are stale or contradict behavior.
   - Do not report formatter output or subjective stylistic taste as a finding without repository support.

2. Review minor issues such as naming.
   - Check whether names communicate domain meaning, units, ownership, lifecycle, and side effects.
   - Identify confusing abstractions, avoidable branching, opaque literals, misleading comments, and maintainability hazards introduced or materially worsened by the change.
   - Prefer the smallest useful correction. Do not demand unrelated cleanup.

3. Check review value.
   - Report only issues a careful author would reasonably act on.
   - Explain the concrete maintenance, comprehension, or consistency cost.
   - Avoid generic best-practice advice, praise, nitpick inflation, and personal preference.

## Finding boundary

Focus on small quality defects rather than functional or architectural re-review. If inspection reveals a concrete correctness defect, capture its evidence without suppressing it; consolidation may retain it, adjust its severity, and deduplicate it with another layer.

Return coverage and limitations even when no findings exist.
