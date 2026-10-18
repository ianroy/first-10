# Interview guide: student founders (R0-004)

Goal: learn how student founders *actually* went from "I built it" to talking with customers, and where they got stuck. Tests A1-A6 and VP1, VP2, VP4, VP5 ([value-prop.md](../value-prop.md)).

**Do not pitch First Ten.** If they ask what you're working on, say so briefly *after* the last question. Once you describe your idea, they stop talking about their problems.

## Who to recruit (5-8)

- Students who have built or launched something (app, site, product, service), or are building now.
- Aim for a mix: at least 2 doing it **for a course** and at least 2 doing it **on their own** (needed for VP4).
- At least 1 who launched and got almost no users (the core case).
- Avoid close friends when you can; if you use them, tag the note `friend`.

## Before you start

- 15-20 minutes, in person or video. Bring First Ten on your phone and use interview mode to take notes (dogfooding).
- Say: "Is it okay if I take a few notes? I won't use your name, and I'll only use first names or roles in what I write up." Tick the consent box only if they say yes.

## Questions (past behavior only)

Ask in order; skip any that are already answered. Follow-ups: "Tell me more about that." "When was the last time?" "What happened next?" "Why was that hard?"

| # | Question | Tests |
|---|---|---|
| F1 | Tell me about the last thing you built or started. Where is it now? | Context |
| F2 | When you finished building it, what did you do next to get people using it? Walk me through that first week. | A1, VP2 |
| F3 | Who was the first person outside your friends who tried it? How did that happen? | A1, A4 |
| F4 | Think of a time you meant to reach out to someone about it and didn't. What got in the way? | VP2 |
| F5 | What did the people you talked to say? And what did they *do* afterwards? | A2 |
| F6 | How did you decide whether people really wanted it? When did you feel sure, or unsure? | A6, VP1 |
| F7 | Did anyone give you more than words: their time again, an intro to someone, money, or using it more than once? Tell me about that. If not, what could someone have given you? | VP5 |
| F8 | Who has asked to see what you learned, like an instructor, a teammate, an investor or family? What did you show them? | VP1 |
| F9 | What have you used to help with finding or talking to customers: books, videos, templates, mentors, AI? What happened the last time you used it? | A3, A5, alternatives |
| F10 | When did you last ask an AI for feedback on your idea? What did it say, and what did you do with it? | A5, Devil's Advocate |
| F11 | Was this for a class or on your own? What deadlines or check-ins kept you going, or didn't? | VP4 |
| F12 | Who else should I talk to about this? | Referral |

**Closing ask (a small commitment, not a question)**: "Could I check back in with you in two weeks to hear how it's going?" Note whether they say yes, offer a time, or deflect.

## What to listen for

- **Behavior beats opinion.** "I posted in two Discords and got no replies" is evidence. "I'd totally use a tool like that" is not; don't record it as support.
- **Emotion words** around reaching out (awkward, scared, cringe, spammy): VP2.
- **An audience for proof** (an instructor's checkpoint, a pitch, a co-founder): VP1.
- **Commitments** they got or gave: VP5.
- **Workarounds** (spreadsheets, notes apps, ChatGPT threads): alternatives and switching cost.

## Note template

Copy into `research/interviews/YYYY-MM-DD-founder-<firstname-or-role>.md`.

```markdown
# Founder interview: <first name or role>, <date>

- Segment: student founder · Context: course | self-directed · Stage: idea | building | launched, no users | first users
- Recruited via: <how> · Friend? yes/no · Consent to notes: yes
- Interviewer:

## What they did (behavior, in order)
-

## Quotes (exact words, at most 3, no names)
- ""

## Commitments observed
- During the interview (closing ask):
- From their own customers (F7):

## Hypotheses
| ID | Supports / Contradicts / No signal | Evidence (question #, short paraphrase) |
|---|---|---|
| A1 | | |
| A2 | | |
| A3 | | |
| A5 | | |
| A6 | | |
| VP1 | | |
| VP2 | | |
| VP4 | | |
| VP5 | | |

## Surprises (things we didn't expect)
-

## Referrals and follow-ups
-
```

## After each interview

1. Write the note the same day (10 minutes).
2. Update the tally in `research/interviews/README.md` (count of supports and contradicts per hypothesis).
3. After 5 interviews, the agent runs R0-005 synthesis.
