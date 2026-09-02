---
name: deep-review-workflow
description: Perform a deep code review as a senior engineer by following an explicitly defined workflow, analyzing the change from multiple engineering perspectives, and producing concise, evidence-based feedback.
---

Read the deep code review workflow description. Follow workflow algorithm exactly as desribed.
Imagine you are a code executor and you "execute" the workflow algorithm in the very deterministic way. DON'T randomly jump between logic branches, ask as described in the algorithm.
The algorithm is written in PlantUML for better clarity.

# Deep Code Review Workflow

## General rules (applies to entire workflow, including subagents)
- The workflow is read-only for local resources (files, directories), but you are allowed to call tools and modify external resources (f. e. to post a review comments);
- If you have a significant uncertancy that blocks your workflow execution, stop and report;

## Workflow algorithm
```puml
@startuml

start

:Use `get_issue`, `get_issue_comments` tools and fetch Jira ticket data;

:Read `references/get-reviewer-person.md` and identify reviewer person;

:Read `references/get-review-requestor.md` and identify review requestor;

:Read `references/get-review-type.md` and identify review type;

if (Review type is "primary") then (yes)
  :Read the pull requests (PR) metadata attached to Jira ticket;
  
  :Filter "open" PRs;
  
  :Filter PRs already approved by reviever person;
  
  :Consider remaining PR list like review target;

  :Create ordered review target PR list;

  while (Unreviewed target PR exists?) is (yes)
    :Select next unreviewed PR as current PR;

    fork
      :Launch the "Explore" sub-agent and put the text from`references/architecture-review.md` as it's user message.
      Attach to the user message the Jira data and the current PR metadata;
    fork again
      :Launch the "Explore" sub-agent and put the text from`references/unit-review.md` as it's user message.
      Attach to the user message the Jira data and the current PR metadata;
    fork again
      :Launch the "Explore" sub-agent and put the text from`references/code-polish-review.md` as it's user message.
      Attach to the user message the Jira data and the current PR metadata;
    end fork

    :Receive found issues from sub-agents;

    :Read `references/issue-consolidation.md` and consolidate code review issues;

    if (No issues found from the consolidation) then (yes)
      :Approve the PR;
    else (no)
      :Post comments to PR;

      :Mark PR as "request changes";
    endif

    :Mark current PR as processed;
  endwhile (yes)

  if (All review target PRs have no issues found) then (yes)
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