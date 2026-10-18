-- Read-only operator preflight. Returns six aggregate counts, never private content.
-- Zero counts allow migration review; they are not permission to deploy by themselves.
-- A nonzero count requires private operator inspection and an explicitly reviewed fix.
SELECT 'contacts_project' AS relationship, count(*) AS inconsistent_rows
FROM public.contacts child LEFT JOIN public.projects parent ON parent.id = child.project_id
WHERE parent.id IS NULL OR child.user_id IS DISTINCT FROM parent.user_id
UNION ALL
SELECT 'interviews_project', count(*)
FROM public.interviews child LEFT JOIN public.projects parent ON parent.id = child.project_id
WHERE parent.id IS NULL OR child.user_id IS DISTINCT FROM parent.user_id
UNION ALL
SELECT 'interviews_contact', count(*)
FROM public.interviews interview LEFT JOIN public.contacts contact ON contact.id = interview.contact_id
WHERE interview.contact_id IS NOT NULL
  AND (contact.id IS NULL OR contact.user_id IS DISTINCT FROM interview.user_id OR contact.project_id IS DISTINCT FROM interview.project_id)
UNION ALL
SELECT 'learnings_project', count(*)
FROM public.learnings child LEFT JOIN public.projects parent ON parent.id = child.project_id
WHERE parent.id IS NULL OR child.user_id IS DISTINCT FROM parent.user_id
UNION ALL
SELECT 'experiments_project', count(*)
FROM public.experiments child LEFT JOIN public.projects parent ON parent.id = child.project_id
WHERE parent.id IS NULL OR child.user_id IS DISTINCT FROM parent.user_id
UNION ALL
SELECT 'outreach_project', count(*)
FROM public.outreach child LEFT JOIN public.projects parent ON parent.id = child.project_id
WHERE parent.id IS NULL OR child.user_id IS DISTINCT FROM parent.user_id
ORDER BY relationship;
