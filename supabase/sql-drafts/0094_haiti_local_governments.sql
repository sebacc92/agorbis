-- =============================================================================
-- Agorbis · 0094 · Comunas de Haití como nivel 4 (D146)
-- -----------------------------------------------------------------------------
-- BORRADOR, NO APLICAR. Vive en supabase/sql-drafts/ hasta que el responsable
-- lo promueva; el número es provisional.
--
-- Generado por scripts/build-cod-ab-level4-draft.mjs haiti; no se edita a mano.
--
-- Fuente: Haiti - Subnational Administrative Boundaries (COD-AB) de HDX, con
-- datos del CNIGS, licencia CC BY-IGO, vigente desde 2018. Tildes de las
-- etiquetas en francés de Wikidata (CC0), sólo cuando difieren únicamente en
-- tildes o mayúsculas. Faltan las comunas creadas después: Wikidata cuenta 146.
-- Descargado el 2026-11-21. 140 unidades, con un punto cada una.
-- =============================================================================

begin;

set local search_path = '';

create temporary table level4_rows (
  slug text primary key,
  name text not null,
  parent_slug text not null,
  description text not null,
  lat double precision,
  lng double precision
) on commit drop;

insert into pg_temp.level4_rows (slug, name, parent_slug, description, lat, lng) values
  ('haiti-artibonite-anse-rouge', 'Anse Rouge', 'haiti-artibonite', 'Comuna del departamento Artibonite', 19.622143, -72.952241),
  ('haiti-artibonite-desdunes', 'Desdunes', 'haiti-artibonite', 'Comuna del departamento Artibonite', 19.313539, -72.690475),
  ('haiti-artibonite-dessalines', 'Dessalines', 'haiti-artibonite', 'Comuna del departamento Artibonite', 19.223784, -72.439907),
  ('haiti-artibonite-ennery', 'Ennery', 'haiti-artibonite', 'Comuna del departamento Artibonite', 19.48992, -72.474777),
  ('haiti-artibonite-gonaives', 'Gonaives', 'haiti-artibonite', 'Comuna del departamento Artibonite', 19.493245, -72.683677),
  ('haiti-artibonite-grande-saline', 'Grande Saline', 'haiti-artibonite', 'Comuna del departamento Artibonite', 19.257216, -72.661472),
  ('haiti-artibonite-gros-morne', 'Gros Morne', 'haiti-artibonite', 'Comuna del departamento Artibonite', 19.706175, -72.715818),
  ('haiti-artibonite-l-estere', 'L''Estère', 'haiti-artibonite', 'Comuna del departamento Artibonite', 19.364476, -72.630803),
  ('haiti-artibonite-la-chapelle', 'La Chapelle', 'haiti-artibonite', 'Comuna del departamento Artibonite', 18.920732, -72.354586),
  ('haiti-artibonite-marmelade', 'Marmelade', 'haiti-artibonite', 'Comuna del departamento Artibonite', 19.52713, -72.37863),
  ('haiti-artibonite-petite-riviere-de-l-artibonite', 'Petite Riviere de l''Artibonite', 'haiti-artibonite', 'Comuna del departamento Artibonite', 19.069545, -72.339704),
  ('haiti-artibonite-saint-marc', 'Saint-Marc', 'haiti-artibonite', 'Comuna del departamento Artibonite', 19.101965, -72.629493),
  ('haiti-artibonite-saint-michel-de-l-attalaye', 'Saint-Michel de l''Attalaye', 'haiti-artibonite', 'Comuna del departamento Artibonite', 19.347665, -72.361766),
  ('haiti-artibonite-terre-neuve', 'Terre Neuve', 'haiti-artibonite', 'Comuna del departamento Artibonite', 19.622832, -72.80181),
  ('haiti-artibonite-verrettes', 'Verrettes', 'haiti-artibonite', 'Comuna del departamento Artibonite', 19.036829, -72.502344),
  ('haiti-centre-belladere', 'Belladère', 'haiti-centre', 'Comuna del departamento Centre', 18.865875, -71.813366),
  ('haiti-centre-boucan-carre', 'Boucan Carre', 'haiti-centre', 'Comuna del departamento Centre', 18.96138, -72.152494),
  ('haiti-centre-cerca-carvajal', 'Cerca Carvajal', 'haiti-centre', 'Comuna del departamento Centre', 19.260461, -71.922462),
  ('haiti-centre-cerca-la-source', 'Cerca La Source', 'haiti-centre', 'Comuna del departamento Centre', 19.166559, -71.740171),
  ('haiti-centre-hinche', 'Hinche', 'haiti-centre', 'Comuna del departamento Centre', 19.163677, -71.975403),
  ('haiti-centre-lascahobas', 'LasCahobas', 'haiti-centre', 'Comuna del departamento Centre', 18.837723, -71.955565),
  ('haiti-centre-maissade', 'Maïssade', 'haiti-centre', 'Comuna del departamento Centre', 19.188608, -72.173182),
  ('haiti-centre-mirebalais', 'Mirebalais', 'haiti-centre', 'Comuna del departamento Centre', 18.800436, -72.067214),
  ('haiti-centre-saut-d-eau', 'Saut d''Eau', 'haiti-centre', 'Comuna del departamento Centre', 18.8259, -72.241846),
  ('haiti-centre-savanette', 'Savanette', 'haiti-centre', 'Comuna del departamento Centre', 18.742141, -71.84832),
  ('haiti-centre-thomassique', 'Thomassique', 'haiti-centre', 'Comuna del departamento Centre', 19.083311, -71.827049),
  ('haiti-centre-thomonde', 'Thomonde', 'haiti-centre', 'Comuna del departamento Centre', 18.957693, -71.975557),
  ('haiti-grand-anse-abricots', 'Abricots', 'haiti-grand-anse', 'Comuna del departamento Grand''Anse', 18.614499, -74.31896),
  ('haiti-grand-anse-anse-d-hainault', 'Anse d''Hainault', 'haiti-grand-anse', 'Comuna del departamento Grand''Anse', 18.464836, -74.410259),
  ('haiti-grand-anse-beaumont', 'Beaumont', 'haiti-grand-anse', 'Comuna del departamento Grand''Anse', 18.447994, -73.981729),
  ('haiti-grand-anse-bonbon', 'Bonbon', 'haiti-grand-anse', 'Comuna del departamento Grand''Anse', 18.631634, -74.238582),
  ('haiti-grand-anse-chambellan', 'Chambellan', 'haiti-grand-anse', 'Comuna del departamento Grand''Anse', 18.519111, -74.335105),
  ('haiti-grand-anse-corail', 'Corail', 'haiti-grand-anse', 'Comuna del departamento Grand''Anse', 18.543466, -73.901781),
  ('haiti-grand-anse-dame-marie', 'Dame Marie', 'haiti-grand-anse', 'Comuna del departamento Grand''Anse', 18.565165, -74.380931),
  ('haiti-grand-anse-jeremie', 'Jérémie', 'haiti-grand-anse', 'Comuna del departamento Grand''Anse', 18.53364, -74.155606),
  ('haiti-grand-anse-les-irois', 'Les Irois', 'haiti-grand-anse', 'Comuna del departamento Grand''Anse', 18.405807, -74.378324),
  ('haiti-grand-anse-moron', 'Moron', 'haiti-grand-anse', 'Comuna del departamento Grand''Anse', 18.485434, -74.279247),
  ('haiti-grand-anse-pestel', 'Pestel', 'haiti-grand-anse', 'Comuna del departamento Grand''Anse', 18.464481, -73.844971),
  ('haiti-grand-anse-roseaux', 'Roseaux', 'haiti-grand-anse', 'Comuna del departamento Grand''Anse', 18.501704, -74.064079),
  ('haiti-nippes-anse-a-veau', 'Anse-à-Veau', 'haiti-nippes', 'Comuna del departamento Nippes', 18.463059, -73.317985),
  ('haiti-nippes-arnaud', 'Arnaud', 'haiti-nippes', 'Comuna del departamento Nippes', 18.448192, -73.386412),
  ('haiti-nippes-baraderes', 'Baraderes', 'haiti-nippes', 'Comuna del departamento Nippes', 18.473771, -73.672443),
  ('haiti-nippes-fonds-des-negres', 'Fonds des Negres', 'haiti-nippes', 'Comuna del departamento Nippes', 18.386184, -73.247357),
  ('haiti-nippes-grand-boucan', 'Grand-Boucan', 'haiti-nippes', 'Comuna del departamento Nippes', 18.567779, -73.646508),
  ('haiti-nippes-l-asile', 'L''Asile', 'haiti-nippes', 'Comuna del departamento Nippes', 18.394141, -73.388741),
  ('haiti-nippes-miragoane', 'Miragoâne', 'haiti-nippes', 'Comuna del departamento Nippes', 18.341361, -73.05363),
  ('haiti-nippes-paillant', 'Paillant', 'haiti-nippes', 'Comuna del departamento Nippes', 18.416648, -73.182499),
  ('haiti-nippes-petit-trou-de-nippes', 'Petit Trou de Nippes', 'haiti-nippes', 'Comuna del departamento Nippes', 18.45345, -73.474244),
  ('haiti-nippes-petite-riviere-de-nippes', 'Petite Riviere de Nippes', 'haiti-nippes', 'Comuna del departamento Nippes', 18.449102, -73.191551),
  ('haiti-nippes-plaisance-du-sud', 'Plaisance du Sud', 'haiti-nippes', 'Comuna del departamento Nippes', 18.425315, -73.558161),
  ('haiti-nord-est-capotille', 'Capotille', 'haiti-nord-est', 'Comuna del departamento Nord-Est', 19.462207, -71.70672),
  ('haiti-nord-est-caracol', 'Caracol', 'haiti-nord-est', 'Comuna del departamento Nord-Est', 19.686661, -72.010298),
  ('haiti-nord-est-carice', 'Carice', 'haiti-nord-est', 'Comuna del departamento Nord-Est', 19.356012, -71.822628),
  ('haiti-nord-est-ferrier', 'Ferrier', 'haiti-nord-est', 'Comuna del departamento Nord-Est', 19.645249, -71.762503),
  ('haiti-nord-est-fort-liberte', 'Fort-Liberté', 'haiti-nord-est', 'Comuna del departamento Nord-Est', 19.569236, -71.850172),
  ('haiti-nord-est-mombin-crochu', 'Mombin Crochu', 'haiti-nord-est', 'Comuna del departamento Nord-Est', 19.338627, -71.900042),
  ('haiti-nord-est-mont-organise', 'Mont-Organisé', 'haiti-nord-est', 'Comuna del departamento Nord-Est', 19.387205, -71.779526),
  ('haiti-nord-est-ouanaminthe', 'Ouanaminthe', 'haiti-nord-est', 'Comuna del departamento Nord-Est', 19.497297, -71.771258),
  ('haiti-nord-est-perches', 'Perches', 'haiti-nord-est', 'Comuna del departamento Nord-Est', 19.515422, -71.93082),
  ('haiti-nord-est-sainte-suzanne', 'Sainte Suzanne', 'haiti-nord-est', 'Comuna del departamento Nord-Est', 19.532821, -72.061457),
  ('haiti-nord-est-terrier-rouge', 'Terrier Rouge', 'haiti-nord-est', 'Comuna del departamento Nord-Est', 19.627663, -71.94406),
  ('haiti-nord-est-trou-du-nord', 'Trou du Nord', 'haiti-nord-est', 'Comuna del departamento Nord-Est', 19.582071, -72.012707),
  ('haiti-nord-est-vallieres', 'Vallières', 'haiti-nord-est', 'Comuna del departamento Nord-Est', 19.441061, -71.948544),
  ('haiti-nord-ouest-anse-a-foleur', 'Anse-à-Foleur', 'haiti-nord-ouest', 'Comuna del departamento Nord-Ouest', 19.860299, -72.625817),
  ('haiti-nord-ouest-baie-de-henne', 'Baie de Henne', 'haiti-nord-ouest', 'Comuna del departamento Nord-Ouest', 19.708985, -73.202488),
  ('haiti-nord-ouest-bassin-bleu', 'Bassin Bleu', 'haiti-nord-ouest', 'Comuna del departamento Nord-Ouest', 19.787483, -72.849),
  ('haiti-nord-ouest-bombardopolis', 'Bombardopolis', 'haiti-nord-ouest', 'Comuna del departamento Nord-Ouest', 19.697321, -73.347152),
  ('haiti-nord-ouest-chamsolme', 'Chamsolme', 'haiti-nord-ouest', 'Comuna del departamento Nord-Ouest', 19.859277, -72.81242),
  ('haiti-nord-ouest-jean-rabel', 'Jean Rabel', 'haiti-nord-ouest', 'Comuna del departamento Nord-Ouest', 19.81281, -73.140953),
  ('haiti-nord-ouest-la-tortue', 'La Tortue', 'haiti-nord-ouest', 'Comuna del departamento Nord-Ouest', 20.040151, -72.783705),
  ('haiti-nord-ouest-mole-saint-nicolas', 'Mole Saint Nicolas', 'haiti-nord-ouest', 'Comuna del departamento Nord-Ouest', 19.770816, -73.376256),
  ('haiti-nord-ouest-port-de-paix', 'Port-de-Paix', 'haiti-nord-ouest', 'Comuna del departamento Nord-Ouest', 19.837342, -72.950326),
  ('haiti-nord-ouest-saint-louis-du-nord', 'Saint-Louis du Nord', 'haiti-nord-ouest', 'Comuna del departamento Nord-Ouest', 19.876248, -72.704619),
  ('haiti-nord-acul-du-nord', 'Acul du Nord', 'haiti-nord', 'Comuna del departamento Nord', 19.670572, -72.321732),
  ('haiti-nord-bahon', 'Bahon', 'haiti-nord', 'Comuna del departamento Nord', 19.450402, -72.119869),
  ('haiti-nord-bas-limbe', 'Bas Limbe', 'haiti-nord', 'Comuna del departamento Nord', 19.762419, -72.395059),
  ('haiti-nord-borgne', 'Borgne', 'haiti-nord', 'Comuna del departamento Nord', 19.806682, -72.572206),
  ('haiti-nord-cap-haitien', 'Cap-Haïtien', 'haiti-nord', 'Comuna del departamento Nord', 19.749318, -72.229358),
  ('haiti-nord-dondon', 'Dondon', 'haiti-nord', 'Comuna del departamento Nord', 19.520725, -72.269115),
  ('haiti-nord-grande-riviere-du-nord', 'Grande Riviere Du Nord', 'haiti-nord', 'Comuna del departamento Nord', 19.558042, -72.16373),
  ('haiti-nord-la-victoire', 'La Victoire', 'haiti-nord', 'Comuna del departamento Nord', 19.35161, -72.018895),
  ('haiti-nord-limbe', 'Limbé', 'haiti-nord', 'Comuna del departamento Nord', 19.645626, -72.417442),
  ('haiti-nord-limonade', 'Limonade', 'haiti-nord', 'Comuna del departamento Nord', 19.671101, -72.10361),
  ('haiti-nord-milot', 'Milot', 'haiti-nord', 'Comuna del departamento Nord', 19.646831, -72.218387),
  ('haiti-nord-pignon', 'Pignon', 'haiti-nord', 'Comuna del departamento Nord', 19.3298, -72.086066),
  ('haiti-nord-pilate', 'Pilate', 'haiti-nord', 'Comuna del departamento Nord', 19.687471, -72.54221),
  ('haiti-nord-plaine-du-nord', 'Plaine du Nord', 'haiti-nord', 'Comuna del departamento Nord', 19.670572, -72.259707),
  ('haiti-nord-plaisance', 'Plaisance', 'haiti-nord', 'Comuna del departamento Nord', 19.599569, -72.494004),
  ('haiti-nord-port-margot', 'Port-Margot', 'haiti-nord', 'Comuna del departamento Nord', 19.748667, -72.469025),
  ('haiti-nord-quartier-morin', 'Quartier Morin', 'haiti-nord', 'Comuna del departamento Nord', 19.6769, -72.165644),
  ('haiti-nord-ranquitte', 'Ranquitte', 'haiti-nord', 'Comuna del departamento Nord', 19.403529, -72.060776),
  ('haiti-nord-saint-raphael', 'Saint-Raphaël', 'haiti-nord', 'Comuna del departamento Nord', 19.396223, -72.181564),
  ('haiti-ouest-anse-a-galets', 'Anse a Galets', 'haiti-ouest', 'Comuna del departamento Ouest', 18.811923, -72.917117),
  ('haiti-ouest-arcahaie', 'Arcahaie', 'haiti-ouest', 'Comuna del departamento Ouest', 18.871371, -72.494008),
  ('haiti-ouest-cabaret', 'Cabaret', 'haiti-ouest', 'Comuna del departamento Ouest', 18.769325, -72.418454),
  ('haiti-ouest-carrefour', 'Carrefour', 'haiti-ouest', 'Comuna del departamento Ouest', 18.465279, -72.420377),
  ('haiti-ouest-cite-soleil', 'Cité Soleil', 'haiti-ouest', 'Comuna del departamento Ouest', 18.595335, -72.316431),
  ('haiti-ouest-cornillon-grand-bois', 'Cornillon / Grand Bois', 'haiti-ouest', 'Comuna del departamento Ouest', 18.68744, -71.930701),
  ('haiti-ouest-croix-des-bouquets', 'Croix-des-Bouquets', 'haiti-ouest', 'Comuna del departamento Ouest', 18.56587, -72.193842),
  ('haiti-ouest-delmas', 'Delmas', 'haiti-ouest', 'Comuna del departamento Ouest', 18.551396, -72.287185),
  ('haiti-ouest-fonds-verrettes', 'Fonds-Verrettes', 'haiti-ouest', 'Comuna del departamento Ouest', 18.361211, -71.838523),
  ('haiti-ouest-ganthier', 'Ganthier', 'haiti-ouest', 'Comuna del departamento Ouest', 18.484351, -72.016902),
  ('haiti-ouest-grand-goave', 'Grand-Goâve', 'haiti-ouest', 'Comuna del departamento Ouest', 18.35511, -72.750435),
  ('haiti-ouest-gressier', 'Gressier', 'haiti-ouest', 'Comuna del departamento Ouest', 18.511092, -72.515101),
  ('haiti-ouest-kenscoff', 'Kenscoff', 'haiti-ouest', 'Comuna del departamento Ouest', 18.412496, -72.293212),
  ('haiti-ouest-leogane', 'Léogâne', 'haiti-ouest', 'Comuna del departamento Ouest', 18.443664, -72.573704),
  ('haiti-ouest-petion-ville', 'Pétion-Ville', 'haiti-ouest', 'Comuna del departamento Ouest', 18.483698, -72.239559),
  ('haiti-ouest-petit-goave', 'Petit-Goâve', 'haiti-ouest', 'Comuna del departamento Ouest', 18.363467, -72.921829),
  ('haiti-ouest-pointe-a-raquette', 'Pointe a Raquette', 'haiti-ouest', 'Comuna del departamento Ouest', 18.856878, -73.181442),
  ('haiti-ouest-port-au-prince', 'Port-au-Prince', 'haiti-ouest', 'Comuna del departamento Ouest', 18.531114, -72.333306),
  ('haiti-ouest-tabarre', 'Tabarre', 'haiti-ouest', 'Comuna del departamento Ouest', 18.572983, -72.269374),
  ('haiti-ouest-thomazeau', 'Thomazeau', 'haiti-ouest', 'Comuna del departamento Ouest', 18.668011, -72.147277),
  ('haiti-sud-est-anse-a-pitre', 'Anse-a-Pitre', 'haiti-sud-est', 'Comuna del departamento Sud-Est', 18.163211, -71.80597),
  ('haiti-sud-est-bainet', 'Bainet', 'haiti-sud-est', 'Comuna del departamento Sud-Est', 18.215753, -72.760398),
  ('haiti-sud-est-belle-anse', 'Belle Anse', 'haiti-sud-est', 'Comuna del departamento Sud-Est', 18.275748, -72.078555),
  ('haiti-sud-est-cayes-jacmel', 'Cayes-Jacmel', 'haiti-sud-est', 'Comuna del departamento Sud-Est', 18.280258, -72.416604),
  ('haiti-sud-est-cotes-de-fer', 'Cotes de Fer', 'haiti-sud-est', 'Comuna del departamento Sud-Est', 18.241717, -72.953867),
  ('haiti-sud-est-grand-gosier', 'Grand Gosier', 'haiti-sud-est', 'Comuna del departamento Sud-Est', 18.254736, -71.900874),
  ('haiti-sud-est-jacmel', 'Jacmel', 'haiti-sud-est', 'Comuna del departamento Sud-Est', 18.288567, -72.553227),
  ('haiti-sud-est-la-vallee', 'La Vallee', 'haiti-sud-est', 'Comuna del departamento Sud-Est', 18.282912, -72.700921),
  ('haiti-sud-est-marigot', 'Marigot', 'haiti-sud-est', 'Comuna del departamento Sud-Est', 18.289478, -72.298374),
  ('haiti-sud-est-thiotte', 'Thiotte', 'haiti-sud-est', 'Comuna del departamento Sud-Est', 18.207038, -71.870677),
  ('haiti-sud-aquin', 'Aquin', 'haiti-sud', 'Comuna del departamento Sud', 18.276205, -73.215309),
  ('haiti-sud-arniquet', 'Arniquet', 'haiti-sud', 'Comuna del departamento Sud', 18.149798, -73.91201),
  ('haiti-sud-camp-perrin', 'Camp-Perrin', 'haiti-sud', 'Comuna del departamento Sud', 18.339034, -73.865133),
  ('haiti-sud-cavaillon', 'Cavaillon', 'haiti-sud', 'Comuna del departamento Sud', 18.321597, -73.63259),
  ('haiti-sud-chantal', 'Chantal', 'haiti-sud', 'Comuna del departamento Sud', 18.280701, -73.974358),
  ('haiti-sud-chardonnieres', 'Chardonnieres', 'haiti-sud', 'Comuna del departamento Sud', 18.32986, -74.095254),
  ('haiti-sud-coteaux', 'Coteaux', 'haiti-sud', 'Comuna del departamento Sud', 18.242783, -74.032078),
  ('haiti-sud-ile-a-vache', 'Ile a Vache', 'haiti-sud', 'Comuna del departamento Sud', 18.08306, -73.608833),
  ('haiti-sud-les-anglais', 'Les Anglais', 'haiti-sud', 'Comuna del departamento Sud', 18.350751, -74.176728),
  ('haiti-sud-les-cayes', 'Les Cayes', 'haiti-sud', 'Comuna del departamento Sud', 18.260156, -73.76597),
  ('haiti-sud-maniche', 'Maniche', 'haiti-sud', 'Comuna del departamento Sud', 18.36795, -73.75215),
  ('haiti-sud-port-a-piment', 'Port-à-Piment', 'haiti-sud', 'Comuna del departamento Sud', 18.282022, -74.071829),
  ('haiti-sud-port-salut', 'Port-Salut', 'haiti-sud', 'Comuna del departamento Sud', 18.0888, -73.898264),
  ('haiti-sud-roche-a-bateau', 'Roche a Bateau', 'haiti-sud', 'Comuna del departamento Sud', 18.197978, -73.969834),
  ('haiti-sud-saint-jean-du-sud', 'Saint Jean du Sud', 'haiti-sud', 'Comuna del departamento Sud', 18.07185, -73.844893),
  ('haiti-sud-saint-louis-du-sud', 'Saint Louis du Sud', 'haiti-sud', 'Comuna del departamento Sud', 18.277045, -73.523995),
  ('haiti-sud-tiburon', 'Tiburon', 'haiti-sud', 'Comuna del departamento Sud', 18.339708, -74.321704),
  ('haiti-sud-torbeck', 'Torbeck', 'haiti-sud', 'Comuna del departamento Sud', 18.242384, -73.867586);

-- Falla cerrado: si el esquema o los datos no son los que se revisaron, no
-- inserta nada en vez de dejar una carga a medias.
do $guard$
declare
  v_missing text;
begin
  select string_agg(distinct i.parent_slug, ', ') into v_missing
  from pg_temp.level4_rows i
  where not exists (
    select 1 from public.communities p
    where p.slug = i.parent_slug and p.level = 3
      and p.path = 'earth.north-america.haiti.' || p.slug
  );
  if v_missing is not null then
    raise exception 'AGORBIS_0094_MISSING_DEPARTMENT: %', v_missing;
  end if;

  select string_agg(i.slug, ', ') into v_missing
  from pg_temp.level4_rows i
  join public.communities c on c.slug = i.slug;
  if v_missing is not null then
    raise exception 'AGORBIS_0094_SLUG_TAKEN: %', v_missing;
  end if;
end;
$guard$;

insert into public.communities (slug, name, level, parent_id, path, emoji, description, lat, lng)
select i.slug, i.name, 4::smallint, p.id, p.path || '.' || i.slug, '🗺️', i.description, i.lat, i.lng
from pg_temp.level4_rows i
join public.communities p on p.slug = i.parent_slug;

do $check$
declare
  v_expected_level4 constant int := 140;
  v_level4 int;
begin
  select count(*) into v_level4 from public.communities
  where level = 4 and path like 'earth.north-america.haiti.%';
  if v_level4 <> v_expected_level4 then
    raise exception 'AGORBIS_0094_UNEXPECTED_TOTALS: nivel 4 %', v_level4;
  end if;
end;
$check$;

-- "on commit drop" no alcanza si otro borrador va en la misma transacción.
drop table pg_temp.level4_rows;

commit;
