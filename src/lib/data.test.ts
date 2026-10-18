import { describe, expect, it } from "vitest";
import { stageProgress, type Contact, type Interview } from "@/lib/data";

const contact = (stage: number, status: string) => ({ stage, status }) as Contact;
const interview = (completed: boolean) => ({ completed }) as Interview;

describe("stageProgress", () => {
  it("counts completed interviews for stage 1 and reached contacts per stage", () => {
    const p = stageProgress(
      [
        contact(1, "interviewed"),
        contact(2, "contacted"),
        contact(2, "tried"),
        contact(2, "paying"),
        contact(3, "active"),
        contact(3, "replied"),
      ],
      [interview(true), interview(true), interview(false)],
    );
    expect(p).toEqual({ s1: 2, s2: 2, s3: 1 });
  });

  it("is all zeros with no data", () => {
    expect(stageProgress([], [])).toEqual({ s1: 0, s2: 0, s3: 0 });
  });
});
