-- 0047 — One Employee ID.
--
-- A person's ID lives in two places: `users.id_number`, which sign-in and
-- User management read, and `profiles.emp_no`, the copy My profile saves. Both
-- write paths move them together, but an edit that failed halfway (or a row
-- fixed by hand) could leave the two disagreeing, and then User management
-- showed one ID while My profile showed another.
--
-- The account row is the authoritative one: it is what the sign-in screen
-- looks up and the only one with a unique index. This brings every stale copy
-- into line once. Nothing else is touched, and the API also reads the account
-- row from now on, so this is a repair, not the guarantee.

UPDATE public.profiles AS p
SET emp_no = u.id_number,
    updated_at = now()
FROM public.users AS u
WHERE p.access_code_id = u.id
  AND p.emp_no IS DISTINCT FROM u.id_number;
