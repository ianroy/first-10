export const A = "10000000-0000-4000-8000-000000000001";
export const B = "10000000-0000-4000-8000-000000000002";
export const OTHER = "10000000-0000-4000-8000-000000000003";
export const USER = "20000000-0000-4000-8000-000000000001";
export const USER2 = "20000000-0000-4000-8000-000000000002";
type Row = Record<string, unknown>;
type Reply = { data: unknown; error: unknown };
export const project = (id: string, user_id: string, name: string) => ({
  id,
  user_id,
  name,
  description: `${name} description`,
  audience: "Students",
  problem: "Problem",
  link: "",
  stage: 1,
  questions: [],
  survey: [],
  checklist: {},
  archived_at: null as string | null,
  lifecycle_revision: 0,
  created_at: "2026-10-18T00:00:00Z",
  updated_at: "2026-10-18T00:00:00Z",
});
export function memory() {
  const tables: Record<string, Row[]> = {
    projects: [
      project(A, USER, "Alpha"),
      project(B, USER, "Beta"),
      project(OTHER, USER2, "Other private"),
    ],
    contacts: [
      { id: "ca", user_id: USER, project_id: A, first_name: "Alpha person" },
      { id: "cb", user_id: USER, project_id: B, first_name: "Beta person" },
    ],
  };
  const calls: {
    table: string;
    operation: string;
    filters: [string, unknown][];
    signal?: AbortSignal;
  }[] = [];
  const rpcCalls: { name: string; args: Record<string, unknown> }[] = [];
  const listeners = new Set<(event: string, session: { user: { id: string } } | null) => void>();
  const journal = new Map<string, Reply>();
  let owner: string | null = USER;
  let hold: ((table: string, filters: [string, unknown][]) => boolean) | null = null;
  const pending: { signal?: AbortSignal; resolve: () => void }[] = [];
  const state = {
    tables,
    calls,
    rpcCalls,
    pending,
    rpcOverride: null as
      null | ((name: string, args: Record<string, unknown>) => Reply | Promise<Reply>),
    holdNext: (predicate: typeof hold) => {
      hold = predicate;
    },
    setUser: (user: string | null) => {
      owner = user;
    },
    emit: (event: string) =>
      listeners.forEach((fn) => fn(event, owner ? { user: { id: owner } } : null)),
    auth: {
      getSession: async () => ({
        data: { session: owner ? { user: { id: owner }, access_token: "fixture-token" } : null },
        error: null,
      }),
      getUser: async () => ({
        data: { user: owner ? { id: owner, app_metadata: {} } : null },
        error: null,
      }),
      onAuthStateChange: (
        fn: (event: string, session: { user: { id: string } } | null) => void,
      ) => {
        listeners.add(fn);
        return {
          data: {
            subscription: {
              unsubscribe: () => {
                listeners.delete(fn);
              },
            },
          },
        };
      },
      signOut: async () => {
        owner = null;
        state.emit("SIGNED_OUT");
        return { error: null };
      },
    },
    rpc(name: string, args: Record<string, unknown> = {}) {
      const run = async (): Promise<Reply> => {
        rpcCalls.push({ name, args });
        if (name === "get_platform_admin_authorization") return { data: null, error: null };
        if (state.rpcOverride) return state.rpcOverride(name, args);
        const key = JSON.stringify({ name, args });
        if (journal.has(key)) return journal.get(key)!;
        let row: Row | undefined;
        if (name === "create_owned_project") {
          row = {
            ...project(String(args["p_project_id"]), owner!, String(args["p_name"])),
            description: args["p_description"],
            audience: args["p_audience"],
            problem: args["p_problem"],
            link: args["p_link"],
          };
          tables["projects"]!.push(row);
        } else {
          row = tables["projects"]!.find(
            (p) => p["id"] === args["p_project_id"] && p["user_id"] === owner,
          );
          if (!row) return { error: null, data: { ok: false, code: "NOT_FOUND" } };
          if (row["lifecycle_revision"] !== args["p_expected_revision"])
            return {
              error: null,
              data: {
                ok: false,
                code: "REVISION_CONFLICT",
                currentRevision: row["lifecycle_revision"],
              },
            };
          row["archived_at"] = args["p_archived"] ? "2026-10-18T16:00:00Z" : null;
          row["lifecycle_revision"] = Number(row["lifecycle_revision"]) + 1;
        }
        const result = {
          error: null,
          data: {
            ok: true,
            data: {
              id: row["id"],
              name: row["name"],
              archivedAt: row["archived_at"],
              lifecycleRevision: row["lifecycle_revision"],
              updatedAt: row["updated_at"],
            },
          },
        };
        journal.set(key, result);
        return result;
      };
      return {
        setHeader: () => {},
        abortSignal: () => run(),
        then: (resolve: (value: Reply) => unknown) => run().then(resolve),
      };
    },
    from(table: string) {
      const filters: [string, unknown][] = [];
      let single = false;
      let maximum = Infinity;
      let signal: AbortSignal | undefined;
      let operation = "select";
      let payload: Row = {};
      const run = async () => {
        calls.push({ table, operation, filters: [...filters], ...(signal ? { signal } : {}) });
        let rows = (tables[table] ?? []).filter((row) =>
          filters.every(([key, value]) => row[key] === value),
        );
        if (operation === "update") rows.forEach((row) => Object.assign(row, payload));
        rows = rows.slice(0, maximum).map((row) => ({ ...row }));
        // Deliberately ignore abort when releasing: the UI must also ignore a
        // late response from a transport that cannot cancel an accepted read.
        if (hold?.(table, filters)) {
          hold = null;
          await new Promise<void>((resolve) =>
            pending.push({ ...(signal ? { signal } : {}), resolve }),
          );
        }
        return { error: null, data: single ? (rows[0] ?? null) : rows };
      };
      const q = {
        select: () => q,
        eq: (key: string, value: unknown) => {
          filters.push([key, value]);
          return q;
        },
        is: (key: string, value: unknown) => {
          filters.push([key, value]);
          return q;
        },
        order: () => q,
        abortSignal: (value: AbortSignal) => {
          signal = value;
          return q;
        },
        limit: (value: number) => {
          maximum = value;
          return q;
        },
        single: () => {
          single = true;
          return q;
        },
        maybeSingle: () => {
          single = true;
          return q;
        },
        update: (value: Row) => {
          operation = "update";
          payload = value;
          return q;
        },
        then: (resolve: (value: Awaited<ReturnType<typeof run>>) => unknown) => run().then(resolve),
      };
      return q;
    },
  };
  return state;
}
