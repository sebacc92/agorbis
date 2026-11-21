-- =============================================================================
-- Agorbis · 0051 · Evidencia compatible con el límite de Vercel Functions
-- -----------------------------------------------------------------------------
-- El formulario admite cuatro fotos. Mantener cada objeto por debajo de
-- 950 KiB deja el multipart completo con margen frente al límite de 4,5 MB de
-- la función Edge y garantiza que el proxy también pueda entregar la imagen.
-- La validación del servidor usa exactamente el mismo tope.
-- =============================================================================

update storage.buckets
set file_size_limit = 950 * 1024
where id = 'claims';
