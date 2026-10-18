import { Button } from "@/components/ui/button";
import { GuestField, GuestSelect } from "@/components/guest/GuestFields";
import {
  guestMarketingSqlShape,
  type GuestMarketingDocument as Doc,
} from "@/lib/guest-marketing/contracts";
type SqlShape = {
  type: string;
  properties?: Record<string, SqlShape>;
  items?: SqlShape;
  maxLength?: number;
};
const rootShape = guestMarketingSqlShape() as SqlShape;
function objectShape(object: object, shape: SqlShape = rootShape): SqlShape | null {
  if (
    shape.type === "object" &&
    shape.properties &&
    Object.keys(object).length === Object.keys(shape.properties).length &&
    Object.keys(object).every((k) => k in shape.properties!)
  )
    return shape;
  for (const child of Object.values(shape.properties ?? {})) {
    const found = objectShape(object, child);
    if (found) return found;
  }
  return shape.items ? objectShape(object, shape.items) : null;
}
type Props = { document: Doc; step: number; update: (f: (d: Doc) => void) => void };
const uid = () => crypto.randomUUID();
const fieldClass = "min-h-11 w-full rounded-lg border bg-background px-3";
function NumberField({
  label,
  value,
  set,
}: {
  label: string;
  value: number | null;
  set: (v: number | null) => void;
}) {
  return (
    <label className="block space-y-2 text-sm font-semibold">
      {label}
      <input
        className={fieldClass}
        type="number"
        min="0"
        max="1000000"
        step="1"
        value={value ?? ""}
        placeholder="Unknown"
        onChange={(e) => {
          const v = e.target.value;
          if (v === "") set(null);
          else if (Number.isInteger(Number(v)) && Number(v) >= 0 && Number(v) <= 1000000)
            set(Number(v));
        }}
      />
    </label>
  );
}
function DateField({
  label,
  value,
  set,
}: {
  label: string;
  value: string | null;
  set: (v: string | null) => void;
}) {
  return (
    <label className="block space-y-2 text-sm font-semibold">
      {label}
      <input
        className={fieldClass}
        type="date"
        value={value ?? ""}
        onChange={(e) => set(e.target.value || null)}
      />
    </label>
  );
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-5 rounded-2xl border bg-background/60 p-6">
      <h4 className="font-display text-xl font-bold">{title}</h4>
      {children}
    </section>
  );
}
export function MarketingSteps({ document: d, step, update }: Props) {
  function fields<T extends object>(
    object: T,
    labels: Partial<Record<keyof T, string>>,
    change: (k: keyof T, v: string) => void,
    disabled = false,
  ) {
    return Object.entries(labels).map(([key, label]) => (
      <GuestField
        key={key}
        label={label as string}
        value={String(object[key as keyof T] ?? "")}
        onChange={(v) => change(key as keyof T, v)}
        disabled={disabled}
        max={objectShape(object)?.properties?.[key]?.maxLength ?? 1000}
      />
    ));
  }
  function channelSelect(value: string | null, set: (v: string | null) => void, label = "Channel") {
    return (
      <GuestSelect label={label} value={value ?? ""} onChange={(v) => set(v || null)}>
        <option value="">Choose a channel</option>
        {d.channels.map((c, i) => (
          <option key={c.id} value={c.id}>
            {c.name || `Channel ${i + 1}`}
          </option>
        ))}
      </GuestSelect>
    );
  }
  if (step === 0)
    return (
      <div className="space-y-6">
        <Section title="Think before you ask a tool">
          <p className="text-sm text-muted-foreground">
            Start from what you noticed and who you can reach. A channel is a place where people
            already spend time. Preserve your first thinking, then refine it below. No AI or outside
            data is used.
          </p>
          {fields(
            d.thinking,
            {
              observations: "What have you observed?",
              reachableAudience: "Who can you reach without spending money?",
              usefulAction: "What useful action could someone try?",
              channelIdeas: "Your own physical and digital channel ideas",
            },
            (k, v) =>
              update((x) => {
                Object.assign(x.thinking, { [k]: v });
              }),
            !!d.thinking.completedAt,
          )}
          {d.thinking.completedAt ? (
            <p className="text-sm font-semibold">
              First thinking preserved at {d.thinking.completedAt}. Later steps remain editable.
            </p>
          ) : (
            <Button
              variant="outline"
              disabled={
                ![
                  d.thinking.observations,
                  d.thinking.reachableAudience,
                  d.thinking.usefulAction,
                  d.thinking.channelIdeas,
                ].every((v) => v.trim())
              }
              onClick={() =>
                update((x) => {
                  x.thinking.completedAt = new Date().toISOString();
                })
              }
            >
              Preserve first thinking
            </Button>
          )}
        </Section>
        <Section title="A specific audience and honest promise">
          {fields(
            d.audience,
            {
              beachhead: "Beachhead audience",
              situation: "When does this problem happen?",
              valueProposition: "Value proposition: useful change for this audience",
              assumptions: "What are you assuming?",
              sourceNotes: "Source notes and limits — no private participant notes",
            },
            (k, v) =>
              update((x) => {
                Object.assign(x.audience, { [k]: v });
              }),
          )}
        </Section>
      </div>
    );
  if (step === 1)
    return (
      <div className="space-y-6">
        <p className="text-sm text-muted-foreground">
          Map access before making content. Being online does not mean a community permits
          promotion. Do not paste private interview notes into a team plan.
        </p>
        {d.channels.map((c, i) => (
          <Section key={c.id} title={`Channel ${i + 1}`}>
            <div className="grid gap-5 lg:grid-cols-2">
              {fields(
                c,
                {
                  name: "Channel name",
                  place: "Where people gather / public link",
                  observation: "What have you observed here?",
                  fitReason: "Why this audience and channel fit",
                  rules: "Channel rules / permission needed",
                  sourceNote: "Where did you check the rules?",
                  unknowns: "Unknowns and response bias",
                },
                (k, v) =>
                  update((x) => {
                    Object.assign(x.channels[i]!, { [k]: v });
                  }),
              )}
              <GuestSelect
                label="Physical or digital"
                value={c.medium}
                onChange={(v) =>
                  update((x) => {
                    x.channels[i]!.medium = v as typeof c.medium;
                  })
                }
              >
                <option value="physical">Physical</option>
                <option value="digital">Digital</option>
              </GuestSelect>
              <GuestSelect
                label="Channel access"
                value={c.access}
                onChange={(v) =>
                  update((x) => {
                    x.channels[i]!.access = v as typeof c.access;
                  })
                }
              >
                {[
                  "unknown",
                  "needs_permission",
                  "requested",
                  "allowed",
                  "not_required",
                  "denied",
                ].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </GuestSelect>
              <DateField
                label="Rules checked on"
                value={c.checkedOn}
                set={(v) =>
                  update((x) => {
                    x.channels[i]!.checkedOn = v;
                  })
                }
              />
              <NumberField
                label="Estimated minutes for this channel"
                value={c.estimatedMinutes}
                set={(v) =>
                  update((x) => {
                    x.channels[i]!.estimatedMinutes = v;
                  })
                }
              />
            </div>
          </Section>
        ))}
        <Button
          variant="outline"
          disabled={d.channels.length >= 12}
          onClick={() =>
            update((x) => {
              x.channels.push({
                id: uid(),
                name: "",
                medium: "physical",
                place: "",
                observation: "",
                fitReason: "",
                access: "unknown",
                rules: "",
                sourceNote: "",
                checkedOn: null,
                estimatedMinutes: null,
                unknowns: "",
              });
            })
          }
        >
          Add channel
        </Button>
        <Section title="Choose one first test">
          <div className="grid gap-5 lg:grid-cols-2">
            {channelSelect(
              d.primaryChannelId,
              (v) =>
                update((x) => {
                  x.primaryChannelId = v;
                }),
              "Primary channel",
            )}
            {channelSelect(
              d.alternativeChannelId,
              (v) =>
                update((x) => {
                  x.alternativeChannelId = v;
                }),
              "Alternative channel",
            )}
          </div>
          <GuestField
            label="Why start here, and what would change your choice?"
            value={d.selectionReason}
            onChange={(v) =>
              update((x) => {
                x.selectionReason = v;
              })
            }
            max={1500}
          />
        </Section>
      </div>
    );
  if (step === 2)
    return (
      <div className="space-y-6">
        <p className="text-sm text-muted-foreground">
          Make a useful, truthful invitation. Review it with a peer or walk through it yourself.
          Downloads and saved statuses never send messages or publish content.
        </p>
        {d.content.map((a, i) => (
          <Section key={a.id} title={`Content ${i + 1}`}>
            <div className="grid gap-5 lg:grid-cols-2">
              {channelSelect(
                a.channelId,
                (v) => {
                  if (v)
                    update((x) => {
                      x.content[i]!.channelId = v;
                      x.content[i]!.review.accessChecked = false;
                    });
                },
                "Content channel",
              )}
              <GuestSelect
                label="Content format"
                value={a.format}
                onChange={(v) =>
                  update((x) => {
                    x.content[i]!.format = v as typeof a.format;
                  })
                }
              >
                {[
                  "community_post",
                  "organizer_email",
                  "dm",
                  "social_caption",
                  "flyer",
                  "demo_script",
                ].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </GuestSelect>
              {fields(
                a,
                {
                  hook: "Hook in your own words",
                  truthfulSupport: "Truthful support and limitations",
                  body: "Content draft / product demo script",
                  builderDisclosure: "How you disclose that you are building this",
                  callToAction: "One clear call to action",
                  destination: "Destination — check before sharing",
                  firstUsefulAction: "First useful product action",
                },
                (k, v) =>
                  update((x) => {
                    Object.assign(x.content[i]!, { [k]: v });
                    x.content[i]!.review = {
                      truthful: false,
                      builderDisclosed: false,
                      accessChecked: false,
                      destinationChecked: false,
                    };
                  }),
              )}
            </div>
            <fieldset className="grid gap-3 md:grid-cols-2">
              <legend className="mb-3 text-sm font-semibold">
                Your reported review, not independent verification
              </legend>
              {(Object.keys(a.review) as Array<keyof typeof a.review>).map((k) => (
                <label key={k} className="flex min-h-11 items-center gap-3 text-sm">
                  <input
                    type="checkbox"
                    checked={a.review[k]}
                    onChange={(e) =>
                      update((x) => {
                        x.content[i]!.review[k] = e.target.checked;
                      })
                    }
                  />
                  {
                    {
                      truthful: "Claims are truthful",
                      builderDisclosed: "Builder relationship disclosed",
                      accessChecked: "Channel access checked",
                      destinationChecked: "Destination checked",
                    }[k]
                  }
                </label>
              ))}
            </fieldset>
            <GuestSelect
              label="Walkthrough mode"
              value={a.walkthrough.mode}
              onChange={(v) =>
                update((x) => {
                  x.content[i]!.walkthrough.mode = v as typeof a.walkthrough.mode;
                })
              }
            >
              {["unknown", "self", "peer"].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </GuestSelect>
            {fields(
              a.walkthrough,
              {
                understoodAudience: "Who did the reader think this was for?",
                actionObserved: "What action did you actually observe?",
                hesitation: "Where did the reader hesitate?",
                revision: "What will you revise after the walkthrough?",
              },
              (k, v) =>
                update((x) => {
                  Object.assign(x.content[i]!.walkthrough, { [k]: v });
                }),
            )}
          </Section>
        ))}
        <Button
          variant="outline"
          disabled={!d.channels.length || d.content.length >= 20}
          onClick={() =>
            update((x) => {
              x.content.push({
                id: uid(),
                channelId: x.primaryChannelId ?? x.channels[0]!.id,
                format: "community_post",
                hook: "",
                truthfulSupport: "",
                body: "",
                builderDisclosure: "",
                callToAction: "",
                destination: "",
                firstUsefulAction: "",
                review: {
                  truthful: false,
                  builderDisclosed: false,
                  accessChecked: false,
                  destinationChecked: false,
                },
                walkthrough: {
                  mode: "unknown",
                  understoodAudience: "",
                  actionObserved: "",
                  hesitation: "",
                  revision: "",
                },
              });
            })
          }
        >
          Add content draft
        </Button>
        <h4 className="font-display text-xl font-bold">Respectful outreach drafts</h4>
        {d.outreach.map((a, i) => (
          <Section key={a.id} title={`Outreach ${i + 1}`}>
            <div className="grid gap-5 lg:grid-cols-2">
              {channelSelect(
                a.channelId,
                (v) => {
                  if (v)
                    update((x) => {
                      x.outreach[i]!.channelId = v;
                    });
                },
                "Outreach channel",
              )}
              {fields(
                a,
                {
                  recipientRole: "Recipient role / alias — avoid personal contact details",
                  subject: "Outreach subject",
                  body: "Outreach message draft",
                  respectfulExit: "Easy way to say no",
                  observation: "What happened? Keep observation separate from hope",
                },
                (k, v) =>
                  update((x) => {
                    Object.assign(x.outreach[i]!, { [k]: v });
                  }),
              )}
              <GuestSelect
                label="Outreach purpose"
                value={a.purpose}
                onChange={(v) =>
                  update((x) => {
                    x.outreach[i]!.purpose = v as typeof a.purpose;
                  })
                }
              >
                {["permission", "interview", "product_test", "follow_up"].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </GuestSelect>
              <GuestSelect
                label="Manually reported outreach status"
                value={a.status}
                onChange={(v) =>
                  update((x) => {
                    x.outreach[i]!.status = v as typeof a.status;
                  })
                }
              >
                {["draft", "reviewed", "manually_sent", "replied", "declined"].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </GuestSelect>
            </div>
          </Section>
        ))}
        <Button
          variant="outline"
          disabled={!d.channels.length || d.outreach.length >= 20}
          onClick={() =>
            update((x) => {
              x.outreach.push({
                id: uid(),
                channelId: x.primaryChannelId ?? x.channels[0]!.id,
                recipientRole: "",
                purpose: "permission",
                subject: "",
                body: "",
                respectfulExit: "",
                status: "draft",
                observation: "",
              });
            })
          }
        >
          Add outreach draft
        </Button>
      </div>
    );
  if (step === 3)
    return (
      <div className="space-y-6">
        <Section title="A $0 test with a useful learning goal">
          <p className="text-sm font-semibold">
            Cash budget: $0. Time, access and effort still have costs.
          </p>
          <div className="grid gap-5 lg:grid-cols-2">
            <NumberField
              label="Available minutes"
              value={d.resources.availableMinutes}
              set={(v) =>
                update((x) => {
                  x.resources.availableMinutes = v;
                })
              }
            />
            {fields(
              d.resources,
              {
                existingResources: "Resources you already have",
                limitations: "Time, access and resource limits",
                fallback: "Manual fallback if the plan cannot run",
              },
              (k, v) =>
                update((x) => {
                  Object.assign(x.resources, { [k]: v });
                }),
            )}
            {fields(
              d.test,
              {
                hypothesis: "Falsifiable channel test hypothesis",
                unknowns: "Unknown baseline or target — explain",
                measurementPlan: "How will you measure the useful action?",
                repeatIf: "Repeat if…",
                reviseIf: "Revise if…",
                stopIf: "Stop if…",
              },
              (k, v) =>
                update((x) => {
                  Object.assign(x.test, { [k]: v });
                }),
            )}
            <GuestSelect
              label="Primary metric"
              value={d.test.primaryMetric}
              onChange={(v) =>
                update((x) => {
                  x.test.primaryMetric = v as Doc["test"]["primaryMetric"];
                })
              }
            >
              {["relevant_reach", "visits", "useful_action", "return", "referral"].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </GuestSelect>
            <NumberField
              label="Baseline — blank means unknown"
              value={d.test.baseline}
              set={(v) =>
                update((x) => {
                  x.test.baseline = v;
                })
              }
            />
            <NumberField
              label="Target — blank means unknown"
              value={d.test.target}
              set={(v) =>
                update((x) => {
                  x.test.target = v;
                })
              }
            />
            <DateField
              label="Test start"
              value={d.test.startOn}
              set={(v) =>
                update((x) => {
                  x.test.startOn = v;
                })
              }
            />
            <DateField
              label="Test end"
              value={d.test.endOn}
              set={(v) =>
                update((x) => {
                  x.test.endOn = v;
                })
              }
            />
            <DateField
              label="Review date"
              value={d.test.reviewOn}
              set={(v) =>
                update((x) => {
                  x.test.reviewOn = v;
                })
              }
            />
            <GuestSelect
              label="Manually reported test state"
              value={d.test.state}
              onChange={(v) =>
                update((x) => {
                  x.test.state = v as Doc["test"]["state"];
                })
              }
            >
              {["draft", "ready_to_review", "running", "reviewed"].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </GuestSelect>
          </div>
        </Section>
        {d.test.tasks.map((a, i) => (
          <Section key={a.id} title={`Action ${i + 1}`}>
            <div className="grid gap-5 lg:grid-cols-2">
              {fields(
                a,
                {
                  title: "Action title",
                  ownerAlias: "Owner role / alias",
                  prerequisite: "What must happen first?",
                  doneMeans: "What counts as done?",
                  completionNote: "Observed completion / blocker",
                },
                (k, v) =>
                  update((x) => {
                    Object.assign(x.test.tasks[i]!, { [k]: v });
                  }),
              )}
              <DateField
                label="Action due date"
                value={a.dueOn}
                set={(v) =>
                  update((x) => {
                    x.test.tasks[i]!.dueOn = v;
                  })
                }
              />
              <GuestSelect
                label="Action status"
                value={a.status}
                onChange={(v) =>
                  update((x) => {
                    x.test.tasks[i]!.status = v as typeof a.status;
                  })
                }
              >
                {["todo", "doing", "done", "blocked"].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </GuestSelect>
            </div>
          </Section>
        ))}
        <Button
          variant="outline"
          disabled={d.test.tasks.length >= 30}
          onClick={() =>
            update((x) => {
              x.test.tasks.push({
                id: uid(),
                title: "",
                ownerAlias: "",
                dueOn: null,
                prerequisite: "",
                doneMeans: "",
                status: "todo",
                completionNote: "",
              });
            })
          }
        >
          Add test action
        </Button>
      </div>
    );
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Manual counts need a source, audience, time window and limits. Unknown is different from
        zero. These records do not enable analytics or prove demand; no conversion rate is inferred
        from incompatible counts.
      </p>
      {d.measurements.map((m, i) => (
        <Section key={m.id} title={`Measurement ${i + 1}`}>
          <div className="grid gap-5 lg:grid-cols-2">
            {channelSelect(
              m.channelId,
              (v) => {
                if (v)
                  update((x) => {
                    x.measurements[i]!.channelId = v;
                    x.measurements[i]!.assetId = null;
                  });
              },
              "Measurement channel",
            )}
            <GuestSelect
              label="Measurement content"
              value={m.assetId ?? ""}
              onChange={(v) =>
                update((x) => {
                  x.measurements[i]!.assetId = v || null;
                })
              }
            >
              <option value="">Entire channel / unknown content</option>
              {d.content
                .filter((a) => a.channelId === m.channelId)
                .map((a, j) => (
                  <option key={a.id} value={a.id}>
                    Content {j + 1}: {a.hook || a.format}
                  </option>
                ))}
            </GuestSelect>
            {(["metric", "cohort", "unit"] as const).map((k) => (
              <GuestSelect
                key={k}
                label={`Measurement ${k}`}
                value={m[k]}
                onChange={(v) =>
                  update((x) => {
                    Object.assign(x.measurements[i]!, { [k]: v });
                  })
                }
              >
                {{
                  metric: ["relevant_reach", "visits", "useful_action", "return", "referral"],
                  cohort: ["peer_test", "classmate", "external", "automated", "mixed_unknown"],
                  unit: ["unique_people", "sessions", "events"],
                }[k].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </GuestSelect>
            ))}
            <NumberField
              label="Count — blank means unknown"
              value={m.count}
              set={(v) =>
                update((x) => {
                  x.measurements[i]!.count = v;
                })
              }
            />
            <DateField
              label="Inclusive window from"
              value={m.from}
              set={(v) =>
                update((x) => {
                  x.measurements[i]!.from = v ?? "";
                })
              }
            />
            <DateField
              label="Inclusive window to"
              value={m.to}
              set={(v) =>
                update((x) => {
                  x.measurements[i]!.to = v ?? "";
                })
              }
            />
            <DateField
              label="Measurement recorded on"
              value={m.recordedOn}
              set={(v) =>
                update((x) => {
                  x.measurements[i]!.recordedOn = v ?? "";
                })
              }
            />
            {fields(
              m,
              {
                source: "Measurement source — what did you actually count?",
                limitations: "Measurement limits and missing information",
              },
              (k, v) =>
                update((x) => {
                  Object.assign(x.measurements[i]!, { [k]: v });
                }),
            )}
          </div>
          <label className="flex min-h-11 items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={d.reflection.evidenceIds.includes(m.id)}
              onChange={(e) =>
                update((x) => {
                  x.reflection.evidenceIds = e.target.checked
                    ? [...x.reflection.evidenceIds, m.id]
                    : x.reflection.evidenceIds.filter((v) => v !== m.id);
                })
              }
            />
            Use this measurement when reflecting
          </label>
        </Section>
      ))}
      <Button
        variant="outline"
        disabled={!d.channels.length || d.measurements.length >= 40}
        onClick={() =>
          update((x) => {
            const today = new Date().toISOString().slice(0, 10);
            x.measurements.push({
              id: uid(),
              channelId: x.primaryChannelId ?? x.channels[0]!.id,
              assetId: null,
              metric: "useful_action",
              cohort: "mixed_unknown",
              from: today,
              to: today,
              unit: "unique_people",
              count: null,
              source: "",
              recordedOn: today,
              limitations: "",
            });
          })
        }
      >
        Add manual measurement
      </Button>
      <Section title="Repeat, revise or stop">
        <GuestSelect
          label="Your next decision"
          value={d.reflection.decision}
          onChange={(v) =>
            update((x) => {
              x.reflection.decision = v as Doc["reflection"]["decision"];
            })
          }
        >
          {["unknown", "repeat", "revise", "stop"].map((v) => (
            <option key={v}>{v}</option>
          ))}
        </GuestSelect>
        {fields(
          d.reflection,
          {
            learned: "What did you learn, including disagreement?",
            uncertainty: "What remains uncertain?",
            nextAction: "One actionable next step",
          },
          (k, v) =>
            update((x) => {
              Object.assign(x.reflection, { [k]: v });
            }),
        )}
      </Section>
    </div>
  );
}
