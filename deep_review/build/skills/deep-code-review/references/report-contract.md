# Verified Review Contract

Consolidate the layer results into one verified, deduplicated set of final findings before writing the report. Do not construct an intermediate final-report JSON object or other formatting payload.

## Consolidation rules

- Include only candidates verified against the frozen review target.
- Give every finding a concise `title` that summarizes the verified problem without adding a new claim.
- Preserve the strongest verified evidence and the narrowest accurate location.
- Assign the highest justified severity, not automatically the highest proposed severity.
- Merge candidates only when they share one root cause and one material fix.
- Preserve multiple `sourceLayers` when independent layers found the same defect.
- State material requirement, target, coverage, or check limitations in the final report summary.
- Do not use a finding to represent uncertainty alone.

## Severity rules

- `Critical`: The change can cause catastrophic or broadly unrecoverable impact, such as severe data loss, exploitable security failure, or a release-blocking outage with no practical mitigation.
- `Major`: The change can produce incorrect behavior, regression, requirement failure, compatibility break, significant reliability risk, or a test gap likely to hide such a defect.
- `Minor`: The change introduces a localized, low-impact quality or maintainability problem that remains worth fixing.

Use confidence to decide whether a candidate is sufficiently proven; do not lower impact severity merely because discovery was difficult.

After consolidation, follow [report-format.md](report-format.md) exactly and write the final report directly.
