# Determining the review type
A code review can have only two types: "primary" and "secondary".
Identify the review type based on the Jira ticket data you received. When you finish, return only one literal, "primary" or "secondary", based on your decision.

# Methodology
Analyze the Jira ticket data you received.

It is likely a "primary" review when:
- The code review requestor person asks the reviewer person for a code review for the first time in the comments;
- There are no comments from the **reviewer person** about review issues found;

It is likely a "secondary" review when:
- There are already comments from the **reviewer person** about code review issues found;
- There are already comments from the review requestor person about fixed code review issues;
- There is a comment from the review requestor person asking for another review;

Output format: only one word from ["primary", "secondary"].
