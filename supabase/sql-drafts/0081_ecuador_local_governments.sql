-- =============================================================================
-- Agorbis · 0081 · Cantones de Ecuador como nivel 4 (D133)
-- -----------------------------------------------------------------------------
-- BORRADOR, NO APLICAR. Vive en supabase/sql-drafts/ hasta que el responsable
-- lo promueva; el número es provisional.
--
-- Generado por scripts/build-ecuador-level4-draft.mjs; no se edita a mano.
--
-- Va después de 0076 y de los borradores de Uruguay, Chile, Paraguay y Bolivia.
--
-- Fuente: Ecuador - Subnational Administrative Boundaries (COD-AB) de HDX,
-- con datos del INEC, licencia CC BY-IGO, hoja ecu_admgz_adm2, descargada
-- el 2026-11-20. 221 cantones bajo sus 24 provincias; quedan afuera la
-- isla y la zona en estudio que el INEC publica sin cantón.
--
-- Sin coordenadas: la capa no trae puntos y el GPS del onboarding sugiere
-- la provincia.
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
  ('ecuador-azuay-camilo-ponce-enriquez', 'Camilo Ponce Enríquez', 'ecuador-azuay', 'Cantón de la provincia de Azuay', null, null),
  ('ecuador-azuay-chordeleg', 'Chordeleg', 'ecuador-azuay', 'Cantón de la provincia de Azuay', null, null),
  ('ecuador-azuay-cuenca', 'Cuenca', 'ecuador-azuay', 'Cantón de la provincia de Azuay', null, null),
  ('ecuador-azuay-el-pan', 'El Pan', 'ecuador-azuay', 'Cantón de la provincia de Azuay', null, null),
  ('ecuador-azuay-giron', 'Girón', 'ecuador-azuay', 'Cantón de la provincia de Azuay', null, null),
  ('ecuador-azuay-guachapala', 'Guachapala', 'ecuador-azuay', 'Cantón de la provincia de Azuay', null, null),
  ('ecuador-azuay-gualaceo', 'Gualaceo', 'ecuador-azuay', 'Cantón de la provincia de Azuay', null, null),
  ('ecuador-azuay-nabon', 'Nabón', 'ecuador-azuay', 'Cantón de la provincia de Azuay', null, null),
  ('ecuador-azuay-ona', 'Oña', 'ecuador-azuay', 'Cantón de la provincia de Azuay', null, null),
  ('ecuador-azuay-paute', 'Paute', 'ecuador-azuay', 'Cantón de la provincia de Azuay', null, null),
  ('ecuador-azuay-pucara', 'Pucará', 'ecuador-azuay', 'Cantón de la provincia de Azuay', null, null),
  ('ecuador-azuay-san-fernando', 'San Fernando', 'ecuador-azuay', 'Cantón de la provincia de Azuay', null, null),
  ('ecuador-azuay-santa-isabel', 'Santa Isabel', 'ecuador-azuay', 'Cantón de la provincia de Azuay', null, null),
  ('ecuador-azuay-sevilla-de-oro', 'Sevilla de Oro', 'ecuador-azuay', 'Cantón de la provincia de Azuay', null, null),
  ('ecuador-azuay-sigsig', 'Sígsig', 'ecuador-azuay', 'Cantón de la provincia de Azuay', null, null),
  ('ecuador-bolivar-caluma', 'Caluma', 'ecuador-bolivar', 'Cantón de la provincia de Bolívar', null, null),
  ('ecuador-bolivar-chillanes', 'Chillanes', 'ecuador-bolivar', 'Cantón de la provincia de Bolívar', null, null),
  ('ecuador-bolivar-chimbo', 'Chimbo', 'ecuador-bolivar', 'Cantón de la provincia de Bolívar', null, null),
  ('ecuador-bolivar-echeandia', 'Echeandía', 'ecuador-bolivar', 'Cantón de la provincia de Bolívar', null, null),
  ('ecuador-bolivar-guaranda', 'Guaranda', 'ecuador-bolivar', 'Cantón de la provincia de Bolívar', null, null),
  ('ecuador-bolivar-las-naves', 'Las Naves', 'ecuador-bolivar', 'Cantón de la provincia de Bolívar', null, null),
  ('ecuador-bolivar-san-miguel', 'San Miguel', 'ecuador-bolivar', 'Cantón de la provincia de Bolívar', null, null),
  ('ecuador-canar-azogues', 'Azogues', 'ecuador-canar', 'Cantón de la provincia de Cañar', null, null),
  ('ecuador-canar-biblian', 'Biblián', 'ecuador-canar', 'Cantón de la provincia de Cañar', null, null),
  ('ecuador-canar-canar', 'Cañar', 'ecuador-canar', 'Cantón de la provincia de Cañar', null, null),
  ('ecuador-canar-deleg', 'Déleg', 'ecuador-canar', 'Cantón de la provincia de Cañar', null, null),
  ('ecuador-canar-el-tambo', 'El Tambo', 'ecuador-canar', 'Cantón de la provincia de Cañar', null, null),
  ('ecuador-canar-la-troncal', 'La Troncal', 'ecuador-canar', 'Cantón de la provincia de Cañar', null, null),
  ('ecuador-canar-suscal', 'Suscal', 'ecuador-canar', 'Cantón de la provincia de Cañar', null, null),
  ('ecuador-carchi-bolivar', 'Bolívar', 'ecuador-carchi', 'Cantón de la provincia de Carchi', null, null),
  ('ecuador-carchi-espejo', 'Espejo', 'ecuador-carchi', 'Cantón de la provincia de Carchi', null, null),
  ('ecuador-carchi-mira', 'Mira', 'ecuador-carchi', 'Cantón de la provincia de Carchi', null, null),
  ('ecuador-carchi-montufar', 'Montúfar', 'ecuador-carchi', 'Cantón de la provincia de Carchi', null, null),
  ('ecuador-carchi-san-pedro-de-huaca', 'San Pedro de Huaca', 'ecuador-carchi', 'Cantón de la provincia de Carchi', null, null),
  ('ecuador-carchi-tulcan', 'Tulcán', 'ecuador-carchi', 'Cantón de la provincia de Carchi', null, null),
  ('ecuador-chimborazo-alausi', 'Alausí', 'ecuador-chimborazo', 'Cantón de la provincia de Chimborazo', null, null),
  ('ecuador-chimborazo-chambo', 'Chambo', 'ecuador-chimborazo', 'Cantón de la provincia de Chimborazo', null, null),
  ('ecuador-chimborazo-chunchi', 'Chunchi', 'ecuador-chimborazo', 'Cantón de la provincia de Chimborazo', null, null),
  ('ecuador-chimborazo-colta', 'Colta', 'ecuador-chimborazo', 'Cantón de la provincia de Chimborazo', null, null),
  ('ecuador-chimborazo-cumanda', 'Cumandá', 'ecuador-chimborazo', 'Cantón de la provincia de Chimborazo', null, null),
  ('ecuador-chimborazo-guamote', 'Guamote', 'ecuador-chimborazo', 'Cantón de la provincia de Chimborazo', null, null),
  ('ecuador-chimborazo-guano', 'Guano', 'ecuador-chimborazo', 'Cantón de la provincia de Chimborazo', null, null),
  ('ecuador-chimborazo-pallatanga', 'Pallatanga', 'ecuador-chimborazo', 'Cantón de la provincia de Chimborazo', null, null),
  ('ecuador-chimborazo-penipe', 'Penipe', 'ecuador-chimborazo', 'Cantón de la provincia de Chimborazo', null, null),
  ('ecuador-chimborazo-riobamba', 'Riobamba', 'ecuador-chimborazo', 'Cantón de la provincia de Chimborazo', null, null),
  ('ecuador-cotopaxi-la-mana', 'La Maná', 'ecuador-cotopaxi', 'Cantón de la provincia de Cotopaxi', null, null),
  ('ecuador-cotopaxi-latacunga', 'Latacunga', 'ecuador-cotopaxi', 'Cantón de la provincia de Cotopaxi', null, null),
  ('ecuador-cotopaxi-pangua', 'Pangua', 'ecuador-cotopaxi', 'Cantón de la provincia de Cotopaxi', null, null),
  ('ecuador-cotopaxi-pujili', 'Pujilí', 'ecuador-cotopaxi', 'Cantón de la provincia de Cotopaxi', null, null),
  ('ecuador-cotopaxi-salcedo', 'Salcedo', 'ecuador-cotopaxi', 'Cantón de la provincia de Cotopaxi', null, null),
  ('ecuador-cotopaxi-saquisili', 'Saquisilí', 'ecuador-cotopaxi', 'Cantón de la provincia de Cotopaxi', null, null),
  ('ecuador-cotopaxi-sigchos', 'Sigchos', 'ecuador-cotopaxi', 'Cantón de la provincia de Cotopaxi', null, null),
  ('ecuador-el-oro-arenillas', 'Arenillas', 'ecuador-el-oro', 'Cantón de la provincia de El Oro', null, null),
  ('ecuador-el-oro-atahualpa', 'Atahualpa', 'ecuador-el-oro', 'Cantón de la provincia de El Oro', null, null),
  ('ecuador-el-oro-balsas', 'Balsas', 'ecuador-el-oro', 'Cantón de la provincia de El Oro', null, null),
  ('ecuador-el-oro-chilla', 'Chilla', 'ecuador-el-oro', 'Cantón de la provincia de El Oro', null, null),
  ('ecuador-el-oro-el-guabo', 'El Guabo', 'ecuador-el-oro', 'Cantón de la provincia de El Oro', null, null),
  ('ecuador-el-oro-huaquillas', 'Huaquillas', 'ecuador-el-oro', 'Cantón de la provincia de El Oro', null, null),
  ('ecuador-el-oro-las-lajas', 'Las Lajas', 'ecuador-el-oro', 'Cantón de la provincia de El Oro', null, null),
  ('ecuador-el-oro-machala', 'Machala', 'ecuador-el-oro', 'Cantón de la provincia de El Oro', null, null),
  ('ecuador-el-oro-marcabeli', 'Marcabelí', 'ecuador-el-oro', 'Cantón de la provincia de El Oro', null, null),
  ('ecuador-el-oro-pasaje', 'Pasaje', 'ecuador-el-oro', 'Cantón de la provincia de El Oro', null, null),
  ('ecuador-el-oro-pinas', 'Piñas', 'ecuador-el-oro', 'Cantón de la provincia de El Oro', null, null),
  ('ecuador-el-oro-portovelo', 'Portovelo', 'ecuador-el-oro', 'Cantón de la provincia de El Oro', null, null),
  ('ecuador-el-oro-santa-rosa', 'Santa Rosa', 'ecuador-el-oro', 'Cantón de la provincia de El Oro', null, null),
  ('ecuador-el-oro-zaruma', 'Zaruma', 'ecuador-el-oro', 'Cantón de la provincia de El Oro', null, null),
  ('ecuador-esmeraldas-atacames', 'Atacames', 'ecuador-esmeraldas', 'Cantón de la provincia de Esmeraldas', null, null),
  ('ecuador-esmeraldas-eloy-alfaro', 'Eloy Alfaro', 'ecuador-esmeraldas', 'Cantón de la provincia de Esmeraldas', null, null),
  ('ecuador-esmeraldas-esmeraldas', 'Esmeraldas', 'ecuador-esmeraldas', 'Cantón de la provincia de Esmeraldas', null, null),
  ('ecuador-esmeraldas-muisne', 'Muisne', 'ecuador-esmeraldas', 'Cantón de la provincia de Esmeraldas', null, null),
  ('ecuador-esmeraldas-quininde', 'Quinindé', 'ecuador-esmeraldas', 'Cantón de la provincia de Esmeraldas', null, null),
  ('ecuador-esmeraldas-rioverde', 'Rioverde', 'ecuador-esmeraldas', 'Cantón de la provincia de Esmeraldas', null, null),
  ('ecuador-esmeraldas-san-lorenzo', 'San Lorenzo', 'ecuador-esmeraldas', 'Cantón de la provincia de Esmeraldas', null, null),
  ('ecuador-galapagos-isabela', 'Isabela', 'ecuador-galapagos', 'Cantón de la provincia de Galápagos', null, null),
  ('ecuador-galapagos-san-cristobal', 'San Cristóbal', 'ecuador-galapagos', 'Cantón de la provincia de Galápagos', null, null),
  ('ecuador-galapagos-santa-cruz', 'Santa Cruz', 'ecuador-galapagos', 'Cantón de la provincia de Galápagos', null, null),
  ('ecuador-guayas-alfredo-baquerizo-moreno-jujan', 'Alfredo Baquerizo Moreno (Juján)', 'ecuador-guayas', 'Cantón de la provincia de Guayas', null, null),
  ('ecuador-guayas-balao', 'Balao', 'ecuador-guayas', 'Cantón de la provincia de Guayas', null, null),
  ('ecuador-guayas-balzar', 'Balzar', 'ecuador-guayas', 'Cantón de la provincia de Guayas', null, null),
  ('ecuador-guayas-colimes', 'Colimes', 'ecuador-guayas', 'Cantón de la provincia de Guayas', null, null),
  ('ecuador-guayas-coronel-marcelino-mariduena', 'Coronel Marcelino Maridueña', 'ecuador-guayas', 'Cantón de la provincia de Guayas', null, null),
  ('ecuador-guayas-daule', 'Daule', 'ecuador-guayas', 'Cantón de la provincia de Guayas', null, null),
  ('ecuador-guayas-duran', 'Durán', 'ecuador-guayas', 'Cantón de la provincia de Guayas', null, null),
  ('ecuador-guayas-el-empalme', 'El Empalme', 'ecuador-guayas', 'Cantón de la provincia de Guayas', null, null),
  ('ecuador-guayas-el-triunfo', 'El Triunfo', 'ecuador-guayas', 'Cantón de la provincia de Guayas', null, null),
  ('ecuador-guayas-general-antonio-elizalde', 'General Antonio Elizalde', 'ecuador-guayas', 'Cantón de la provincia de Guayas', null, null),
  ('ecuador-guayas-guayaquil', 'Guayaquil', 'ecuador-guayas', 'Cantón de la provincia de Guayas', null, null),
  ('ecuador-guayas-isidro-ayora', 'Isidro Ayora', 'ecuador-guayas', 'Cantón de la provincia de Guayas', null, null),
  ('ecuador-guayas-lomas-de-sargentillo', 'Lomas de Sargentillo', 'ecuador-guayas', 'Cantón de la provincia de Guayas', null, null),
  ('ecuador-guayas-milagro', 'Milagro', 'ecuador-guayas', 'Cantón de la provincia de Guayas', null, null),
  ('ecuador-guayas-naranjal', 'Naranjal', 'ecuador-guayas', 'Cantón de la provincia de Guayas', null, null),
  ('ecuador-guayas-naranjito', 'Naranjito', 'ecuador-guayas', 'Cantón de la provincia de Guayas', null, null),
  ('ecuador-guayas-nobol', 'Nobol', 'ecuador-guayas', 'Cantón de la provincia de Guayas', null, null),
  ('ecuador-guayas-palestina', 'Palestina', 'ecuador-guayas', 'Cantón de la provincia de Guayas', null, null),
  ('ecuador-guayas-pedro-carbo', 'Pedro Carbo', 'ecuador-guayas', 'Cantón de la provincia de Guayas', null, null),
  ('ecuador-guayas-playas', 'Playas', 'ecuador-guayas', 'Cantón de la provincia de Guayas', null, null),
  ('ecuador-guayas-salitre', 'Salitre', 'ecuador-guayas', 'Cantón de la provincia de Guayas', null, null),
  ('ecuador-guayas-samborondon', 'Samborondón', 'ecuador-guayas', 'Cantón de la provincia de Guayas', null, null),
  ('ecuador-guayas-san-jacinto-de-yaguachi', 'San Jacinto de Yaguachi', 'ecuador-guayas', 'Cantón de la provincia de Guayas', null, null),
  ('ecuador-guayas-santa-lucia', 'Santa Lucía', 'ecuador-guayas', 'Cantón de la provincia de Guayas', null, null),
  ('ecuador-guayas-simon-bolivar', 'Simón Bolívar', 'ecuador-guayas', 'Cantón de la provincia de Guayas', null, null),
  ('ecuador-imbabura-antonio-ante', 'Antonio Ante', 'ecuador-imbabura', 'Cantón de la provincia de Imbabura', null, null),
  ('ecuador-imbabura-cotacachi', 'Cotacachi', 'ecuador-imbabura', 'Cantón de la provincia de Imbabura', null, null),
  ('ecuador-imbabura-ibarra', 'Ibarra', 'ecuador-imbabura', 'Cantón de la provincia de Imbabura', null, null),
  ('ecuador-imbabura-otavalo', 'Otavalo', 'ecuador-imbabura', 'Cantón de la provincia de Imbabura', null, null),
  ('ecuador-imbabura-pimampiro', 'Pimampiro', 'ecuador-imbabura', 'Cantón de la provincia de Imbabura', null, null),
  ('ecuador-imbabura-san-miguel-de-urcuqui', 'San Miguel de Urcuquí', 'ecuador-imbabura', 'Cantón de la provincia de Imbabura', null, null),
  ('ecuador-loja-calvas', 'Calvas', 'ecuador-loja', 'Cantón de la provincia de Loja', null, null),
  ('ecuador-loja-catamayo', 'Catamayo', 'ecuador-loja', 'Cantón de la provincia de Loja', null, null),
  ('ecuador-loja-celica', 'Celica', 'ecuador-loja', 'Cantón de la provincia de Loja', null, null),
  ('ecuador-loja-chaguarpamba', 'Chaguarpamba', 'ecuador-loja', 'Cantón de la provincia de Loja', null, null),
  ('ecuador-loja-espindola', 'Espíndola', 'ecuador-loja', 'Cantón de la provincia de Loja', null, null),
  ('ecuador-loja-gonzanama', 'Gonzanamá', 'ecuador-loja', 'Cantón de la provincia de Loja', null, null),
  ('ecuador-loja-loja', 'Loja', 'ecuador-loja', 'Cantón de la provincia de Loja', null, null),
  ('ecuador-loja-macara', 'Macará', 'ecuador-loja', 'Cantón de la provincia de Loja', null, null),
  ('ecuador-loja-olmedo', 'Olmedo', 'ecuador-loja', 'Cantón de la provincia de Loja', null, null),
  ('ecuador-loja-paltas', 'Paltas', 'ecuador-loja', 'Cantón de la provincia de Loja', null, null),
  ('ecuador-loja-pindal', 'Pindal', 'ecuador-loja', 'Cantón de la provincia de Loja', null, null),
  ('ecuador-loja-puyango', 'Puyango', 'ecuador-loja', 'Cantón de la provincia de Loja', null, null),
  ('ecuador-loja-quilanga', 'Quilanga', 'ecuador-loja', 'Cantón de la provincia de Loja', null, null),
  ('ecuador-loja-saraguro', 'Saraguro', 'ecuador-loja', 'Cantón de la provincia de Loja', null, null),
  ('ecuador-loja-sozoranga', 'Sozoranga', 'ecuador-loja', 'Cantón de la provincia de Loja', null, null),
  ('ecuador-loja-zapotillo', 'Zapotillo', 'ecuador-loja', 'Cantón de la provincia de Loja', null, null),
  ('ecuador-los-rios-baba', 'Baba', 'ecuador-los-rios', 'Cantón de la provincia de Los Ríos', null, null),
  ('ecuador-los-rios-babahoyo', 'Babahoyo', 'ecuador-los-rios', 'Cantón de la provincia de Los Ríos', null, null),
  ('ecuador-los-rios-buena-fe', 'Buena Fe', 'ecuador-los-rios', 'Cantón de la provincia de Los Ríos', null, null),
  ('ecuador-los-rios-mocache', 'Mocache', 'ecuador-los-rios', 'Cantón de la provincia de Los Ríos', null, null),
  ('ecuador-los-rios-montalvo', 'Montalvo', 'ecuador-los-rios', 'Cantón de la provincia de Los Ríos', null, null),
  ('ecuador-los-rios-palenque', 'Palenque', 'ecuador-los-rios', 'Cantón de la provincia de Los Ríos', null, null),
  ('ecuador-los-rios-puebloviejo', 'Puebloviejo', 'ecuador-los-rios', 'Cantón de la provincia de Los Ríos', null, null),
  ('ecuador-los-rios-quevedo', 'Quevedo', 'ecuador-los-rios', 'Cantón de la provincia de Los Ríos', null, null),
  ('ecuador-los-rios-quinsaloma', 'Quinsaloma', 'ecuador-los-rios', 'Cantón de la provincia de Los Ríos', null, null),
  ('ecuador-los-rios-urdaneta', 'Urdaneta', 'ecuador-los-rios', 'Cantón de la provincia de Los Ríos', null, null),
  ('ecuador-los-rios-valencia', 'Valencia', 'ecuador-los-rios', 'Cantón de la provincia de Los Ríos', null, null),
  ('ecuador-los-rios-ventanas', 'Ventanas', 'ecuador-los-rios', 'Cantón de la provincia de Los Ríos', null, null),
  ('ecuador-los-rios-vinces', 'Vinces', 'ecuador-los-rios', 'Cantón de la provincia de Los Ríos', null, null),
  ('ecuador-manabi-24-de-mayo', '24 de Mayo', 'ecuador-manabi', 'Cantón de la provincia de Manabí', null, null),
  ('ecuador-manabi-bolivar', 'Bolívar', 'ecuador-manabi', 'Cantón de la provincia de Manabí', null, null),
  ('ecuador-manabi-chone', 'Chone', 'ecuador-manabi', 'Cantón de la provincia de Manabí', null, null),
  ('ecuador-manabi-el-carmen', 'El Carmen', 'ecuador-manabi', 'Cantón de la provincia de Manabí', null, null),
  ('ecuador-manabi-flavio-alfaro', 'Flavio Alfaro', 'ecuador-manabi', 'Cantón de la provincia de Manabí', null, null),
  ('ecuador-manabi-jama', 'Jama', 'ecuador-manabi', 'Cantón de la provincia de Manabí', null, null),
  ('ecuador-manabi-jaramijo', 'Jaramijó', 'ecuador-manabi', 'Cantón de la provincia de Manabí', null, null),
  ('ecuador-manabi-jipijapa', 'Jipijapa', 'ecuador-manabi', 'Cantón de la provincia de Manabí', null, null),
  ('ecuador-manabi-junin', 'Junín', 'ecuador-manabi', 'Cantón de la provincia de Manabí', null, null),
  ('ecuador-manabi-manta', 'Manta', 'ecuador-manabi', 'Cantón de la provincia de Manabí', null, null),
  ('ecuador-manabi-montecristi', 'Montecristi', 'ecuador-manabi', 'Cantón de la provincia de Manabí', null, null),
  ('ecuador-manabi-olmedo', 'Olmedo', 'ecuador-manabi', 'Cantón de la provincia de Manabí', null, null),
  ('ecuador-manabi-pajan', 'Paján', 'ecuador-manabi', 'Cantón de la provincia de Manabí', null, null),
  ('ecuador-manabi-pedernales', 'Pedernales', 'ecuador-manabi', 'Cantón de la provincia de Manabí', null, null),
  ('ecuador-manabi-pichincha', 'Pichincha', 'ecuador-manabi', 'Cantón de la provincia de Manabí', null, null),
  ('ecuador-manabi-portoviejo', 'Portoviejo', 'ecuador-manabi', 'Cantón de la provincia de Manabí', null, null),
  ('ecuador-manabi-puerto-lopez', 'Puerto López', 'ecuador-manabi', 'Cantón de la provincia de Manabí', null, null),
  ('ecuador-manabi-rocafuerte', 'Rocafuerte', 'ecuador-manabi', 'Cantón de la provincia de Manabí', null, null),
  ('ecuador-manabi-san-vicente', 'San Vicente', 'ecuador-manabi', 'Cantón de la provincia de Manabí', null, null),
  ('ecuador-manabi-santa-ana', 'Santa Ana', 'ecuador-manabi', 'Cantón de la provincia de Manabí', null, null),
  ('ecuador-manabi-sucre', 'Sucre', 'ecuador-manabi', 'Cantón de la provincia de Manabí', null, null),
  ('ecuador-manabi-tosagua', 'Tosagua', 'ecuador-manabi', 'Cantón de la provincia de Manabí', null, null),
  ('ecuador-morona-santiago-gualaquiza', 'Gualaquiza', 'ecuador-morona-santiago', 'Cantón de la provincia de Morona Santiago', null, null),
  ('ecuador-morona-santiago-huamboya', 'Huamboya', 'ecuador-morona-santiago', 'Cantón de la provincia de Morona Santiago', null, null),
  ('ecuador-morona-santiago-limon-indanza', 'Limón Indanza', 'ecuador-morona-santiago', 'Cantón de la provincia de Morona Santiago', null, null),
  ('ecuador-morona-santiago-logrono', 'Logroño', 'ecuador-morona-santiago', 'Cantón de la provincia de Morona Santiago', null, null),
  ('ecuador-morona-santiago-morona', 'Morona', 'ecuador-morona-santiago', 'Cantón de la provincia de Morona Santiago', null, null),
  ('ecuador-morona-santiago-pablo-sexto', 'Pablo Sexto', 'ecuador-morona-santiago', 'Cantón de la provincia de Morona Santiago', null, null),
  ('ecuador-morona-santiago-palora', 'Palora', 'ecuador-morona-santiago', 'Cantón de la provincia de Morona Santiago', null, null),
  ('ecuador-morona-santiago-san-juan-bosco', 'San Juan Bosco', 'ecuador-morona-santiago', 'Cantón de la provincia de Morona Santiago', null, null),
  ('ecuador-morona-santiago-santiago', 'Santiago', 'ecuador-morona-santiago', 'Cantón de la provincia de Morona Santiago', null, null),
  ('ecuador-morona-santiago-sucua', 'Sucúa', 'ecuador-morona-santiago', 'Cantón de la provincia de Morona Santiago', null, null),
  ('ecuador-morona-santiago-taisha', 'Taisha', 'ecuador-morona-santiago', 'Cantón de la provincia de Morona Santiago', null, null),
  ('ecuador-morona-santiago-tiwintza', 'Tiwintza', 'ecuador-morona-santiago', 'Cantón de la provincia de Morona Santiago', null, null),
  ('ecuador-napo-archidona', 'Archidona', 'ecuador-napo', 'Cantón de la provincia de Napo', null, null),
  ('ecuador-napo-carlos-julio-arosemena-tola', 'Carlos Julio Arosemena Tola', 'ecuador-napo', 'Cantón de la provincia de Napo', null, null),
  ('ecuador-napo-el-chaco', 'El Chaco', 'ecuador-napo', 'Cantón de la provincia de Napo', null, null),
  ('ecuador-napo-quijos', 'Quijos', 'ecuador-napo', 'Cantón de la provincia de Napo', null, null),
  ('ecuador-napo-tena', 'Tena', 'ecuador-napo', 'Cantón de la provincia de Napo', null, null),
  ('ecuador-orellana-aguarico', 'Aguarico', 'ecuador-orellana', 'Cantón de la provincia de Orellana', null, null),
  ('ecuador-orellana-francisco-de-orellana', 'Francisco de Orellana', 'ecuador-orellana', 'Cantón de la provincia de Orellana', null, null),
  ('ecuador-orellana-la-joya-de-los-sachas', 'La Joya de los Sachas', 'ecuador-orellana', 'Cantón de la provincia de Orellana', null, null),
  ('ecuador-orellana-loreto', 'Loreto', 'ecuador-orellana', 'Cantón de la provincia de Orellana', null, null),
  ('ecuador-pastaza-arajuno', 'Arajuno', 'ecuador-pastaza', 'Cantón de la provincia de Pastaza', null, null),
  ('ecuador-pastaza-mera', 'Mera', 'ecuador-pastaza', 'Cantón de la provincia de Pastaza', null, null),
  ('ecuador-pastaza-pastaza', 'Pastaza', 'ecuador-pastaza', 'Cantón de la provincia de Pastaza', null, null),
  ('ecuador-pastaza-santa-clara', 'Santa Clara', 'ecuador-pastaza', 'Cantón de la provincia de Pastaza', null, null),
  ('ecuador-pichincha-cayambe', 'Cayambe', 'ecuador-pichincha', 'Cantón de la provincia de Pichincha', null, null),
  ('ecuador-pichincha-distrito-metropolitano-de-quito', 'Distrito Metropolitano de Quito', 'ecuador-pichincha', 'Cantón de la provincia de Pichincha', null, null),
  ('ecuador-pichincha-mejia', 'Mejía', 'ecuador-pichincha', 'Cantón de la provincia de Pichincha', null, null),
  ('ecuador-pichincha-pedro-moncayo', 'Pedro Moncayo', 'ecuador-pichincha', 'Cantón de la provincia de Pichincha', null, null),
  ('ecuador-pichincha-pedro-vicente-maldonado', 'Pedro Vicente Maldonado', 'ecuador-pichincha', 'Cantón de la provincia de Pichincha', null, null),
  ('ecuador-pichincha-puerto-quito', 'Puerto Quito', 'ecuador-pichincha', 'Cantón de la provincia de Pichincha', null, null),
  ('ecuador-pichincha-ruminahui', 'Rumiñahui', 'ecuador-pichincha', 'Cantón de la provincia de Pichincha', null, null),
  ('ecuador-pichincha-san-miguel-de-los-bancos', 'San Miguel de los Bancos', 'ecuador-pichincha', 'Cantón de la provincia de Pichincha', null, null),
  ('ecuador-santa-elena-la-libertad', 'La Libertad', 'ecuador-santa-elena', 'Cantón de la provincia de Santa Elena', null, null),
  ('ecuador-santa-elena-salinas', 'Salinas', 'ecuador-santa-elena', 'Cantón de la provincia de Santa Elena', null, null),
  ('ecuador-santa-elena-santa-elena', 'Santa Elena', 'ecuador-santa-elena', 'Cantón de la provincia de Santa Elena', null, null),
  ('ecuador-santo-domingo-de-los-tsachilas-la-concordia', 'La Concordia', 'ecuador-santo-domingo-de-los-tsachilas', 'Cantón de la provincia de Santo Domingo de los Tsáchilas', null, null),
  ('ecuador-santo-domingo-de-los-tsachilas-santo-domingo', 'Santo Domingo', 'ecuador-santo-domingo-de-los-tsachilas', 'Cantón de la provincia de Santo Domingo de los Tsáchilas', null, null),
  ('ecuador-sucumbios-cascales', 'Cascales', 'ecuador-sucumbios', 'Cantón de la provincia de Sucumbíos', null, null),
  ('ecuador-sucumbios-cuyabeno', 'Cuyabeno', 'ecuador-sucumbios', 'Cantón de la provincia de Sucumbíos', null, null),
  ('ecuador-sucumbios-gonzalo-pizarro', 'Gonzalo Pizarro', 'ecuador-sucumbios', 'Cantón de la provincia de Sucumbíos', null, null),
  ('ecuador-sucumbios-lago-agrio', 'Lago Agrio', 'ecuador-sucumbios', 'Cantón de la provincia de Sucumbíos', null, null),
  ('ecuador-sucumbios-putumayo', 'Putumayo', 'ecuador-sucumbios', 'Cantón de la provincia de Sucumbíos', null, null),
  ('ecuador-sucumbios-shushufindi', 'Shushufindi', 'ecuador-sucumbios', 'Cantón de la provincia de Sucumbíos', null, null),
  ('ecuador-sucumbios-sucumbios', 'Sucumbíos', 'ecuador-sucumbios', 'Cantón de la provincia de Sucumbíos', null, null),
  ('ecuador-tungurahua-ambato', 'Ambato', 'ecuador-tungurahua', 'Cantón de la provincia de Tungurahua', null, null),
  ('ecuador-tungurahua-banos-de-agua-santa', 'Baños de Agua Santa', 'ecuador-tungurahua', 'Cantón de la provincia de Tungurahua', null, null),
  ('ecuador-tungurahua-cevallos', 'Cevallos', 'ecuador-tungurahua', 'Cantón de la provincia de Tungurahua', null, null),
  ('ecuador-tungurahua-mocha', 'Mocha', 'ecuador-tungurahua', 'Cantón de la provincia de Tungurahua', null, null),
  ('ecuador-tungurahua-patate', 'Patate', 'ecuador-tungurahua', 'Cantón de la provincia de Tungurahua', null, null),
  ('ecuador-tungurahua-quero', 'Quero', 'ecuador-tungurahua', 'Cantón de la provincia de Tungurahua', null, null),
  ('ecuador-tungurahua-san-pedro-de-pelileo', 'San Pedro de Pelileo', 'ecuador-tungurahua', 'Cantón de la provincia de Tungurahua', null, null),
  ('ecuador-tungurahua-santiago-de-pillaro', 'Santiago de Píllaro', 'ecuador-tungurahua', 'Cantón de la provincia de Tungurahua', null, null),
  ('ecuador-tungurahua-tisaleo', 'Tisaleo', 'ecuador-tungurahua', 'Cantón de la provincia de Tungurahua', null, null),
  ('ecuador-zamora-chinchipe-centinela-del-condor', 'Centinela del Cóndor', 'ecuador-zamora-chinchipe', 'Cantón de la provincia de Zamora Chinchipe', null, null),
  ('ecuador-zamora-chinchipe-chinchipe', 'Chinchipe', 'ecuador-zamora-chinchipe', 'Cantón de la provincia de Zamora Chinchipe', null, null),
  ('ecuador-zamora-chinchipe-el-pangui', 'El Pangui', 'ecuador-zamora-chinchipe', 'Cantón de la provincia de Zamora Chinchipe', null, null),
  ('ecuador-zamora-chinchipe-nangaritza', 'Nangaritza', 'ecuador-zamora-chinchipe', 'Cantón de la provincia de Zamora Chinchipe', null, null),
  ('ecuador-zamora-chinchipe-palanda', 'Palanda', 'ecuador-zamora-chinchipe', 'Cantón de la provincia de Zamora Chinchipe', null, null),
  ('ecuador-zamora-chinchipe-paquisha', 'Paquisha', 'ecuador-zamora-chinchipe', 'Cantón de la provincia de Zamora Chinchipe', null, null),
  ('ecuador-zamora-chinchipe-yacuambi', 'Yacuambi', 'ecuador-zamora-chinchipe', 'Cantón de la provincia de Zamora Chinchipe', null, null),
  ('ecuador-zamora-chinchipe-yantzaza', 'Yantzaza', 'ecuador-zamora-chinchipe', 'Cantón de la provincia de Zamora Chinchipe', null, null),
  ('ecuador-zamora-chinchipe-zamora', 'Zamora', 'ecuador-zamora-chinchipe', 'Cantón de la provincia de Zamora Chinchipe', null, null);

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
      and p.path = 'earth.south-america.ecuador.' || p.slug
  );
  if v_missing is not null then
    raise exception 'AGORBIS_0081_MISSING_PROVINCE: %', v_missing;
  end if;

  select string_agg(i.slug, ', ') into v_missing
  from pg_temp.level4_rows i
  join public.communities c on c.slug = i.slug;
  if v_missing is not null then
    raise exception 'AGORBIS_0081_SLUG_TAKEN: %', v_missing;
  end if;
end;
$guard$;

insert into public.communities (slug, name, level, parent_id, path, emoji, description, lat, lng)
select i.slug, i.name, 4::smallint, p.id, p.path || '.' || i.slug, '🗺️', i.description, i.lat, i.lng
from pg_temp.level4_rows i
join public.communities p on p.slug = i.parent_slug;

do $check$
declare
  v_expected_level4 constant int := 221;
  v_level4 int;
begin
  select count(*) into v_level4 from public.communities
  where level = 4 and path like 'earth.south-america.ecuador.%';
  if v_level4 <> v_expected_level4 then
    raise exception 'AGORBIS_0081_UNEXPECTED_TOTALS: nivel 4 %', v_level4;
  end if;
end;
$check$;

-- "on commit drop" no alcanza si otro borrador va en la misma transacción.
drop table pg_temp.level4_rows;

commit;
