# Consolidation goal
Code review agents run separately and they can report same issues (code review findings) more than once.
You need to deduplicate them to not report the same issue twice.

# Consolidation rules
- Duplicate issues have the same "Location" and similar "Problem and impact".
- Select the first issue when the entire contents ("Location", "Problem and impact", "Suggested fix" etc.) are highly match;
- Select the most described and informative issue when the contents ("Location", "Problem and impact", "Suggested fix" etc.) don't match exactly, but look similar.
- Inherit the highest "Severity" from issues you are deduplicating;
- Always select the "Title" from the issue you selected, don't merge or replace titiles from different issues;
- If you received "No issues found" from **all code review agents**, then there is "No issues found" from the consolidation too.

## Consolidated list format
Read `references/issue-format.md` and apply the format to all ussues you consolidated.