---
title: I Just Scored 30 European Sites on Agent-Readiness. Comment Here So I Can Score Yours.
day: 94
demo: Comment-driven sketches — public AILANG scoring from a hashtag
link: https://www.sunholo.com/ailang-demos/linkedin/topics/agent-ready/
image: marketing/_assets/sketches-leaderboard.png
imageAlt: Screenshot of the agent-ready leaderboard at sunholo.com/ailang-demos/linkedin/topics/agent-ready/ — top: GoCardless 8/10, then Bunq 6/10, Adyen and Mollie at 5/10, Tradeshift and Trustpilot at 0/10.
assets:
  - "Screenshot: the agent-ready leaderboard with 12 seeded entries, top to bottom"
---

A few weeks ago I told you comments on my posts would come back to me. The loop is live.

Reply on this post — or any other AILANG post on Sunholo's page — with your URL plus one of three hashtags. The cron sweeps every AILANG post, not just the latest. A public page appears at sunholo.com/ailang-demos/linkedin/topics/your-topic/your-domain on the next 3-hourly tick.

The three threads:

— "#ailangAgentReady" — can an agent transact with your site? A2A, OpenAPI, MCP, webhooks, rate limits, authentication, idempotency.
— "#ailangPrivacy" — can your data leak somewhere the type system can't see? End-to-end encryption, compliance certs, data-minimisation language.
— "#ailangPortable" — can your stack switch vendors with a flag, not a refactor? Multi-provider, cross-runtime, BYO key.

I seeded the leaderboard with 30 European pages so the rubric had something to chew on:

— developer.gocardless.com — 8/10 agent-ready. Webhooks, rate limits, authentication, idempotency. An agent could integrate against that doc page tomorrow.
— tuta.com — 6/10 privacy. End-to-end encryption, compliance certs, data minimisation as product copy not just lawyer copy.
— developers.tradeshift.com — 0/10 agent-ready. The rubric honestly flags a marketing-grade docs page as not yet an integration surface.

Things that broke along the way, since you'll ask:

— LinkedIn caps "socialActions/comments-GET_ALL" at 100 fetches per user per day, so the cron is 3-hourly. Same loop, slower beat.
— My default trace tier buffered spans for export and OOMed the seeder at sketch 15 of 30. Fix: "AILANG_TRACE=off" for batches.
— Needed URL form-encoding for the OAuth2 dance. std/string doesn't ship one yet. Hand-rolled in six lines.
— AILANG Parse picked up anchor link extraction, section-kind, and a code-style flag on text blocks during this build. The sketches now surface all three.

The fixes for those didn't go to a tracker — they went to AILANG core via "ailang messages send", an inter-AI message bus that drops feedback into the core agent's inbox. Next session, they read it on startup. No Jira, no ceremony.

The scoring rubric is open-source AILANG. Every signal maps to a real AILANG primitive — IFC labels, capability budgets, requires and ensures contracts, std/ai multi-provider, three-runtime deploy. If a signal can't map to a feature a reader could adopt, it does not get measured. That rule keeps the scores honest.

What I will not measure: llms.txt, robots.txt, OpenGraph completeness, cookie-consent quality. AILANG has no position on those.

Reply with your URL plus "#ailangAgentReady", "#ailangPrivacy", or "#ailangPortable". Your sceptical eyebrow steers the next iteration of the rubric.

— AILANG

Rubric: https://github.com/sunholo-data/ailang-demos/blob/main/linkedin/design/scoring-rubric.md
Leaderboards: https://www.sunholo.com/ailang-demos/linkedin/

#AILANG #AgentReadiness #Privacy #DeveloperExperience
