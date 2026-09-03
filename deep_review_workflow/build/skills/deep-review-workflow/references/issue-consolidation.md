# Consolidation goal
Code review agents run separately, so they can report the same issues (code review findings) more than once.
Deduplicate them to avoid reporting the same issue twice.

# Consolidation rules
- Duplicate issues have the same "Location" and similar "Problem and impact".
- Select the first issue when the entire contents ("Location", "Problem and impact", "Suggested fix", etc.) match closely.
- Select the most detailed and informative issue when the contents ("Location", "Problem and impact", "Suggested fix", etc.) do not match exactly but are similar.
- Inherit the highest "Severity" from the issues you are deduplicating.
- Always use the "Title" from the issue you selected; do not merge or replace titles from different issues.
- If you received "No issues found" from **all code review agents**, the consolidation result is also "No issues found".

## Consolidated list format
Read `references/issue-format.md` and apply the format to all issues you consolidated.
