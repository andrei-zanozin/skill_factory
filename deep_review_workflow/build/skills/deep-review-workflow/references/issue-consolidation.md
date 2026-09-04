# Consolidation goal
Code review agents run separately, so they can report the same issues (code review findings) more than once.
Deduplicate them to avoid reporting the same issue twice.

# Consolidation rules
- Duplicate issues have the same "Location" and similar "Problem and impact".
- Never modify/merge/invent "Location" of issues, the location must be accurate.
- If similar issues have different locations, select only an issue whose location identifies the exact statement described by its evidence. If more than one location remains plausible, stop instead of choosing one.
- Select the first issue when the entire contents ("Location", "Problem and impact", "Suggested fix", etc.) match closely.
- Select the most detailed and informative issue when the contents ("Location", "Problem and impact", "Suggested fix", etc.) do not match exactly but are similar.
- Inherit the highest "Severity" from the issues you are deduplicating.
- Always use the "Title" from the issue you selected; do not merge or replace titles from different issues.
- The consolidation result is "No issues found" only if all subagents, including the secondary review subagent when present, returned "No issues found". Treat "Done" as unresolved previous review issues, not as a new issue.
- During a secondary review, compare consolidated findings with the refreshed unresolved root comments authored by the reviewer person. Exclude a finding from the new-issue list only when it clearly describes the same underlying defect and affected unit as an existing comment already handled by the secondary review. The anchors may differ because the diff changed between review rounds. Keep the finding as new when the match is uncertain or the behavior is materially different.

## Consolidated list format
Apply the loaded `review-issue-format` skill to all issues you consolidated.
