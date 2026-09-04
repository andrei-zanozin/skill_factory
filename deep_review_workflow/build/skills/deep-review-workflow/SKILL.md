---
name: deep-review-workflow
description: Perform a deep code review as a senior engineer by following an explicitly defined workflow, analyzing the change from multiple engineering perspectives, and producing concise, evidence-based feedback. IMPORTANT: this skill must be started only by the `deep-review-workflow` command or when explicitly requested by its full name.
---

Read the deep code review workflow description. Follow the workflow algorithm exactly as described.
Imagine you are a code executor who "executes" the workflow algorithm in a fully deterministic way. Do not randomly jump between logic branches; act as described in the algorithm.
The algorithm is written in PlantUML for better clarity.

# Deep Code Review Workflow

## General rules (apply to the entire workflow, including subagents)
- The orchestrator may modify local Git state only to prepare the verified PR checkout described below. Review subagents are strictly read-only for local resources and must not use Git worktrees. You can call tools and modify external resources (e.g., to post review comments);
- If significant uncertainty blocks the workflow execution, stop and report it;
- Use lazy references loading. Read/load files in `references/` directory ONLY when you reach a workflow step where the file name is mentioned.

## Workflow algorithm
```puml
@startuml

start

:Use the `get_issue` and `get_issue_comments` tools to fetch Jira ticket data;

:Read `references/get-reviewer-person.md` and identify the reviewer person;

:Read `references/get-review-requestor.md` and identify the review requestor person;

:Read `references/get-review-type.md` and identify the review type;

:Use the `search_pull_requests` tool to find PRs by the Jira issue key;

:Filter for "open" PRs;

:Filter out PRs already approved by the reviewer person;

:Treat the remaining PR list as the review target;

:Create an ordered list of review target PRs;

while (Unreviewed target PR exists?) is (yes)
  :Select the next unreviewed PR as the current PR;

  :Retain the local repository root, canonical Bitbucket project and repository identifiers, source branch, and full reviewed head commit as part of the current PR metadata;

  :Read local HEAD and `git status --porcelain`;

  if (`git status --porcelain` is not empty?) then (yes)
    :Report `Failed: local PR checkout verification failed: local checkout is not clean` and stop.
    Do not stash, clean, reset, or carry local changes to another branch;
    stop
  endif

  if (Local HEAD differs from the full reviewed head commit?) then (yes)
    :Fetch the source branch from `origin` into its remote-tracking reference using `--no-write-fetch-head`;

    if (Fetched remote-tracking branch tip differs from the full reviewed head commit?) then (yes)
      :Report `Failed: local PR checkout verification failed: fetched source branch does not match the PR head` and stop;
      stop
    endif

    if (Local source branch does not exist?) then (yes)
      :Create and switch to a local source branch that tracks the fetched remote-tracking branch;
    else (no)
      if (Local source branch equals or is an ancestor of the reviewed head commit?) then (yes)
        :Switch to the local source branch and update it only with a fast-forward to the fetched remote-tracking branch;
      else (no)
        :Report `Failed: local PR checkout verification failed: local source branch is ahead or divergent` and stop;
        stop
      endif
    endif
  endif

  :Require local HEAD to equal the full reviewed head commit and `git status --porcelain` to be empty;

  if (Local PR checkout preparation failed?) then (yes)
    :Report `Failed: local PR checkout verification failed: <reason>` and stop before launching any review subagent;
    stop
  endif

  :Read `references/read-only-repository-inspection.md` and retain its complete text as the mandatory subagent repository inspection procedure;

  if (Review type is "secondary") then (yes)
    :Launch the "Explore" sub-agent and use the text from `references/secondary-review.md` as its user message.
    Attach to the user message the full Jira data you have (don't forget to attach the reviewer person), the current PR metadata, the repository inspection procedure, and the review layer `secondary`;

    :Receive the secondary review result;

    if (Secondary review status == "Failed") then (yes)
      :Report the "Failed" error and stop;
      stop
    endif
  endif

  :Read `references/issue-format.md` and retain its complete text as the mandatory issue format;

  fork
    :Launch the "Explore" sub-agent and use the text from `references/architecture-review.md` as its user message.
    Attach to the user message the Jira data, the current PR metadata, the complete issue format text, the repository inspection procedure, and the review layer `architecture`;
  fork again
    :Launch the "Explore" sub-agent and use the text from `references/unit-review.md` as its user message.
    Attach to the user message the Jira data, the current PR metadata, the complete issue format text, the repository inspection procedure, and the review layer `unit`;
  fork again
    :Launch the "Explore" sub-agent and use the text from `references/code-polish-review.md` as its user message.
    Attach to the user message the Jira data, the current PR metadata, the complete issue format text, the repository inspection procedure, and the review layer `code-polish`;
  end fork

  :Receive the issues found by the subagents and append the secondary review result when present;

  if (Any review subagent result starts with "Failed:") then (yes)
    :Report the failure and stop;
    stop
  endif

  :Validate every subagent issue against the mandatory issue format.
  Correct formatting-only deviations without changing meaning and stop if required content is missing;

  :Read `references/issue-consolidation.md` and consolidate code review issues;

  :Validate every consolidated issue against the mandatory issue format.
  Correct formatting-only deviations without changing meaning and stop if required content is missing;

  if (No issues found during consolidation) then (yes)
    :Approve the PR;
  else (no)
    :Before the first comment, use `get_pull_request` and `get_pull_request_diff` with the canonical project and repository identifiers to refresh the current PR and effective diff.
    Require the reviewed head commit to remain current and preflight every consolidated location.
    Confirm that its repository-relative path, line, and source/destination side identify the exact statement described by the finding.
    If any location is stale, missing, ambiguous, or inconsistent with the evidence, stop before posting any comment;

    :Post each consolidated issue on the PR using the mandatory issue format.
    Use the location's path, line, and side as the anchor. Remove only the complete `Location:` line from the comment text;

    :Mark PR as "request changes";
  endif

  :Mark the current PR as processed;
endwhile (yes)

if (No issues were found in any review target PR) then (yes)
  :Add the comment "Hi [review_requestor], review is done ✅" to the Jira ticket;
else (no)
  :Add the comment "Hi [review_requestor], please check my findings in the PR(s) comments." to the Jira ticket;
endif

:Assign the ticket to the review requestor person;

stop

@enduml
```
