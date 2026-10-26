---
title: 'Done is a claim: the day I was the bottleneck'
description: 'On September 15, 2026 I tried to use up my Cursor Ultra usage before the reset. The agents kept up. I was the one who couldn''t.'
draft: true
published: 2026-10-25
---

On September 15, 2026 I had a lot of Cursor Ultra usage left and the reset was coming. Leaving it on the table felt like a waste, so I decided to use as much of it as I could in one day.

By my own count I ran somewhere between 500 and 600 agents that day. Over 500 Linear issues got created. I had agents planning work, agents doing the work, and agents checking on other agents. For a while it felt amazing. Every time I looked, more things had moved to Done.

The agents weren't the problem, and neither was the quota. I was.

Every one of those agents eventually needed me. Someone had to read what it did, decide if it was right, and say yes or no. That someone was me, and there's only one of me. Somewhere in the afternoon I stopped really reviewing and started skimming. Then I started trusting the status column. Without noticing, "Done" went from meaning "finished" to meaning "an agent said it was finished."

Those aren't the same thing, and I found out how different they are later.

After things calmed down I went back and checked 85 of those issues properly. I didn't look at the status. I looked at what actually changed, the code, the commits, whether the tests ran. Most of it held up: 70 were really complete. Seven were only partly done. Three were broken. Four were marked Done with nothing behind them at all, and one was just a status change.

That's not a disaster. It's actually a pretty good hit rate. But it means if I'd shipped everything marked Done, I would have shipped broken work and work that didn't exist, and I wouldn't have known which was which.

What I took from it is simple. Done is a claim. It's an agent telling you something, and it still needs checking. A green checkmark from something that grades its own homework isn't proof.

It also changed how I think about my own role. Getting the agents to write code is the easy part now. What limits me is how much I can actually check. If I launch more work than I can verify, I'm not going faster. I'm just building a pile of claims I'll have to sort through later.

So now I try to launch only what I can check. I want evidence I can look at, like a diff, a test run, or a commit, before I believe anything is finished. And I'd rather have 20 things I know are done than 200 things that say they are.

Running out the clock on my usage taught me more about my own limits than about the agents. They can go as wide as I let them. I can't, and that's fine, as long as I remember it.
