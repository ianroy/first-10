// A small in-memory stand-in for the supabase-js client, enough for page render tests.
// Supports select/eq/order/limit/single/maybeSingle/insert/update/delete on plain arrays.
type Row = Record<string, unknown>;
type Tables = Record<string, Row[]>;

export type FakeSupabase = ReturnType<typeof createFakeSupabase>;

export function createFakeSupabase(tables: Tables = {}, user: Row | null = { id: "user-1" }) {
  const calls: { table: string; op: string; payload?: unknown }[] = [];

  function query(table: string) {
    const filters: [string, unknown][] = [];
    let op: "select" | "insert" | "update" | "delete" = "select";
    let payload: unknown;
    let limit: number | undefined;
    let single: "single" | "maybe" | undefined;
    let ascending = true;
    let orderBy: string | undefined;

    const rows = () => {
      let r = (tables[table] ?? []).filter((row) => filters.every(([k, v]) => row[k] === v));
      if (orderBy) {
        const key = orderBy;
        r = [...r].sort(
          (a, b) => String(a[key]).localeCompare(String(b[key])) * (ascending ? 1 : -1),
        );
      }
      return limit === undefined ? r : r.slice(0, limit);
    };

    const run = () => {
      if (op !== "select") {
        calls.push({ table, op, payload });
        return { data: null, error: null };
      }
      const r = rows();
      if (single === "single")
        return r[0] ? { data: r[0], error: null } : { data: null, error: { message: "not found" } };
      if (single === "maybe") return { data: r[0] ?? null, error: null };
      return { data: r, error: null };
    };

    const b = {
      select: () => b,
      eq: (k: string, v: unknown) => (filters.push([k, v]), b),
      order: (k: string, o?: { ascending?: boolean }) => (
        (orderBy = k),
        (ascending = o?.ascending ?? true),
        b
      ),
      limit: (n: number) => ((limit = n), b),
      single: () => ((single = "single"), b),
      maybeSingle: () => ((single = "maybe"), b),
      insert: (p: unknown) => ((op = "insert"), (payload = p), b),
      update: (p: unknown) => ((op = "update"), (payload = p), b),
      delete: () => ((op = "delete"), b),
      then: (resolve: (v: ReturnType<typeof run>) => unknown, reject?: (e: unknown) => unknown) =>
        Promise.resolve(run()).then(resolve, reject),
    };
    return b;
  }

  return {
    calls,
    from: (table: string) => query(table),
    auth: {
      getUser: async () => ({ data: { user }, error: null }),
      getSession: async () => ({ data: { session: user ? { user } : null }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      signOut: async () => ({ error: null }),
      signInWithOtp: async () => ({ error: null }),
    },
  };
}
