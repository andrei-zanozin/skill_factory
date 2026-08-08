# Unit Correctness Review Rubric

Perform only Layer 2. Review changed and affected units for implementation bugs, edge cases, regressions, and test quality.

## Investigation

1. Review units' implementations and find implementation bugs and edge cases.
   - Trace normal, boundary, invalid, empty, null, and failure paths relevant to the change.
   - Inspect control flow, state mutation, data transformations, persistence behavior, resource handling, error propagation, and cleanup.
   - Apply DRY and KISS: flag non-trivial duplicated logic and avoidable implementation complexity.
   - Check assumptions about ordering, identity, equality, numeric limits, time, retries, concurrency, transactions, caching, and partial failure when relevant.
   - Follow callers and callees beyond the diff when needed to prove impact.
   - Identify regressions introduced or exposed by the reviewed change; do not report unrelated pre-existing defects.

2. Validate unit-test correctness and completeness.
   - Confirm tests exercise externally meaningful behavior rather than only implementation details.
   - Check assertions, fixtures, mocks, parameterization, negative paths, boundary cases, and failure behavior.
   - Detect tests that pass for the wrong reason, cannot fail when production behavior is wrong, or omit a changed execution path.
   - Run only approved focused checks that materially strengthen or falsify a candidate.
   - Record commands or checks exactly, including failures, skips, environmental blockers, and generated build artifacts.

## Finding boundary

Report concrete implementation defects, unhandled edge cases, regressions, and test defects that could hide incorrect behavior. Do not relitigate architecture unless the unit evidence proves a system-level consequence; record the concrete unit failure and let consolidation deduplicate it. Leave preference-only readability and formatting issues to Layer 3.

Never infer correctness solely from test presence or a passing suite. Return coverage and limitations even when no findings exist.
