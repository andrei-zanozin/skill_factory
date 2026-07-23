# Layer Result Contract

Return exactly one JSON object and no report prose. Use this versioned shape:

```json
{
  "schemaVersion": "1",
  "layer": "unit-correctness",
  "status": "completed",
  "coverage": {
    "filesInspected": ["src/example.java"],
    "checksRun": ["focused test: passed"],
    "limitations": []
  },
  "findings": [
    {
      "candidateId": "unit-1",
      "severity": "Major",
      "location": {
        "file": "src/example.java",
        "lines": "42-48",
        "symbol": "ExampleService.save"
      },
      "problem": "The changed branch persists an incomplete record.",
      "impact": "A retry reads invalid state and cannot recover automatically.",
      "suggestedFix": "Validate the complete record before the first write.",
      "evidence": [
        "The new branch reaches repository.save at line 46 before validation at line 51."
      ],
      "confidence": "high"
    }
  ]
}
```

## Field rules

- Set `schemaVersion` to `"1"`.
- Set `layer` to exactly one of `solution-and-architecture`, `unit-correctness`, or `code-polish`.
- Set `status` to `completed` or `blocked`.
- Populate `coverage.filesInspected`, `coverage.checksRun`, and `coverage.limitations` even when `findings` is empty.
- Describe failed and skipped checks honestly in `checksRun` or `limitations`; never imply they passed.
- Use a layer-prefixed unique `candidateId`, such as `architecture-1`, `unit-1`, or `polish-1`.
- Set `severity` to `Critical`, `Major`, or `Minor` based on impact.
- Set `confidence` independently to `high`, `medium`, or `low` based on certainty.
- Use the narrowest source `location`. Use an empty `lines` or `symbol` only when the finding genuinely applies to a broader artifact.
- Separate `problem`, `impact`, and `suggestedFix`.
- Populate `evidence` with independently checkable facts from the frozen diff, source, tests, requirement provenance, or a clear execution path.

## Status rules

Use `completed` when the layer performed a meaningful investigation, even if some checks were unavailable. Put partial-coverage details in `limitations`.

Use `blocked` when the layer could not perform a meaningful investigation. Explain the exact reason in `coverage.limitations`; do not invent findings to compensate. A blocked result does not stop other layers.

## Candidate rules

Return a candidate only when it is caused by or materially relevant to the reviewed change, actionable, and more than a personal preference. Do not emit praise, speculative concerns without a failure path, or final report formatting. The orchestrator verifies, deduplicates, and finalizes candidates after all layers complete.
