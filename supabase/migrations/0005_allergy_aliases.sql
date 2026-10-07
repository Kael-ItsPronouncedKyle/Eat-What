-- Allergy aliases: a rule for a family ("nuts") covers its members ("almond").
-- Mirrors src/domain/allergens.ts; keep the two tables in step.

create table if not exists app.allergen_aliases (
  family text not null,
  term text not null,
  primary key (family, term)
);
comment on table app.allergen_aliases is 'Allergen family -> member term. Matched whole-word by public.check_allergies.';

-- Ingredients that contain a term as a whole word but are not that allergen ("coconut milk" is not dairy).
create table if not exists app.allergen_exceptions (
  term text not null,
  phrase text not null,
  primary key (term, phrase)
);
comment on table app.allergen_exceptions is 'Term -> ingredient phrase that term must not flag.';

grant select on app.allergen_aliases, app.allergen_exceptions to authenticated, service_role;

insert into app.allergen_aliases (family, term) values
  ('nuts', 'almond'), ('nuts', 'walnut'), ('nuts', 'pecan'), ('nuts', 'cashew'), ('nuts', 'pistachio'), ('nuts', 'hazelnut'),
  ('nuts', 'macadamia'), ('nuts', 'pine nut'), ('nuts', 'peanut'),
  ('tree nuts', 'almond'), ('tree nuts', 'walnut'), ('tree nuts', 'pecan'), ('tree nuts', 'cashew'), ('tree nuts', 'pistachio'),
  ('tree nuts', 'hazelnut'), ('tree nuts', 'macadamia'), ('tree nuts', 'pine nut'),
  ('peanuts', 'peanut'),
  ('shellfish', 'shrimp'), ('shellfish', 'prawn'), ('shellfish', 'crab'), ('shellfish', 'lobster'), ('shellfish', 'crawfish'),
  ('shellfish', 'scallop'), ('shellfish', 'clam'), ('shellfish', 'mussel'), ('shellfish', 'oyster'),
  ('dairy', 'milk'), ('dairy', 'cheese'), ('dairy', 'butter'), ('dairy', 'cream'), ('dairy', 'half and half'), ('dairy', 'yogurt'),
  ('dairy', 'whey'), ('dairy', 'ghee'), ('dairy', 'cheddar'), ('dairy', 'mozzarella'), ('dairy', 'parmesan'), ('dairy', 'feta'),
  ('gluten', 'wheat'), ('gluten', 'flour'), ('gluten', 'all-purpose flour'), ('gluten', 'bread flour'), ('gluten', 'cake flour'),
  ('gluten', 'bread'), ('gluten', 'pasta'), ('gluten', 'couscous'), ('gluten', 'barley'), ('gluten', 'rye'), ('gluten', 'seitan'), ('gluten', 'soy sauce'),
  ('wheat', 'wheat'), ('wheat', 'flour'), ('wheat', 'all-purpose flour'), ('wheat', 'bread flour'), ('wheat', 'cake flour'),
  ('wheat', 'bread'), ('wheat', 'pasta'), ('wheat', 'couscous'), ('wheat', 'barley'), ('wheat', 'rye'), ('wheat', 'seitan'), ('wheat', 'soy sauce'),
  ('eggs', 'egg'), ('eggs', 'mayonnaise'),
  ('soy', 'soy'), ('soy', 'soy sauce'), ('soy', 'tofu'), ('soy', 'edamame'), ('soy', 'tempeh'), ('soy', 'miso'),
  ('sesame', 'sesame'), ('sesame', 'tahini'),
  ('fish', 'fish'), ('fish', 'salmon'), ('fish', 'tuna'), ('fish', 'cod'), ('fish', 'tilapia'), ('fish', 'anchovy'), ('fish', 'fish sauce')
on conflict do nothing;

insert into app.allergen_exceptions (term, phrase) values
  ('milk', 'coconut milk'), ('milk', 'almond milk'), ('milk', 'oat milk'), ('milk', 'soy milk'), ('milk', 'rice milk'), ('milk', 'cashew milk'), ('milk', 'milk of magnesia'),
  ('cream', 'coconut cream'), ('cream', 'cream of tartar'), ('cream', 'cashew cream'),
  ('butter', 'peanut butter'), ('butter', 'almond butter'), ('butter', 'cashew butter'), ('butter', 'sunflower butter'), ('butter', 'cocoa butter'), ('butter', 'apple butter'),
  ('cheese', 'vegan cheese'),
  ('nut', 'water chestnut'),
  ('oyster', 'oyster mushroom'),
  ('crab', 'crab apple'),
  ('fish', 'oyster mushroom')
on conflict do nothing;

-- Whole-word regex for a term: "crab" matches "crab meat" and "crabs" but not "crabapple"; "anchovy" matches "anchovies".
-- Hyphens and spaces in the term match a hyphen, a space or nothing ("all-purpose" ~ "all purpose").
create or replace function app.word_regex(term text)
returns text language sql immutable strict set search_path = '' as $$
  select '\m' || case when right(t, 1) = 'y' then left(t, -1) || '(y|ies)' else t || '(e?s)?' end || '\M'
  from (select replace(replace(regexp_replace(lower(trim(term)), '([.*+?^${}()|\[\]\\])', '\\\1', 'g'), '-', '(-|\s)?'), ' ', '(-|\s)?') as t) s
$$;

-- Rough singular of a rule's ingredient so "nuts", "eggs" and "peanuts" find their family. Only the trailing s is dropped
-- (the app canonicalizes properly; this is enough to find a family row). Families ending in a real s (shellfish) are untouched.
create or replace function app.allergen_family_key(name text)
returns text language sql immutable strict set search_path = '' as $$
  select regexp_replace(regexp_replace(lower(trim(name)), '\s+', ' ', 'g'), '([^s])s$', '\1')
$$;

-- Allergy check in SQL so every writer (app, partner, Riker) gets the same answer. Code wins over the model.
-- A rule's ingredient is matched as a whole word, and so is every alias of its family. An ingredient that contains a
-- term only inside an exception phrase ("coconut milk" for "milk") is not flagged.
create or replace function public.check_allergies(p_household_id uuid, p_ingredients text[])
returns table (ingredient text, rule_id uuid, person_id uuid, substitute text, severity text)
language sql security invoker stable set search_path = '' as $$
  with rule_terms as (
    select r.id as rule_id, r.applies_to_person_id, r.payload ->> 'substitute' as substitute,
      coalesce(r.payload ->> 'severity', 'avoid') as severity, t.term
    from public.rules r
    cross join lateral (
      select app.allergen_family_key(r.payload ->> 'ingredient') as term
      union
      select a.term from app.allergen_aliases a
      where app.allergen_family_key(a.family) = app.allergen_family_key(r.payload ->> 'ingredient')
    ) t
    where r.household_id = p_household_id and r.type = 'allergy' and r.active and r.deleted_at is null
      and coalesce(trim(r.payload ->> 'ingredient'), '') <> ''
  )
  select distinct on (ing.n, rt.rule_id) ing.ing, rt.rule_id, rt.applies_to_person_id, rt.substitute, rt.severity
  from unnest(p_ingredients) with ordinality as ing(ing, n)
  join rule_terms rt on lower(ing.ing) ~ app.word_regex(rt.term)
  where not exists (
    -- Blank out every exception phrase for this term; the term must still appear in what is left.
    select 1 from (select string_agg(app.word_regex(e.phrase), '|') as rx from app.allergen_exceptions e where e.term = rt.term) x
    where x.rx is not null and not (regexp_replace(lower(ing.ing), x.rx, ' ', 'g') ~ app.word_regex(rt.term))
  )
  order by ing.n, rt.rule_id
$$;
grant execute on function public.check_allergies(uuid, text[]) to authenticated;
