import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import type { ReactNode } from "react";

const state = vi.hoisted(() => ({
  pathname: "/teach",
  subscribe: vi.fn(),
  unsubscribe: vi.fn(),
  invalidate: vi.fn(),
  invalidateQueries: vi.fn(),
  clear: vi.fn(),
}));
vi.mock("@tanstack/react-query", () => ({
  QueryClientProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@tanstack/react-router", () => ({
  createRootRouteWithContext: () => (options: unknown) => ({
    options,
    useRouteContext: () => ({
      queryClient: { invalidateQueries: state.invalidateQueries, clear: state.clear },
    }),
  }),
  useRouter: () => ({ invalidate: state.invalidate }),
  useRouterState: () => state.pathname,
  Outlet: () => <div>Public teaching content</div>,
  Link: () => null,
  HeadContent: () => null,
  Scripts: () => null,
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { onAuthStateChange: state.subscribe } },
}));
vi.mock("@/components/ui/sonner", () => ({ Toaster: () => null }));
vi.mock("@/lib/lovable-error-reporting", () => ({ reportLovableError: vi.fn() }));
import { Route } from "@/routes/__root";
const Root = Route.options.component!;

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  state.pathname = "/teach";
});

describe("public teaching auth boundary", () => {
  it("renders /teach and /teach/ when touching auth would fail for missing configuration", () => {
    state.subscribe.mockImplementation(() => {
      throw new Error("No Supabase configuration");
    });
    const view = render(<Root />);
    state.pathname = "/teach/";
    view.rerender(<Root />);
    expect(state.subscribe).not.toHaveBeenCalled();
  });

  it("cleans up private listeners across public learning routes and restores private event behavior", () => {
    let listener: (event: string) => void = () => {};
    state.subscribe.mockImplementation((callback: typeof listener) => {
      listener = callback;
      return { data: { subscription: { unsubscribe: state.unsubscribe } } };
    });
    state.pathname = "/dashboard";
    const view = render(<Root />);
    expect(state.subscribe).toHaveBeenCalledTimes(1);
    state.pathname = "/teach";
    view.rerender(<Root />);
    expect(state.unsubscribe).toHaveBeenCalledTimes(1);
    state.pathname = "/demo";
    view.rerender(<Root />);
    state.pathname = "/teach/";
    view.rerender(<Root />);
    expect(state.subscribe).toHaveBeenCalledTimes(1);
    state.pathname = "/auth";
    view.rerender(<Root />);
    expect(state.subscribe).toHaveBeenCalledTimes(2);
    listener("USER_UPDATED");
    expect(state.invalidate).toHaveBeenCalledTimes(1);
    expect(state.invalidateQueries).toHaveBeenCalledTimes(1);
    listener("SIGNED_OUT");
    expect(state.clear).toHaveBeenCalledTimes(1);
    listener("TOKEN_REFRESHED");
    expect(state.invalidate).toHaveBeenCalledTimes(2);
  });

  it("does not accidentally exempt a private path with a teaching-like prefix", () => {
    state.pathname = "/teacher";
    state.subscribe.mockReturnValue({ data: { subscription: { unsubscribe: state.unsubscribe } } });
    render(<Root />);
    expect(state.subscribe).toHaveBeenCalledTimes(1);
  });
});
