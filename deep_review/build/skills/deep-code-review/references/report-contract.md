# Verified Review Contract

Consolidate the layer results into one verified, deduplicated set of final findings before writing the report. Do not construct an intermediate final-report JSON object or other formatting payload.

## Consolidation rules

- Include only candidates verified against the frozen review target.
- Use a short, plain-language `title` that states what can go wrong; omit implementation names unless essential.
- Explain the problem and impact in two or three short, self-contained sentences; keep technical detail in the strongest verified evidence and retain every materially relevant location, with numeric lines whenever known.
- Assign the highest justified severity, not automatically the highest proposed severity.
- Merge candidates only when they share one root cause and one material fix.
- Preserve multiple `sourceLayers` when independent layers found the same defect.
- State material limitations in the final summary; never turn uncertainty into a finding.
- After severity assignment and final sorting, number all findings consecutively across severity groups, starting at `1`. `/send-comments` accepts these numbers and numbers assigned to complete findings formed during later review checks and discussion in the same session.

## Severity rules

- `Critical`: The change can cause catastrophic or broadly unrecoverable impact, such as severe data loss, exploitable security failure, or a release-blocking outage with no practical mitigation.
- `Major`: The change can produce incorrect behavior, regression, requirement failure, compatibility break, significant reliability risk, or a test gap likely to hide such a defect.
- `Minor`: The change introduces a localized, low-impact quality or maintainability problem that remains worth fixing.

Use confidence to decide whether a candidate is sufficiently proven; do not lower impact severity merely because discovery was difficult.

After consolidation, follow [report-format.md](report-format.md) exactly and write the final report directly.
