---
title: 'Done is a claim: what an agent swarm taught me about verification'
description: 'On September 15, 2026 I ran a layered swarm of coding agents. The output was real, but the lesson was that a Done status is a claim, not proof.'
draft: true
published: 2026-10-25
---

On September 15, 2026 I tried to keep a large queue of engineering work moving at once with autonomous coding agents. It turned into the clearest lesson I've had about what verification means once code is cheap.

## I was the bottleneck

Launching agents one at a time was too slow, and the constraint was me, so I layered the system: ChatGPT Work sessions and their subagents researched the backlog and wrote narrow Linear issues, Cursor Cloud Agents implemented them as branches and PRs, and CI and automated reviewers fed results back to me. I called it "ChatGPT as the control plane for Cursor's control plane." I stopped being the person launching every worker and became the person coordinating the systems that launched them.

## How much, and how sure

My retrospective counts about 176 issues delegated that day. A later read-only audit of 85 of them, across eight workstreams, checked PR diffs, commits and tests rather than tracker status, and found:

- 70 complete, 7 partial, 3 broken
- 4 marked Done with no work behind them
- 1 checked on status only

Those verdicts cover only the 85 issues and the revisions inspected, not everything the swarm touched. Still, the swarm mostly delivered real, tested work.

## What broke

- **Done with no code:** some issues flipped to Done with no branch, PR or commit behind them.
- **Fail-open security checks:** the security-boundary changes allowed what they should have refused, and their tests stayed green because they never tried the adversarial case.
- **Modeled numbers that read like measurements:** an analytical estimate was easy to cite as if it had been measured on hardware.
- **An agent that outlived its ticket:** clearing the delegate didn't stop the session, which kept running for hours until I stopped it directly.

The bottleneck moved from coding capacity to judgment, integration and quality control.

## The rules I kept

1. **Evidence before Done:** I accept work only against commits, diffs, tests and acceptance evidence, and green CI alone doesn't prove a security property.
2. **Verify the stop:** a stop counts only when the running session itself has ceased, and I keep every branch, PR and commit rather than tidying them away.
3. **Separate roles:** research, implementation, review and verification are distinct jobs, and a report or review comment is not finished work.
4. **One owner per branch:** many reviewers can comment, but fixes go through a single implementation owner.

## What's next

This day was both a proof and a warning: scale amplifies weak specifications, false completion and unverified claims. The next phase is fewer wasted runs, tighter briefs, sharper acceptance tests and more of my own understanding in the loop, including more attention on my AI Engineering degree.

A Done status was a claim, not proof. The proof lived in branches, PRs, commits, tests and evidence.
