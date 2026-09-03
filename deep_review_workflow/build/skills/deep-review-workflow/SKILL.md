---
name: deep-review-workflow
description: Perform a deep code review as a senior engineer by following an explicitly defined workflow, analyzing the change from multiple engineering perspectives, and producing concise, evidence-based feedback. IMPORTANT: this skill must be started only by the `deep-review-workflow` command or when explicitly requested by its full name.
---

Read the deep code review workflow description. Follow the workflow algorithm exactly as described.
Imagine you are a code executor who "executes" the workflow algorithm in a fully deterministic way. Do not randomly jump between logic branches; act as described in the algorithm.
The algorithm is written in PlantUML for better clarity.

# Deep Code Review Workflow

## General rules (apply to the entire workflow, including subagents)
- The workflow is read-only for local resources (files and directories), but you can call tools and modify external resources (e.g., to post review comments);
- If significant uncertainty blocks the workflow execution, stop and report it;

## Workflow algorithm
```puml
@startuml

start

:Use the `get_issue` and `get_issue_comments` tools to fetch Jira ticket data;

:Read `references/get-reviewer-person.md` and identify the reviewer person;

:Read `references/get-review-requestor.md` and identify the review requestor person;

:Read `references/get-review-type.md` and identify the review type;

if (Review type is "primary") then (yes)
  :Read the pull request (PR) metadata attached to the Jira ticket;
  
  :Filter for "open" PRs;
  
  :Filter out PRs already approved by the reviewer person;
  
  :Treat the remaining PR list as the review target;

  :Create an ordered list of review target PRs;

  while (Unreviewed target PR exists?) is (yes)
    :Select the next unreviewed PR as the current PR;

    fork
      :Launch the "Explore" sub-agent and use the text from `references/architecture-review.md` as its user message.
      Attach to the user message the Jira data and the current PR metadata;
    fork again
      :Launch the "Explore" sub-agent and use the text from `references/unit-review.md` as its user message.
      Attach to the user message the Jira data and the current PR metadata;
    fork again
      :Launch the "Explore" sub-agent and use the text from `references/code-polish-review.md` as its user message.
      Attach to the user message the Jira data and the current PR metadata;
    end fork

    :Receive the issues found by the subagents;

    :Read `references/issue-consolidation.md` and consolidate code review issues;

    if (No issues found during consolidation) then (yes)
      :Approve the PR;
    else (no)
      :Post comments on the PR;

      :Mark PR as "request changes";
    endif

    :Mark the current PR as processed;
  endwhile (yes)

  if (No issues were found in any review target PR) then (yes)
    :Add the comment "Hi [review_requestor], review is done ✅" to the Jira ticket;
  else (no)
    :Add the comment "Hi [review_requestor], please check my findings in the PR comments." to the Jira ticket;
  endif

  :Assign the ticket to the review requestor person;
else (no)
  :Skip the review and report that it was skipped;
endif

stop

@enduml
```
