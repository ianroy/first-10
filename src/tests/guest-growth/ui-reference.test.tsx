import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ReferencePicker } from "@/components/guest-growth/ReferencePicker";
import type { GuestGrowthPorts } from "@/components/guest-growth/ports";
import { records, view, csrf, id, type Saved } from "./fixture";
const header = ({ document: _document, ...h }: Saved) => h;
const current = header(records()[0]!);
function setup(history: GuestGrowthPorts["history"]) {
  const ports: GuestGrowthPorts = {
      list: vi.fn(),
      load: vi.fn(),
      save: vi.fn(),
      history,
      authorizeExport: vi.fn(),
    },
    onChange = vi.fn();
  const props = {
    label: "Learning source",
    target: "learning" as const,
    value: null,
    headers: [current],
    view,
    csrf,
    audience: "principal_private" as const,
    ports,
    onChange,
  };
  const mounted = render(<ReferencePicker {...props} />);
  fireEvent.change(screen.getByLabelText("Learning source artifact"), {
    target: { value: current.id },
  });
  fireEvent.click(screen.getByRole("button", { name: "Load retained reference revisions" }));
  return { ...mounted, ports, onChange, props };
}
afterEach(cleanup);
it("adopts only the explicit exact retained revision without loading referenced bodies", async () => {
  const history = vi.fn().mockResolvedValue({
    ok: true,
    data: { artifactId: current.id, versions: [current, { ...current, revision: 1 }] },
  });
  const { onChange, ports } = setup(history);
  const choice = await screen.findByLabelText("Learning source retained revision");
  expect(onChange).not.toHaveBeenCalled();
  fireEvent.change(choice, { target: { value: "1" } });
  fireEvent.click(screen.getByRole("button", { name: "Use this exact reference" }));
  expect(onChange).toHaveBeenCalledExactlyOnceWith({
    kind: "learning",
    artifactId: current.id,
    revision: 1,
  });
  expect(history).toHaveBeenCalledExactlyOnceWith({ csrf, artifactId: current.id });
  expect(ports.load).not.toHaveBeenCalled();
});
it("rejects a foreign private revision rather than trusting a matching artifact identifier", async () => {
  const { onChange } = setup(
    vi.fn().mockResolvedValue({
      ok: true,
      data: { artifactId: current.id, versions: [{ ...current, authorPrincipalId: id(999) }] },
    }),
  );
  await screen.findByText("These retained revisions could not be confirmed in this guest scope.");
  expect(screen.queryByLabelText("Learning source retained revision")).not.toBeInTheDocument();
  expect(onChange).not.toHaveBeenCalled();
});
it("discards a late history response across principal changes", async () => {
  let resolve!: (value: unknown) => void;
  const { rerender, props, onChange } = setup(
    vi.fn().mockImplementation(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    ),
  );
  rerender(<ReferencePicker {...props} view={{ ...view, principalId: id(998) }} />);
  await act(async () =>
    resolve({ ok: true, data: { artifactId: current.id, versions: [current] } }),
  );
  expect(screen.queryByLabelText("Learning source retained revision")).not.toBeInTheDocument();
  expect(screen.getByLabelText("Learning source artifact")).toHaveValue("");
  expect(onChange).not.toHaveBeenCalled();
});
it("withholds history when access expires during the request", async () => {
  const now = vi.spyOn(Date, "now").mockReturnValue(Date.parse("2099-10-18T00:00:00Z"));
  let resolve!: (value: unknown) => void;
  const { onChange } = setup(
    vi.fn().mockImplementation(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    ),
  );
  now.mockReturnValue(Date.parse("2099-10-20T00:00:00Z"));
  await act(async () =>
    resolve({ ok: true, data: { artifactId: current.id, versions: [current] } }),
  );
  expect(
    screen.getByText("Guest access ended before these revisions could be confirmed."),
  ).toBeInTheDocument();
  expect(screen.queryByLabelText("Learning source retained revision")).not.toBeInTheDocument();
  expect(onChange).not.toHaveBeenCalled();
  now.mockRestore();
});
