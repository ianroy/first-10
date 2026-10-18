import { useEffect, useId, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  ClipboardCheck,
  Compass,
  FileText,
  MapPin,
  MessageSquare,
  RotateCcw,
  Sprout,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { ChoiceId } from "@/lib/demo/studyloop";
import {
  marketingChannels,
  marketingPanels,
  marketingScenarios,
  sampleContent,
  sevenDayPlan,
  type MarketingChannelId,
} from "@/lib/demo/marketing";

const panelIcons = [Compass, MapPin, FileText, CalendarDays, ClipboardCheck];
const panelTitles = [
  "Start with your own thinking.",
  "Where could this audience be reached?",
  "Make a truthful invitation.",
  "A small plan for the next seven days.",
  "What would make you change the plan?",
];

/** Bundled teaching example: no network, analytics, AI or persistence. Key by choiceId when embedded. */
export function MarketingLabDemo({
  choiceId = "confirmations",
  onReset,
}: {
  choiceId?: ChoiceId;
  onReset?: () => void;
}) {
  const [resetKey, setResetKey] = useState(0);
  return (
    <MarketingBoard
      key={`${choiceId}-${resetKey}`}
      choiceId={choiceId}
      focusOnMount={resetKey > 0}
      resetLabel={onReset ? "Reset entire example" : "Reset marketing example"}
      onReset={() => {
        setResetKey((key) => key + 1);
        onReset?.();
      }}
    />
  );
}

function MarketingBoard({
  choiceId,
  onReset,
  focusOnMount,
  resetLabel,
}: {
  choiceId: ChoiceId;
  onReset: () => void;
  focusOnMount: boolean;
  resetLabel: string;
}) {
  const id = useId();
  const scenario = marketingScenarios[choiceId];
  const [panel, setPanel] = useState(0);
  const [thought, setThought] = useState("");
  const [sampleThinking, setSampleThinking] = useState(false);
  const [thinkingReady, setThinkingReady] = useState(false);
  const [channelId, setChannelId] = useState<MarketingChannelId>("club");
  const [draftOpen, setDraftOpen] = useState(false);
  const [peerNote, setPeerNote] = useState("");
  const [reflection, setReflection] = useState<"repeat" | "revise" | "stop" | null>(null);
  const [reason, setReason] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  const focusNext = useRef(focusOnMount);
  const channel = marketingChannels.find((item) => item.id === channelId)!;
  const fallback = marketingChannels.find((item) => item.id !== channelId)!;
  const originalThought = thought.trim() || scenario.firstThought;
  useEffect(() => {
    if (focusNext.current) {
      heading.current?.focus();
      focusNext.current = false;
    }
  }, [panel]);
  function openPanel(next: number) {
    focusNext.current = true;
    setPanel(next);
  }
  function begin() {
    setThinkingReady(true);
    openPanel(1);
  }

  return (
    <section id="marketing-lab" aria-label="$0 Marketing Lab example" className="scroll-mt-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-primary">
            <Sprout aria-hidden="true" className="size-5" />
            Next 50 · $0 Marketing Lab
          </p>
          <h3 className="mt-3 font-display text-2xl font-bold sm:text-3xl">
            A useful invitation. A test you can explain.
          </h3>
          <p className="mt-3 max-w-3xl text-muted-foreground">
            Carry your discovery decision into a reachable audience, a truthful message and a next
            decision.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={onReset}>
          <RotateCcw aria-hidden="true" />
          {resetLabel}
        </Button>
      </div>
      <div className="mt-5 rounded-xl border border-border bg-background p-4 sm:p-5">
        <p className="text-sm font-semibold text-primary">Audience from your discovery choice</p>
        <p className="mt-2 font-display text-xl font-bold sm:text-2xl">{scenario.audience}</p>
        <p className="mt-2 max-w-4xl text-sm leading-relaxed text-muted-foreground">
          {scenario.boundary}
        </p>
      </div>
      <p className="mt-4 rounded-lg bg-draft px-4 py-3 text-sm font-semibold text-draft-foreground">
        Fictional sample board · Proposed, not run · No posting, AI calls or saved data
      </p>
      <nav aria-label="Marketing board sections" className="mt-5">
        <ol className="grid grid-cols-5 gap-1 sm:gap-2">
          {marketingPanels.map((name, index) => {
            const Icon = panelIcons[index]!;
            return (
              <li key={name}>
                <button
                  type="button"
                  onClick={() => openPanel(index)}
                  disabled={index > 0 && !thinkingReady}
                  aria-current={panel === index ? "step" : undefined}
                  aria-controls={`${id}-panel`}
                  aria-label={`Marketing ${index + 1}. ${name}${index > 0 && !thinkingReady ? ". Start with a thought first" : ""}`}
                  className={`flex min-h-16 w-full flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 text-xs font-semibold sm:flex-row sm:gap-2 sm:text-sm ${panel === index ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-secondary"} disabled:cursor-not-allowed disabled:hover:bg-muted`}
                >
                  <Icon aria-hidden="true" className="size-4" />
                  {name}
                </button>
              </li>
            );
          })}
        </ol>
      </nav>
      <div className="mt-5 grid overflow-hidden rounded-2xl border border-border lg:grid-cols-[minmax(0,0.65fr)_minmax(0,1.65fr)]">
        <aside className="border-b border-border bg-background p-5 lg:border-r lg:border-b-0">
          <p className="text-sm font-semibold text-primary">One useful action</p>
          <p className="mt-2 leading-relaxed">{scenario.usefulAction}</p>
          <div className="mt-5 border-t border-border pt-4">
            <p className="font-display text-3xl font-bold">
              $0{" "}
              <span className="font-sans text-sm font-semibold text-muted-foreground">
                new cash
              </span>
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Proposed ceiling: 3 team-hours. Time and access are limited; simplify the plan if it
              will not fit.
            </p>
          </div>
          {thinkingReady && (
            <details className="mt-5 rounded-lg border border-border bg-card p-3">
              <summary className="min-h-11 cursor-pointer content-center font-semibold text-primary">
                Starting thought
              </summary>
              <p className="mt-2 text-xs font-semibold text-muted-foreground">
                {thought.trim()
                  ? "Your practice note · Only in this tab"
                  : "Fictional student thinking"}
              </p>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{originalThought}</p>
            </details>
          )}
        </aside>
        <div id={`${id}-panel`} aria-labelledby={`${id}-heading`} className="min-w-0 p-5 sm:p-7">
          <p className="text-sm font-semibold text-primary">
            Board {panel + 1} of 5 · {marketingPanels[panel]}
          </p>
          <h4
            id={`${id}-heading`}
            ref={heading}
            tabIndex={-1}
            className="mt-2 scroll-mt-6 rounded-sm font-display text-2xl font-bold leading-tight sm:text-3xl"
          >
            {panelTitles[panel]}
          </h4>
          <div className="mt-5">
            {panel === 0 && (
              <>
                <p className="text-muted-foreground">
                  Before looking at channels, where would you look for these people—and why? Keep
                  your first thought to compare with the plan later.
                </p>
                <label htmlFor={`${id}-thought`} className="mt-5 block font-semibold">
                  Your first thought{" "}
                  <span className="font-normal text-muted-foreground">(optional practice)</span>
                </label>
                <Textarea
                  id={`${id}-thought`}
                  value={thought}
                  maxLength={600}
                  onChange={(event) => setThought(event.target.value)}
                  placeholder="A place to investigate, and why it may fit…"
                  className="mt-2 min-h-28"
                />
                <p className="mt-2 text-sm text-muted-foreground">
                  Only in this example. It is cleared by reset, refresh or leaving the test.
                </p>
                <div className="mt-5 rounded-xl border border-border bg-background p-4">
                  <Button
                    variant="ghost"
                    onClick={() => setSampleThinking(!sampleThinking)}
                    aria-expanded={sampleThinking}
                    aria-controls={`${id}-sample-thought`}
                    className="h-auto w-full justify-start whitespace-normal px-0 text-left"
                  >
                    {sampleThinking ? "Hide" : "View"} fictional student thinking{" "}
                    <ArrowRight aria-hidden="true" />
                  </Button>
                  {sampleThinking && (
                    <p id={`${id}-sample-thought`} className="mt-2 leading-relaxed">
                      {scenario.firstThought}
                    </p>
                  )}
                </div>
                <p className="mt-4 text-sm text-muted-foreground">
                  This sample illustrates student-led thinking before a scaffold. It is not proof of
                  anyone’s independent authorship.
                </p>
              </>
            )}
            {panel === 1 && (
              <>
                <p className="text-muted-foreground">
                  Choose a primary route. Keep the other as an alternative to investigate, with its
                  own permission check.
                </p>
                <fieldset className="mt-5 grid gap-3 sm:grid-cols-2">
                  <legend className="sr-only">Primary marketing channel</legend>
                  {marketingChannels.map((item) => (
                    <label
                      key={item.id}
                      className={`cursor-pointer rounded-xl border-2 p-4 ${item.id === channelId ? "border-primary bg-secondary text-secondary-foreground" : "border-border bg-card"}`}
                    >
                      <span className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold uppercase tracking-wider">
                          {item.medium}
                        </span>
                        <input
                          type="radio"
                          name={`${id}-channel`}
                          value={item.id}
                          checked={item.id === channelId}
                          onChange={() => {
                            setChannelId(item.id);
                            setDraftOpen(false);
                            setPeerNote("");
                            setReflection(null);
                            setReason("");
                          }}
                          className="size-5 accent-primary"
                        />
                      </span>
                      <span className="mt-3 block font-display text-xl font-bold">{item.name}</span>
                      <span className="mt-2 block text-sm leading-relaxed">{item.fit}</span>
                      <span className="mt-3 block border-t border-current/20 pt-3 text-sm font-semibold">
                        {item.id === channelId ? "Primary route" : "Alternative route"}
                      </span>
                    </label>
                  ))}
                </fieldset>
                <dl className="mt-5 grid gap-4 sm:grid-cols-2">
                  <div>
                    <dt className="font-semibold">Exact place / link</dt>
                    <dd className="mt-1 text-muted-foreground">
                      {channel.place}. No venue or URL verified.
                    </dd>
                  </div>
                  <div>
                    <dt className="font-semibold">Access</dt>
                    <dd className="mt-1 text-muted-foreground">{channel.access}.</dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="font-semibold">Before reaching out</dt>
                    <dd className="mt-1 text-muted-foreground">{channel.question}</dd>
                  </div>
                </dl>
                <p className="mt-5 rounded-lg bg-background p-4 text-sm">
                  {channel.effort}. {channel.resource}
                </p>
              </>
            )}
            {panel === 2 && (
              <>
                <div className="flex flex-wrap gap-2 text-sm font-semibold">
                  <span className="rounded-full bg-secondary px-3 py-1 text-secondary-foreground">
                    {channel.name}
                  </span>
                  <span className="rounded-full bg-draft px-3 py-1 text-draft-foreground">
                    Sample draft · Human review needed
                  </span>
                </div>
                <p className="mt-4 text-muted-foreground">
                  {channel.format}. One hook, a truthful explanation and one useful action. No
                  promise of better attendance or proven demand.
                </p>
                <Button
                  className="mt-5"
                  onClick={() => setDraftOpen(!draftOpen)}
                  aria-expanded={draftOpen}
                  aria-controls={`${id}-draft`}
                >
                  {draftOpen ? "Hide sample draft" : "View sample draft"}{" "}
                  <FileText aria-hidden="true" />
                </Button>
                {draftOpen && (
                  <article
                    id={`${id}-draft`}
                    aria-label="Sample invitation draft"
                    className="mt-5 rounded-xl border border-border bg-background p-5"
                  >
                    <p className="text-xs font-bold uppercase tracking-widest text-primary">
                      Sample draft · Authored example
                    </p>
                    <p className="mt-3 whitespace-pre-wrap leading-relaxed">
                      {sampleContent(choiceId, channelId)}
                    </p>
                  </article>
                )}
                <div className="mt-5 border-l-4 border-primary pl-4">
                  <p className="font-semibold">Destination still to choose</p>
                  <p className="mt-2 text-muted-foreground">
                    A consent-based reply route controlled by the student team. This demo has no
                    live form, posting button or contact address. Replace placeholders and test the
                    destination before any real invitation.
                  </p>
                </div>
                <details className="mt-5 rounded-lg border border-border p-4">
                  <summary className="min-h-11 cursor-pointer content-center font-semibold text-primary">
                    Human review before sharing
                  </summary>
                  <ul className="mt-3 list-disc space-y-2 pl-5 text-muted-foreground">
                    <li>Is the audience specific and the invitation truthful?</li>
                    <li>Is the student team’s role clear?</li>
                    <li>Do the venue’s rules and permissions allow it?</li>
                    <li>Does the destination work, and can someone decline easily?</li>
                  </ul>
                </details>
              </>
            )}
            {panel === 3 && (
              <>
                <p className="text-muted-foreground">
                  A proposed recruitment/research week. A confirmation trial, if agreed, gets its
                  own full week afterward. Nothing here is marked complete.
                </p>
                <ol className="mt-5 space-y-4">
                  {sevenDayPlan(choiceId, channelId).map((task) => (
                    <li key={task.day} className="flex gap-3 rounded-xl bg-background p-4">
                      <span
                        className="flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary font-bold text-secondary-foreground"
                        aria-label={`Day ${task.day}`}
                      >
                        {task.day}
                      </span>
                      <div>
                        <p className="font-semibold">{task.title}</p>
                        <p className="mt-1 text-sm font-semibold text-primary">
                          Proposed · {task.owner}
                        </p>
                        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                          {task.done}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
                <p className="mt-5 text-sm text-muted-foreground">
                  Alternative: {fallback.name}. Investigate its rules before switching. No
                  permission means pause, not a reason to post elsewhere uninvited.
                </p>
              </>
            )}
            {panel === 4 && (
              <>
                <p className="text-muted-foreground">
                  The plan ends with a decision, not a vanity metric. All values below are unknown
                  because this fictional test has not run.
                </p>
                <div className="mt-5 overflow-hidden rounded-xl border border-border">
                  <table className="w-full text-left text-sm">
                    <caption className="bg-background px-4 py-3 text-left font-semibold">
                      Proposed manual measures · {channel.name}
                    </caption>
                    <thead className="border-y border-border">
                      <tr>
                        <th scope="col" className="px-4 py-3">
                          Funnel step
                        </th>
                        <th scope="col" className="px-4 py-3">
                          Result
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        "Relevant reach",
                        "Visits / conversation starts",
                        "Useful action",
                        "Return",
                        "Referral",
                      ].map((metric) => (
                        <tr key={metric} className="border-b border-border last:border-0">
                          <th scope="row" className="px-4 py-3 font-normal">
                            {metric}
                          </th>
                          <td className="px-4 py-3 font-semibold text-muted-foreground">
                            Not measured
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-4 rounded-lg bg-secondary p-4 text-sm leading-relaxed text-secondary-foreground">
                  <strong>Useful action:</strong> {scenario.measurement}
                </p>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  Record source, dates, unit and cohort manually. Keep peers, classmates and outside
                  participants separate; use unique people where appropriate. Unknown is not zero.
                  Do not calculate a conversion rate without a known, comparable denominator and a
                  confirmed subset.
                </p>
                <div className="mt-6 rounded-xl border border-border p-4">
                  <h5 className="flex items-center gap-2 font-semibold">
                    <MessageSquare aria-hidden="true" className="size-5 text-primary" />
                    Peer walkthrough · Still to do
                  </h5>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Ask a peer: Who is this for? What would you do next? Where do you hesitate?
                    Observe their action, then revise. No peer review has happened here.
                  </p>
                  <label htmlFor={`${id}-peer`} className="mt-4 block text-sm font-semibold">
                    What might a peer misunderstand? (practice note)
                  </label>
                  <Textarea
                    id={`${id}-peer`}
                    value={peerNote}
                    onChange={(event) => setPeerNote(event.target.value)}
                    maxLength={400}
                    className="mt-2"
                  />
                </div>
                <fieldset className="mt-6">
                  <legend className="font-semibold">Explore a possible next decision</legend>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Choose to inspect a criterion, not to record an outcome.
                  </p>
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {(["repeat", "revise", "stop"] as const).map((decision) => (
                      <label
                        key={decision}
                        className={`flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-lg border px-2 text-sm font-semibold capitalize ${reflection === decision ? "border-primary bg-secondary text-secondary-foreground" : "border-input"}`}
                      >
                        <input
                          type="radio"
                          name={`${id}-reflection`}
                          checked={reflection === decision}
                          onChange={() => setReflection(decision)}
                          className="size-4 accent-primary"
                        />
                        {decision}
                      </label>
                    ))}
                  </div>
                </fieldset>
                {reflection && (
                  <p role="status" className="mt-3 rounded-lg bg-background p-4 leading-relaxed">
                    {scenario[reflection]}
                  </p>
                )}
                <label htmlFor={`${id}-reason`} className="mt-5 block font-semibold">
                  What evidence would support that choice?
                </label>
                <Textarea
                  id={`${id}-reason`}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  maxLength={500}
                  placeholder="I would change the plan if…"
                  className="mt-2"
                />
                <p className="mt-3 text-sm text-muted-foreground">
                  Reflection practice only. Your notes are not saved or sent anywhere.
                </p>
              </>
            )}
          </div>
          <div className="mt-7 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
            <Button variant="ghost" onClick={() => openPanel(panel - 1)} disabled={panel === 0}>
              <ArrowLeft aria-hidden="true" />
              Previous board
            </Button>
            {panel === 0 ? (
              <Button onClick={begin} disabled={!thought.trim() && !sampleThinking}>
                Explore channels <ArrowRight aria-hidden="true" />
              </Button>
            ) : panel < 4 ? (
              <Button onClick={() => openPanel(panel + 1)}>
                Next: {marketingPanels[panel + 1]} <ArrowRight aria-hidden="true" />
              </Button>
            ) : (
              <Button variant="outline" onClick={() => openPanel(0)}>
                Revisit starting thought <ArrowLeft aria-hidden="true" />
              </Button>
            )}
          </div>
        </div>
      </div>
      <p className="mt-4 text-sm text-muted-foreground">
        This public example stays separate from your work. A saved manual Marketing Lab is available
        in the signed-in app at Stage 2. “Next 50” names a learning stage, not a promise of 50
        customers.
      </p>
    </section>
  );
}
