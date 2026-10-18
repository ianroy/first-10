import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { render } from "@testing-library/react";
import type { FunctionComponent } from "react";

// Render one page component inside a minimal router (no root head or stylesheets, which jsdom
// can't load). Other app paths exist as empty routes so <Link> and <Navigate> resolve.
const OTHER_PATHS = [
  "/",
  "/auth",
  "/setup",
  "/dashboard",
  "/contacts",
  "/interview",
  "/learnings",
  "/outreach",
  "/teacher",
  "/admin",
  "/account",
  "/settings",
];

export function renderPage(Page: FunctionComponent, path: string) {
  const root = createRootRoute({ component: () => <Outlet /> });
  const routes = [
    createRoute({ getParentRoute: () => root, path, component: Page }),
    ...OTHER_PATHS.filter((p) => p !== path).map((p) =>
      createRoute({ getParentRoute: () => root, path: p, component: () => <p>at {p}</p> }),
    ),
  ];
  const router = createRouter({
    routeTree: root.addChildren(routes),
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}
