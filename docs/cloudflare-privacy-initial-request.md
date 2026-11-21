# Consulta inicial a Cloudflare

Preparada el 08-09-2026. Sin enviar por el agente; pendiente de envío por el
responsable. Copiar el cuerpo desde el correo asociado a la cuenta Cloudflare.
Esta primera consulta usa enlaces públicos y no requiere adjuntos.

- **Para:** `legal@cloudflare.com`
- **CC:** `dpo@cloudflare.com`
- **Asunto:** `Agorbis — Argentina data transfers, Workers, DNS and Turnstile`

```text
Hello Cloudflare Legal and Privacy Teams,

I am Sebastian Cardoso Castillo, responsible for Agorbis (agorbis.com), a
civic participation service based in Argentina. The site is already publicly
accessible, and we are reviewing existing processing and a pending release.

We use authoritative DNS, Cloudflare Workers for the application, and
Turnstile for authentication protection, including a separate Supabase Auth
guard. Workers handles application requests and responses; user-submitted
posts, comments, claims and files may reveal political opinions or health
information. Not every request contains this information.

Could you please clarify, separately for Workers, DNS and Turnstile:

1. The applicable entities and processor/controller roles, data categories,
   processing and access countries, and onward transfers to subprocessors.
2. Retention and deletion periods for request content, logs, caches, security
   signals, account/support data and backups, including what remains after
   source deletion or account termination.
3. Which transfer instrument applies under Argentine law to processing on our
   behalf and processing for Cloudflare's own purposes. Are the AAIP/RIPD
   model clauses or another applicable supplementary instrument available?
4. How the described civic content is covered under the DPA and Developer
   Platform terms, and any required controls, restrictions or amendments.
5. Where we can obtain the current account-applicable DPA and transfer
   assessment. If any requested instrument requires a different plan, please
   explain the available path; this inquiry does not request an upgrade.

AAIP guidance and model clauses:
https://www.argentina.gob.ar/transferencias-internacionales

Thank you,
Sebastian Cardoso Castillo
Agorbis — agorbis.com
```

Contactos contrastados con el [DPA, Annex 1](https://www.cloudflare.com/cloudflare-customer-dpa/)
y el [aviso de Turnstile, contacto](https://www.cloudflare.com/turnstile-privacy-policy/).
El [pedido ampliado](TRANSFER_SAFEGUARDS_REQUESTS.md#cloudflare) conserva las
preguntas detalladas para seguimiento. Este mensaje inicial no afirma que se
adjuntan modelos, que se aceptó un contrato nuevo o que existe una aprobación
argentina. Si ya se envió una consulta equivalente, continuar en ese hilo.
