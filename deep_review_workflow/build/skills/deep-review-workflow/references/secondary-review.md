# Secondary Review

For the current PR, get every unresolved comment from the reviewer person and check it precisely against the current code diff.

- If fixed, resolve the comment using `set_comment_resolved` tool.
- If not fixed, reply politely with precise evidence explaining why using `add_pull_request_comment` tool.

Return only `No issues found` if all previous comments are resolved, or `Done` if any remain unresolved. On an unexpected failure, return `Failed: <short error description>`.
