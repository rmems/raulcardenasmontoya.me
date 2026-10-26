---
title: 'Done is a claim: what an agent swarm taught me about verification'
description: 'On September 15, 2026 I ran a layered swarm of coding agents. The output was real, but the lesson was that a Done status is a claim, not proof.'
draft: true
published: 2026-10-25
---

On September 15, 2026 I tried to keep a large queue of engineering work moving at once with autonomous coding agents. It started as a plain sprint and turned into the clearest lesson I've had about what verification means once code is cheap. This note covers what I built that day, what an independent audit found afterward, and the rules I kept.

## I was the bottleneck

I began the usual way: reading repositories, drafting assignments, and launching agents one at a time. It was too slow. The constraint wasn't the agents. It was me.

So I layered the system. I kept my main ChatGPT conversation going and opened two more ChatGPT Work sessions, each with its own subagents. Research and audit subagents read the existing Linear backlog and the GitHub work linked to it. Issue-writing subagents turned what they found into narrow briefs with acceptance criteria, tests, dependencies, labels and provenance. Linear became the dispatch layer. Cursor Cloud Agents picked up the issues, created branches and opened pull requests. CI and automated reviewers fed results back, and I sat at the end deciding what was trustworthy enough to keep.

The way I described it at the time was "ChatGPT as the control plane for Cursor's control plane." I stopped being the person launching every worker and became the person coordinating the systems that launched them.

## How much, and how sure

My own retrospective counts about 176 issues delegated to Cursor agents that day. That is my count from the launch snapshot, not an audited figure, and its status breakdown is off by one.

The number I trust more is smaller. A later read-only audit checked 85 of those issues across eight workstreams against PR diffs, commit SHAs and, where possible, locally run test suites, treating every tracker status as a claim to verify. It found:

- 70 complete
- 7 partial
- 3 broken
- 4 marked Done with no work behind them
- 1 checked on status only, with no content review

Those verdicts apply to the 85 issues and the revisions inspected. They are not a success rate for everything the swarm touched. Still, the main finding holds: the swarm mostly delivered real, tested work.

## What broke

The failures matter as much as the output, because they are the kind that grow with autonomy.

**Done with no code.** Some issues were marked Done within a fraction of a second of each other, with no branch, no PR and no commit. The defects they were meant to fix were real and still there. A tracker status had moved on its own.

**Security checks that failed open and still passed their tests.** The few security-boundary changes in the audited set were all broken the same way: when the check hit something it didn't expect, it allowed instead of refusing. The tests were green because they never exercised the adversarial case. Green CI told me the code did what the tests asked, not what the requirement asked.

**Modeled numbers that read like measurements.** One performance result came from an analytical model, and the docs said so, but it was easy to cite as if it were measured on hardware. An estimate has to be labeled as one everywhere it travels.

**An agent that kept running after its ticket was cleared.** I cleared the delegate and moved the issue, and assumed the work had stopped. It hadn't. A session kept going for hours until I stopped it directly and confirmed it had stopped. Tracker state isn't execution state.

There was also review debt. Throughput moved the bottleneck from coding capacity to judgment, integration and quality control. Some PRs were too large to review as a unit, and automated fixing sometimes overlapped with work another agent was already doing.

## The rules I kept

Afterward I wrote four operating rules down as decisions, so they would outlast the memory of the day.

1. **Require evidence before accepting Done.** A status is a claim. I accept work against commits, PR diffs, tests and acceptance evidence, I note the scope and revision I checked, and I keep estimates separate from measurements. Green CI alone doesn't prove a security property.
2. **Verify that an agent has stopped.** Clearing a delegate or a status isn't a stop. A stop targets the running session and is confirmed by its activity and by the absence of new commits or PR updates. If I can't check, I call it unverified. I keep every session, branch, PR and commit instead of deleting them to make the state look cleaner.
3. **Separate research, implementation, review and verification.** Each role is explicit, and an implementation claim gets its own verification pass. A research report or a review comment is not finished work.
4. **One implementation owner per branch.** Many reviewers can comment, but fixes go through one owner. Before ownership changes hands, I record the handoff and confirm the previous agent has stopped.

None of these is clever. All of them are things I believed before that day and didn't enforce until the scale made the cost obvious.

## What's next

This day was both a proof and a warning. I proved I could mobilize a lot of engineering throughput. I also learned that scale amplifies weak specifications, false completion and unverified claims. The next level isn't more agents for their own sake. It's better orchestration, sharper acceptance tests, stronger review, and knowing when to slow down.

So the next phase is about efficiency, not volume: fewer wasted runs, tighter briefs, better auditability, and more of my own understanding in the loop. I want the work to stay modular and documented enough that I can come back after time away and still recover the structure, the intent and the evidence. That's also why I'm putting more attention back into my AI Engineering degree, so my own judgment keeps up with the systems I'm running.

A Done status was a claim, not proof. The proof lived in branches, PRs, commits, tests and evidence.
