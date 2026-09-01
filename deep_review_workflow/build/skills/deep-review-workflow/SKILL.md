---
name: deep-review-workflow
description: Perform a deep code review as a senior engineer by following an explicitly defined workflow, analyzing the change from multiple engineering perspectives, and producing concise, evidence-based feedback.
---

Read the deep code review workflow description. Take rules in account and follow workflow algorithm exactly as desribed. The algorithm is described in PlantUML for better clarity.

# Deep Code Review Workflow

## General rules (applies to entire workflow, including subagents)
- The workflow is read-only for local resources (files, directories), but you are allowed to call tools and modify external resources (f. e. to post a review comments)

## Workflow
```puml
@startuml

start

:Use `get_issue`, `get_issue_comments` tools and fetch Jira ticket data;

:Read `references/get-reviewer-person.md` and determine reviewer person;

:Launch the "Explore" sub-agent with the following user message:
"Read `references/get-review-type.md` and execute".
Send Jira data to it as a part of the user message;

:Get the review type from the sub-agent;

if (Review type is "primary") then (yes)
  :Read the pull requests (PR) attached to Jira ticket;
  :Filter "open" PRs;
  :Filter PRs already approved by reviever person;
  :Consider remaining PR list like review target;
  :Create ordered review target PR list;

  while (Unreviewed target PR exists?) is (yes)
    :Select next unreviewed PR as current PR;

    fork
      :Launch the "Explore" sub-agent with the following user message:
      "Read `references/architecture-review.md` and execute".
      Send Jira data and PR data to it as a part of the user message;
    fork again
      :Launch the "Explore" sub-agent with the following user message:
      "Read `references/unit-review.md` and execute".
      Send Jira data and PR data to it as a part of the user message;
    fork again
      :Launch the "Explore" sub-agent with the following user message:
      "Read `references/code-polish-review.md` and execute".
      Send Jira data and PR data to it as a part of the user message;
    end fork

    :Receive the feedback from sub-agents, read `references/review-report.md` and prepare the report for current PR;

    if (Report status is "green") then (yes)
      :Approve the PR;
    else (no)
      :Send comments to PR using `format-review-comments` skill;
      :Mark PR as "request changes";
    endif

    :Mark current PR as processed;
  endwhile (yes)

  :Read `references/get-review-requestor.md` and determine review requestor;

  if (All review target PRs have report status "green") then (yes)
    :Add comment "Hi [review_requestor], review is done ✅" to the Jira ticket;
  else (no)
    :Add comment "Hi [review_requestor], please check my findings in PR comments." to the Jira ticket;
  endif

  :Assign the ticket to the review requestor;
else (no)
  :Skip the review, report skipping;
endif

stop

@enduml
```