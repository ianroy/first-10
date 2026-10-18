# Instructor planner verification

Run focused behavior tests with `npx vitest run src/tests/teacher-planner/planner.test.tsx`.

For an isolated visual check, run:

```sh
npx vite --config src/tests/teacher-planner/preview.config.ts
```

Open `http://127.0.0.1:5189/src/tests/teacher-planner/preview.html`.
The fixture mounts the real `TeacherPlanner` with an explicitly labeled test shell and an in-memory API. It performs no authenticated or database save, and reload resets its data. Its router stub does not exercise navigation protection; the focused tests cover the blocker contract and confirmation actions. Actual authenticated save/reload needs the teacher-plan migration, generated database types and generated `/teacher` route integrated into the application.

Desktop rehearsal: fill empty lesson fields; check preserved class settings; save; read Agenda & feedback; open Student task preview. Check that the planning-only boundary stays visible and that private facilitator notes do not appear in the preview. Use the printable and accessible HTML links for the versioned teaching materials.
