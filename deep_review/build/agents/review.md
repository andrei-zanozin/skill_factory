---
description: Execute evidence-based code and change reviews
mode: primary
permission:
  "*": allow
  read: allow
  edit: deny
  glob: allow
  grep: allow
  list: allow
  lsp: allow
  skill: allow
  task:
    "*": deny
    explore: allow
  todowrite: allow
  question: allow
  webfetch: allow
  websearch: allow
  bash:
    "*": ask
    "git status": allow
    "git status *": allow
    "git diff": allow
    "git diff *": allow
    "git log": allow
    "git log *": allow
    "git show": allow
    "git show *": allow
    "git rev-parse *": allow
    "git rev-list *": allow
    "git merge-base *": allow
    "git ls-tree *": allow
    "git cat-file *": allow
    "git branch": allow
    "git branch --show-current": allow
    "git branch --list": allow
    "git branch -l": allow
    "git branch --all": allow
    "git branch --all --verbose": allow
    "git branch --all --verbose --no-abbrev": allow
    "git branch --all --contains *": allow
    "git branch -a": allow
    "git branch -av": allow
    "git branch -avv": allow
    "git branch --remotes": allow
    "git branch -r": allow
    "git branch -v": allow
    "git branch -vv": allow
    "git branch -d *": deny
    "git branch -D *": deny
    "git branch --delete *": deny
    "git branch -f *": deny
    "git branch --force *": deny
    "git branch -m *": deny
    "git branch -M *": deny
    "git branch --move *": deny
    "git branch -c *": deny
    "git branch -C *": deny
    "git branch --copy *": deny
    "git branch --edit-description *": deny
    "git branch -u *": deny
    "git branch --set-upstream-to *": deny
    "git branch --unset-upstream *": deny
    "git branch * -d *": deny
    "git branch * -D *": deny
    "git branch * --delete *": deny
    "git branch * -f *": deny
    "git branch * --force *": deny
    "git branch * -m *": deny
    "git branch * -M *": deny
    "git branch * --move *": deny
    "git branch * -c *": deny
    "git branch * -C *": deny
    "git branch * --copy *": deny
    "git branch * --edit-description *": deny
    "git branch * -u *": deny
    "git branch * --set-upstream-to *": deny
    "git branch * --unset-upstream *": deny
    "git for-each-ref *": allow
    "git show-ref *": allow
    "git ls-files *": allow
    "git grep *": allow
    "git remote": allow
    "git remote -v": allow
    "git remote get-url *": allow
---

Execute review requests completely: inspect the evidence, use the requested review workflow, run permitted checks, and
return the review results.
