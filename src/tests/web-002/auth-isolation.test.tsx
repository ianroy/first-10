import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import type { ReactNode } from "react";

const state = vi.hoisted(() => ({
  pathname: "/demo",
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
  Outlet: () => <div>Page content</div>,
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
  state.pathname = "/demo";
});

describe("public demo auth isolation", () => {
  it("does not touch Supabase on the demo or trailing-slash demo", () => {
    state.subscribe.mockImplementation(() => {
      throw new Error("No Supabase config in public demo");
    });
    const view = render(<Root />);
    expect(state.subscribe).not.toHaveBeenCalled();
    state.pathname = "/demo/";
    view.rerender(<Root />);
    expect(state.subscribe).not.toHaveBeenCalled();
  });

  it("unsubscribes on entering the demo, resumes on leaving, and preserves private invalidation", () => {
    let callback: (event: string) => void = () => {};
    state.subscribe.mockImplementation((listener: typeof callback) => {
      callback = listener;
      return { data: { subscription: { unsubscribe: state.unsubscribe } } };
    });
    state.pathname = "/dashboard";
    const view = render(<Root />);
    expect(state.subscribe).toHaveBeenCalledTimes(1);
    callback("SIGNED_IN");
    expect(state.invalidate).toHaveBeenCalledTimes(1);
    expect(state.invalidateQueries).toHaveBeenCalledTimes(1);
    state.pathname = "/demo";
    view.rerender(<Root />);
    expect(state.unsubscribe).toHaveBeenCalledTimes(1);
    expect(state.subscribe).toHaveBeenCalledTimes(1);
    state.pathname = "/auth";
    view.rerender(<Root />);
    expect(state.subscribe).toHaveBeenCalledTimes(2);
    callback("SIGNED_OUT");
    expect(state.clear).toHaveBeenCalledTimes(1);
    callback("TOKEN_REFRESHED");
    expect(state.invalidate).toHaveBeenCalledTimes(2);
  });
});
