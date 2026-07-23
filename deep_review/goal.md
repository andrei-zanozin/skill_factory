# Goal

Create an OpenCode skill that automates deep, high-quality code review and performs reviews at the same standard as an experienced reviewer who practices code review daily.

# Description

The skill should review code changes through multiple layers of scrutiny, ranging from broad correctness to fine-grained quality concerns. At a minimum, it should:

- Verify that the code changes match the stated requirements and intended behavior.
- Evaluate the overall design, logic, and completeness of the implementation.
- Identify bugs, regressions, edge cases, and other correctness risks.
- Review maintainability, clarity, consistency, and adherence to project conventions.
- Detect small issues, including style mistakes and other low-level quality problems.
- Produce useful, well-prioritized review feedback comparable to a careful human review.

The review should run all three layers as separate, fresh, focused review tasks using the same requirement and code-change scope:

1. Solution and architecture.
2. Unit correctness.
3. Code polish.

Every layer should complete even when another layer finds issues. Findings should remain independent during discovery, then be verified, deduplicated and combined into one complete severity-prioritized report.

Jira requirement retrieval and final report rendering should be deterministic. Jira content should be treated as untrusted external data with explicit completeness status, while the final renderer should preserve verified evidence and produce the stable report contract without introducing new review judgments.

The MVP should be read-only: it should not modify code or post review comments to GitHub, GitLab or other external systems.

The ultimate objective is to capture and reproduce the user's layered review process so the OpenCode skill can execute code reviews with similar depth, judgment, and quality.
