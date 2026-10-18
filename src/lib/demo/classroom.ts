/** Authored classroom examples only. These are not people, memberships or submitted work. */
export const CLASSROOM_DEMO_PROJECT_ID = "f1d00000-0000-4000-8000-000000000010";
export const classroomExamples = [
  {
    id: "studyloop",
    name: "StudyLoop",
    initials: "SL",
    idea: "Study-group coordination",
    focus: "Reframing the problem",
    principle: "Evidence includes disagreement",
    firstThinking: "We thought students needed an easier way to find more study partners.",
    observation:
      "In the authored case, Maya describes uncertainty about who will show up. Owen describes last-minute coordination messages.",
    assumption:
      "Attendance uncertainty might be more important than finding new people for some existing groups.",
    counterexample:
      "Nora already has a reliable group and does not want another app. Priya describes a routine that works when attendance is clear.",
    decision:
      "Investigate coordination in existing groups before building a broader matching service.",
    nextStep:
      "Propose a consenting conversation about the last missed or changed study session. Compare an app with a clearer group agreement.",
    workExcerpt:
      "Our first idea was matching. Our next question is about coordination. Nora’s example makes us narrow the audience instead of claiming every student needs this.",
    prompts: [
      "Which words are observations, and which are your interpretation?",
      "What would make you stop building and try a simpler agreement?",
    ],
  },
  {
    id: "campusswap",
    name: "CampusSwap",
    initials: "CS",
    idea: "Second-hand course supplies",
    focus: "Checking channel access",
    principle: "A useful action before a growth target",
    firstThinking: "We planned to post a marketplace invitation in every campus group.",
    observation:
      "An authored peer walkthrough finds the invitation clear, but the destination and organizer permission are still unspecified.",
    assumption:
      "A course-specific group may reach students looking for the same supplies at the same time.",
    counterexample:
      "A fictional student already borrows materials from a friend. More listings would not necessarily change that routine.",
    decision:
      "Ask one organizer about the rules before choosing the group as a channel. Keep a permitted physical notice as an alternative.",
    nextStep:
      "Draft a permission request and one truthful invitation to discuss a recent attempt to borrow or buy supplies. Leave response counts unknown.",
    workExcerpt:
      "Our channel is only a proposal. We have not received permission or posted anything. We will learn about a recent workaround before asking anyone to sign up.",
    prompts: [
      "What access do you have, and what still needs permission?",
      "Can a peer identify one useful action without your explanation?",
    ],
  },
  {
    id: "quietspace",
    name: "QuietSpace",
    initials: "QS",
    idea: "Finding a place to focus",
    focus: "Separating cause from symptom",
    principle: "Ask about a recent episode",
    firstThinking: "We assumed students wanted a live map of available quiet seats.",
    observation:
      "An authored interview note describes a noisy room during one afternoon. It does not establish how often this happens or whether the room was full.",
    assumption:
      "Uncertainty about noise, rather than seat availability, could be the relevant problem.",
    counterexample:
      "Another fictional perspective uses a predictable early-morning routine and does not look for a new tool.",
    decision:
      "Keep noise and availability as competing explanations. Rewrite the question to avoid pitching a map.",
    nextStep:
      "Ask: ‘Tell me about the last time you changed where you worked. What happened, and what did you do next?’",
    workExcerpt:
      "One frustrating afternoon is a source, not a pattern. We need to understand when the current workaround fails and when it works well.",
    prompts: [
      "What did this person actually describe, and what are you adding?",
      "How could the next question distinguish noise from seat availability?",
    ],
  },
  {
    id: "tutorlink",
    name: "TutorLink",
    initials: "TL",
    idea: "Reaching peer learning support",
    focus: "Revising an invitation",
    principle: "Feedback changes the next attempt",
    firstThinking:
      "We wrote a polished invitation that promised students would improve their grades.",
    observation:
      "In an authored peer check, the reader notices the grade claim but cannot tell whether the next step is research or a tutoring booking.",
    assumption:
      "A clearer invitation may help relevant students decide whether to discuss a recent help-seeking experience.",
    counterexample:
      "A fictional student is comfortable using existing office hours. Their current route may already meet their needs.",
    decision:
      "Remove the unsupported grade promise. Describe the team as exploring an untested idea and separate research from a service offer.",
    nextStep:
      "Ask a new peer to explain who the revised message is for and what action it invites. Record confusion before making another revision.",
    workExcerpt:
      "We changed ‘get better grades’ to ‘help us understand how you found support last time.’ We have no learning-outcome evidence and have not run a field test.",
    prompts: [
      "Which claim can you support, and which should you remove?",
      "What exactly changed because of the peer’s observed response?",
    ],
  },
] as const;
export type ClassroomExampleId = (typeof classroomExamples)[number]["id"];
