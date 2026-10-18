/** Local-only fixture staging. No budget/policy/audit/history mutation or provider calls. */
export const EVALUATOR_USER_ID = "fa030000-0000-4000-8000-000000000003";
export const EVALUATOR_PROJECT_ID = "fa030000-0000-4000-8000-000000000002";
export const FIXTURE_CREATED_AT = "2026-10-18T00:00:00+00:00";
const q = (v) => "'" + String(v).replaceAll("'", "''") + "'";
const json = (v) => q(JSON.stringify(v)) + "::jsonb";
export function fixtureRecordId(c, type, index) {
  const caseIndex =
    [
      "questions-typical",
      "questions-edge",
      "synthesis-typical",
      "synthesis-edge",
      "stage2-typical",
      "stage2-edge",
      "stage3-typical",
      "stage3-edge",
    ].indexOf(c.id.replace(/-v[0-9]+$/, "")) + 1;
  if (!caseIndex) throw new Error("Unknown synthetic fixture");
  const base = { interview: 100, contact: 200, learning: 300 }[type];
  if (base === undefined) throw new Error("Invalid source type");
  return `fa630000-0000-4000-8000-${String(caseIndex * 1000 + base + index).padStart(12, "0")}`;
}
export function fixtureStatements(c, first) {
  const u = q(EVALUATOR_USER_ID),
    p = q(EVALUATOR_PROJECT_ID),
    created = q(FIXTURE_CREATED_AT);
  const statements = [
    `DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=${u} AND raw_app_meta_data->'synthetic'='true'::jsonb) THEN RAISE EXCEPTION 'Trusted synthetic evaluator missing'; END IF; ${first ? `IF EXISTS(SELECT 1 FROM public.projects WHERE id=${p}) THEN RAISE EXCEPTION 'Fixture namespace already exists'; END IF;` : `IF NOT EXISTS(SELECT 1 FROM public.projects WHERE id=${p} AND user_id=${u} AND archived_at IS NULL AND created_at=${created}) THEN RAISE EXCEPTION 'Fixture namespace changed'; END IF;`} END $$`,
    `SET LOCAL ROLE authenticated`,
    `SELECT set_config('request.jwt.claim.sub',${u},true)`,
    `SELECT set_config('request.jwt.claims',${json({ sub: EVALUATOR_USER_ID, role: "authenticated" })}::text,true)`,
  ];
  if (first)
    statements.push(
      `INSERT INTO public.projects(id,user_id,name,created_at) VALUES(${p},${u},'Fictional bounded evaluation',${created})`,
    );
  else {
    // Refuse to remove any foreign source. Only the previous cases' documented private fixture rows qualify.
    const allIds = [];
    for (const kind of ["questions", "synthesis", "stage2", "stage3"])
      for (const variant of ["typical", "edge"])
        for (const type of ["interview", "contact", "learning"])
          for (let i = 0; i < 64; i++)
            allIds.push(fixtureRecordId({ id: `${kind}-${variant}-v6` }, type, i));
    for (const table of ["learnings", "interviews", "contacts"])
      statements.push(
        `DO $$ BEGIN IF EXISTS(SELECT 1 FROM public.${table} WHERE project_id=${p} AND (user_id<>${u} OR id NOT IN (${allIds.map(q).join(",")}))) THEN RAISE EXCEPTION 'Unrecognized fixture content'; END IF; END $$`,
        `DELETE FROM public.${table} WHERE project_id=${p} AND user_id=${u}`,
      );
  }
  const fields = ["name", "description", "audience", "problem"];
  statements.push(
    `UPDATE public.projects SET ${fields.map((f) => `${f}=${q(c.input.project[f])}`).join(",")} WHERE id=${p} AND user_id=${u}`,
  );
  if (first)
    statements.push(
      `SELECT public.set_processing_consent(${p},'project',${p},'unknown','granted','unknown',1,0)`,
    );
  for (const [table, type] of [
    ["contacts", "contact"],
    ["interviews", "interview"],
    ["learnings", "learning"],
  ])
    c.input[table].forEach((row, index) => {
      const id = q(fixtureRecordId(c, type, index));
      let columns, values;
      if (type === "contact") {
        columns = "first_name,relation,why,source,stage";
        values = [
          q("Fictional evaluator source"),
          q(row.relation),
          q(row.why),
          q(row.source),
          String(row.stage),
        ];
      }
      if (type === "interview") {
        columns = "answers,tags,completed";
        values = [
          json(
            row.answers.map((a) => ({ q: a.q ?? "", note: a.note ?? "", quote: a.quote ?? "" })),
          ),
          `ARRAY[${row.tags.map(q).join(",")}]::text[]`,
          "true",
        ];
      }
      if (type === "learning") {
        columns = "title,body,data,kind,accepted";
        values = [q(row.title), q(row.body), json(row.data), q(row.kind), "true"];
      }
      statements.push(
        `INSERT INTO public.${table}(id,user_id,project_id,created_at,${columns}) VALUES(${id},${u},${p},${created},${values.join(",")})`,
      );
      statements.push(
        `SELECT public.set_processing_consent(${p},${q(type)},${id},${q(type === "interview" ? "granted" : "unknown")},${q(c.withheld_records[table].includes(index) ? "withdrawn" : "granted")},'unknown',1,0)`,
      );
    });
  return statements;
}
export function assertLocalDatabaseUrl(value) {
  const url = new URL(value);
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !["127.0.0.1", "localhost"].includes(url.hostname) ||
    url.port !== "55322" ||
    !/^\/(?:postgres|firstten_eval_v6_[a-f0-9]{8})$/.test(url.pathname) ||
    url.searchParams.get("sslmode") !== "disable"
  )
    throw new Error("Only the dedicated local55322 database is eligible");
  return url;
}
