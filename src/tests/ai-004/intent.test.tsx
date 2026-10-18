import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({
  identity: { ready: true, userId: "owner-a" as string | null, error: null as Error | null },
}));
vi.mock("@/lib/project-selection", () => ({ useWorkspaceIdentity: () => h.identity }));
import { useAIIntent } from "@/hooks/useAIIntent";
beforeEach(() => {
  sessionStorage.clear();
  h.identity = { ready: true, userId: "owner-a", error: null };
});
afterEach(cleanup);
describe("stable owner/project/kind AI intent", () => {
  it("suppresses immediate double-clicks, preserves uncertain intents across rerender/remount, rotates only explicitly", () => {
    const first = renderHook(() => useAIIntent("idea-a", "questions"));
    let id: string | null = null;
    act(() => {
      id = first.result.current.begin();
    });
    expect(id).toMatch(/^[a-f0-9-]{36}$/);
    expect(first.result.current.begin()).toBeNull();
    expect(first.result.current.newRequest()).toBe(false);
    act(() => first.result.current.failed(id!));
    expect(first.result.current.uncertain).toBe(true);
    first.unmount();
    const next = renderHook(() => useAIIntent("idea-a", "questions"));
    expect(next.result.current.uncertain).toBe(true);
    let replay: string | null = null;
    act(() => {
      replay = next.result.current.begin();
    });
    expect(replay).toBe(id);
    act(() => next.result.current.failed(replay!));
    act(() => {
      expect(next.result.current.newRequest()).toBe(true);
    });
    act(() => {
      replay = next.result.current.begin();
    });
    expect(replay).not.toBe(id);
    expect(sessionStorage.length).toBe(1);
    expect(sessionStorage.getItem("firstten:ai-intent:owner-a:idea-a:questions")).toBe(replay);
  });
  it("acknowledged success permits a later explicit generation and removes the persisted pending identifier", () => {
    const { result } = renderHook(() => useAIIntent("idea-a", "questions"));
    let id: string | null = null;
    act(() => {
      id = result.current.begin();
    });
    act(() => result.current.succeeded(id!));
    expect(result.current.uncertain).toBe(false);
    expect(sessionStorage.length).toBe(0);
    expect(result.current.isCurrent(id!)).toBe(true);
    let next: string | null = null;
    act(() => {
      next = result.current.begin();
    });
    expect(next).not.toBe(id);
    expect(result.current.isCurrent(id!)).toBe(false);
  });
  it("late responses cannot mutate a different owner/project scope", () => {
    const { result, rerender } = renderHook(
      ({ projectId }) => useAIIntent(projectId, "questions"),
      { initialProps: { projectId: "idea-a" } },
    );
    let id: string | null = null;
    act(() => {
      id = result.current.begin();
    });
    const old = result.current;
    h.identity = { ready: true, userId: "owner-b", error: null };
    rerender({ projectId: "idea-b" });
    expect(old.isCurrent(id!)).toBe(false);
    act(() => old.failed(id!));
    expect(result.current.uncertain).toBe(false);
    let other: string | null = null;
    act(() => {
      other = result.current.begin();
    });
    expect(other).not.toBe(id);
  });
  it("never creates an intent for an unverified identity or while signed out", () => {
    h.identity = { ready: false, userId: null, error: null };
    const { result } = renderHook(() => useAIIntent("idea-a", "questions"));
    expect(result.current.begin()).toBeNull();
    expect(sessionStorage.length).toBe(0);
  });
});
