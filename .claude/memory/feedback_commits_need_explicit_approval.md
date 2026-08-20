---
name: feedback_commits_need_explicit_approval
description: "Hard global rule: never run git commit (or push) without the user explicitly saying ok to that specific commit, in any project"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: b62546f6-dca5-4823-9e96-77d4fc9cdf51
  modified: 2026-08-19T13:32:51.933Z
---

**Hard rule, applies globally across every project, not just askmycrawl.** Never run `git
add`/stage files proactively, and never run `git commit` or `git push` proactively — not even
"stage it for review" as a middle ground.

Critically: an earlier instruction to "create a commit" / "commit this work" is **not** standing
permission to actually execute the commit. Prepare it (stage the intended files, draft the commit
message) and then show the user the message and ask them to explicitly OK it — "ok commit" or
equivalent — before running `git commit`. Only after that explicit go-ahead does the commit
happen; if they say no/wait/hold off, don't commit. This applies even mid-task, even if committing
was the literal thing they asked for a moment earlier — the execution of the commit itself still
needs its own explicit confirmation, not just the request that preceded it.

**Why:** stated explicitly in [[askmycrawl-project]] planning session: first "no from now on
commits go throw me docment that as well," then reinforced further — "dont put files into staged
if i didnt do it and only create me a git commit if i say i need it." Reinforced again later,
generalized to a hard global rule: "dont ever commit without me saying ok commit that message ...
even if i said create me something before you push the commit ever let me first ok it or deny it."
The user wants full control over both staging and the actual commit/push moment, every time, with
no implicit carry-over of permission from an earlier ask.

**How to apply:** after making file changes, describe what's ready (via `git status`/`git diff`,
read-only) and, even when asked to prepare a commit, draft the message and show it — then wait for
an explicit "ok"/"commit"/"yes" before actually running `git commit`. Never chain commit→push
without the same explicit per-action confirmation. Related: [[feedback_never_pop_stash_without_explicit_ok]].
