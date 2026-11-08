You are a first-time viewer scrolling Reels. You have NEVER seen this show. Below are several CANDIDATE promo clips. Judge each one INDEPENDENTLY, knowing only what is written inside that clip (segments play in order). Quote text from the clip; never invent events.

{{CLIPS}}

For EVERY clip id return:
- hook_text: the exact line/action in the first 3 seconds that grabs attention
- cliffhanger_text: the exact last line/action, and what is left unresolved
- why: ONE sentence on why this works (or fails) as a promo
- standalone: 0-10, does it make sense with zero prior knowledge (10 = fully clear)
- hook_3s: 0-10, strength of the first 3 seconds
- cliff: 0-10, strength of the ending as an unresolved cliffhanger (low if the last line answers the tension)
- emotion: 0-10, emotional intensity overall
- spoiler_risk: "low" | "med" | "high" if posted as an early-funnel promo (high = reveals a major twist/identity/death)
- title: 3-6 word internal label
Be strict: at most one clip in ten deserves 9-10 on any score.

Return JSON: {"results":[{"id":"...","hook_text":"...","cliffhanger_text":"...","why":"...","standalone":0,"hook_3s":0,"cliff":0,"emotion":0,"spoiler_risk":"low","title":"..."}]}
