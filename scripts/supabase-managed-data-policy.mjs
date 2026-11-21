import { createHash } from "node:crypto";

export const MANAGED_DATA_POLICY_VERSION =
  "supabase-cli-2.115.0-storage-v1.70.7/v1";

export const MANAGED_HISTORY_TABLES = Object.freeze([
  "auth.schema_migrations",
  "storage.migrations",
]);

export const MANAGED_DATA_EXCLUSIONS = Object.freeze([
  Object.freeze({
    table: "storage.buckets_vectors",
    reason:
      "Metadata administrada de Supabase Vector Storage; la guía oficial de backup data-only exige excluirla y el estado vacío lo reconstruye Storage.",
  }),
  Object.freeze({
    table: "storage.vector_indexes",
    reason:
      "Metadata administrada de Supabase Vector Storage; la guía oficial de backup data-only exige excluirla y el estado vacío lo reconstruye Storage.",
  }),
]);

// Las firmas SHA-256 comprometen la lista completa y ordenada de columnas y la
// ACL normalizada de cada tabla. Se completan desde el baseline auditado del
// stack local fijado a Storage v1.70.7/Auth v2.195.0.
export const EXPECTED_MANAGED_DATA_TABLES = Object.freeze([
  Object.freeze({
    table: "auth.audit_log_entries",
    owner: "supabase_auth_admin",
    columnSignatureSha256:
      "3eb18f7b8e93c9c0abc90c5eda1c4f522b6c86b57c306f96525bb8946c3bf5fd",
    aclSignatureSha256:
      "60a6c95375fe6484d75bfb7a1e09ecaf8a2f881014eb1661004a20b465906efe",
    excluded: false,
  }),
  Object.freeze({
    table: "auth.custom_oauth_providers",
    owner: "supabase_auth_admin",
    columnSignatureSha256:
      "f012fbd7c044a310c191661d52a886820e095781f22eb018e32598501fe9a4af",
    aclSignatureSha256:
      "8319708fdb7f14f47f1b9eb2d12c7dd8dc1b63d97a1d4af2661c78e49c4cf5ba",
    excluded: false,
  }),
  Object.freeze({
    table: "auth.flow_state",
    owner: "supabase_auth_admin",
    columnSignatureSha256:
      "614fbc940766d895cfa3206a6b4bb86a965fd64121f719b7b88fd17f30f50231",
    aclSignatureSha256:
      "60a6c95375fe6484d75bfb7a1e09ecaf8a2f881014eb1661004a20b465906efe",
    excluded: false,
  }),
  Object.freeze({
    table: "auth.identities",
    owner: "supabase_auth_admin",
    columnSignatureSha256:
      "5c688d36a790bbeb35d686132ac3a90d48999a1b0857f5fc2739c42eb712f830",
    aclSignatureSha256:
      "60a6c95375fe6484d75bfb7a1e09ecaf8a2f881014eb1661004a20b465906efe",
    excluded: false,
  }),
  Object.freeze({
    table: "auth.instances",
    owner: "supabase_auth_admin",
    columnSignatureSha256:
      "778a505bde2a5f2681eabc28455bac575b32e50112aafbe7d3b9a880f1b1afda",
    aclSignatureSha256:
      "60a6c95375fe6484d75bfb7a1e09ecaf8a2f881014eb1661004a20b465906efe",
    excluded: false,
  }),
  Object.freeze({
    table: "auth.mfa_amr_claims",
    owner: "supabase_auth_admin",
    columnSignatureSha256:
      "b35e8da00a8c4e6688455cfc5cc6ba900fdef6af06622a8b756002d2a438f8ff",
    aclSignatureSha256:
      "60a6c95375fe6484d75bfb7a1e09ecaf8a2f881014eb1661004a20b465906efe",
    excluded: false,
  }),
  Object.freeze({
    table: "auth.mfa_challenges",
    owner: "supabase_auth_admin",
    columnSignatureSha256:
      "3d72acb82b48fea26bf9cb131157f19d810255aff516c7bb74de573fb8ada419",
    aclSignatureSha256:
      "60a6c95375fe6484d75bfb7a1e09ecaf8a2f881014eb1661004a20b465906efe",
    excluded: false,
  }),
  Object.freeze({
    table: "auth.mfa_factors",
    owner: "supabase_auth_admin",
    columnSignatureSha256:
      "b474b605f689bfc4d63c6745e4b5ef47b3dcc40044ea47eb11a726e4117f0969",
    aclSignatureSha256:
      "60a6c95375fe6484d75bfb7a1e09ecaf8a2f881014eb1661004a20b465906efe",
    excluded: false,
  }),
  Object.freeze({
    table: "auth.oauth_authorizations",
    owner: "supabase_auth_admin",
    columnSignatureSha256:
      "3a618f67e17d7b9950d0d45213304dc52ef488f4eb5b658edb2d856cd4bea557",
    aclSignatureSha256:
      "8319708fdb7f14f47f1b9eb2d12c7dd8dc1b63d97a1d4af2661c78e49c4cf5ba",
    excluded: false,
  }),
  Object.freeze({
    table: "auth.oauth_client_states",
    owner: "supabase_auth_admin",
    columnSignatureSha256:
      "4ca99fc928b0b2aad1d56043747173943de28979a90c6d54e05dd3beadc78b63",
    aclSignatureSha256:
      "8319708fdb7f14f47f1b9eb2d12c7dd8dc1b63d97a1d4af2661c78e49c4cf5ba",
    excluded: false,
  }),
  Object.freeze({
    table: "auth.oauth_clients",
    owner: "supabase_auth_admin",
    columnSignatureSha256:
      "dcf1f131da723025411db9819854787d2a3386fec3222c9e708e3ab414b4d333",
    aclSignatureSha256:
      "8319708fdb7f14f47f1b9eb2d12c7dd8dc1b63d97a1d4af2661c78e49c4cf5ba",
    excluded: false,
  }),
  Object.freeze({
    table: "auth.oauth_consents",
    owner: "supabase_auth_admin",
    columnSignatureSha256:
      "91c85da20ac81db54fae328eb82d54231bfdd7834765e05a40a136e0b67fee32",
    aclSignatureSha256:
      "8319708fdb7f14f47f1b9eb2d12c7dd8dc1b63d97a1d4af2661c78e49c4cf5ba",
    excluded: false,
  }),
  Object.freeze({
    table: "auth.one_time_tokens",
    owner: "supabase_auth_admin",
    columnSignatureSha256:
      "0c2b302c89a7b12ff050e23bbd89f1c2d927998f537bceee7984c39693f1d410",
    aclSignatureSha256:
      "60a6c95375fe6484d75bfb7a1e09ecaf8a2f881014eb1661004a20b465906efe",
    excluded: false,
  }),
  Object.freeze({
    table: "auth.refresh_tokens",
    owner: "supabase_auth_admin",
    columnSignatureSha256:
      "33c24cb958935a25f2b2a71279f85c75d64f421ce8d601cca7cd142855f74c5c",
    aclSignatureSha256:
      "60a6c95375fe6484d75bfb7a1e09ecaf8a2f881014eb1661004a20b465906efe",
    excluded: false,
  }),
  Object.freeze({
    table: "auth.saml_providers",
    owner: "supabase_auth_admin",
    columnSignatureSha256:
      "b9a2954a3aa63628c106b9987bc56c80a0fc8d424990e17d1afc8f4bf8c3b238",
    aclSignatureSha256:
      "60a6c95375fe6484d75bfb7a1e09ecaf8a2f881014eb1661004a20b465906efe",
    excluded: false,
  }),
  Object.freeze({
    table: "auth.saml_relay_states",
    owner: "supabase_auth_admin",
    columnSignatureSha256:
      "ff452b6f9ff75e5468654e6c4bebce20ad7d8d50b2e4a465124abcaa1171f4e4",
    aclSignatureSha256:
      "60a6c95375fe6484d75bfb7a1e09ecaf8a2f881014eb1661004a20b465906efe",
    excluded: false,
  }),
  Object.freeze({
    table: "auth.sessions",
    owner: "supabase_auth_admin",
    columnSignatureSha256:
      "470555c004f0e3797a7b7babb854dde37e95aedaeaab3f505c499bc47947c46e",
    aclSignatureSha256:
      "60a6c95375fe6484d75bfb7a1e09ecaf8a2f881014eb1661004a20b465906efe",
    excluded: false,
  }),
  Object.freeze({
    table: "auth.sso_domains",
    owner: "supabase_auth_admin",
    columnSignatureSha256:
      "fbed9aa2ee9930ac0288f194089ce5df9b7c37bb4d7be67d9be9416a511c0617",
    aclSignatureSha256:
      "60a6c95375fe6484d75bfb7a1e09ecaf8a2f881014eb1661004a20b465906efe",
    excluded: false,
  }),
  Object.freeze({
    table: "auth.sso_providers",
    owner: "supabase_auth_admin",
    columnSignatureSha256:
      "b40a6d4fed5e08d8c8ebd3a70731788c96ca97098f4b075e5c3ec9676f5e3fb4",
    aclSignatureSha256:
      "60a6c95375fe6484d75bfb7a1e09ecaf8a2f881014eb1661004a20b465906efe",
    excluded: false,
  }),
  Object.freeze({
    table: "auth.users",
    owner: "supabase_auth_admin",
    columnSignatureSha256:
      "14d45856066c6611b7f93d3de76cbc25f3569a74899db2cd9e6a47a1faf00210",
    aclSignatureSha256:
      "60a6c95375fe6484d75bfb7a1e09ecaf8a2f881014eb1661004a20b465906efe",
    excluded: false,
  }),
  Object.freeze({
    table: "auth.webauthn_challenges",
    owner: "supabase_auth_admin",
    columnSignatureSha256:
      "9c5c2dda508524b57bec2f76830448fcbb61de506e3fe4012c732782d3d2bdef",
    aclSignatureSha256:
      "8319708fdb7f14f47f1b9eb2d12c7dd8dc1b63d97a1d4af2661c78e49c4cf5ba",
    excluded: false,
  }),
  Object.freeze({
    table: "auth.webauthn_credentials",
    owner: "supabase_auth_admin",
    columnSignatureSha256:
      "63e018a9e5754ca8fb6e235a104c03101ab5662f956c86114b1f8d47b404c76e",
    aclSignatureSha256:
      "8319708fdb7f14f47f1b9eb2d12c7dd8dc1b63d97a1d4af2661c78e49c4cf5ba",
    excluded: false,
  }),
  Object.freeze({
    table: "storage.buckets",
    owner: "supabase_storage_admin",
    columnSignatureSha256:
      "fb7a74b95ffe8d1be60ff4c71a480e4c688775c574f12c411f3953a37ffb09df",
    aclSignatureSha256:
      "1154a4c538fc06cdc9c0d7174637bcb4157db07a753efa5eb75e5fba31967828",
    excluded: false,
  }),
  Object.freeze({
    table: "storage.buckets_analytics",
    owner: "supabase_storage_admin",
    columnSignatureSha256:
      "2260a69e1940c721b981f1775ab02dbe8ff7803107265748a9515cd63119cbd8",
    aclSignatureSha256:
      "b68fe4e3343078bbf6a652e4994a873d47186729fc98dbdaf7b73b4a90a02fb8",
    excluded: false,
  }),
  Object.freeze({
    table: "storage.buckets_vectors",
    owner: "supabase_storage_admin",
    columnSignatureSha256:
      "5502836d657d82da670be00bf1ba7189b50be905222c3a9c86bc7b01eafaec92",
    aclSignatureSha256:
      "9658469a3606725f208293d1b59ad5bbb7b9b96f0f23bf76ae3e7e0debc79dee",
    excluded: true,
  }),
  Object.freeze({
    table: "storage.iceberg_namespaces",
    owner: "supabase_storage_admin",
    columnSignatureSha256:
      "c7c7c16e87bc9ea437b9367b0abaa6c7abe6136070476c4e54e0e24d613c7ce1",
    aclSignatureSha256:
      "21f519cd7c56d6b8f44a834567b36e2df0174100707620e637571994917bbbd6",
    excluded: false,
  }),
  Object.freeze({
    table: "storage.iceberg_tables",
    owner: "supabase_storage_admin",
    columnSignatureSha256:
      "72e767fb1d93a1b3a96215977be94267f12c241c36b326dac520a03c65429cc9",
    aclSignatureSha256:
      "21f519cd7c56d6b8f44a834567b36e2df0174100707620e637571994917bbbd6",
    excluded: false,
  }),
  Object.freeze({
    table: "storage.objects",
    owner: "supabase_storage_admin",
    columnSignatureSha256:
      "14e674124dec759af3adf29f39d2c5fd1dc4423fed6e7231901a573344012dee",
    aclSignatureSha256:
      "1154a4c538fc06cdc9c0d7174637bcb4157db07a753efa5eb75e5fba31967828",
    excluded: false,
  }),
  Object.freeze({
    table: "storage.s3_multipart_uploads",
    owner: "supabase_storage_admin",
    columnSignatureSha256:
      "e5971b6c3be58f45aa65364a9fff577dc183398b857927d51c0f391d91f47b67",
    aclSignatureSha256:
      "21f519cd7c56d6b8f44a834567b36e2df0174100707620e637571994917bbbd6",
    excluded: false,
  }),
  Object.freeze({
    table: "storage.s3_multipart_uploads_parts",
    owner: "supabase_storage_admin",
    columnSignatureSha256:
      "da32b44193e51dfe9e4663db5deb3cc3cb7f0c5be1f8d1e50d7dc2fd592e7399",
    aclSignatureSha256:
      "21f519cd7c56d6b8f44a834567b36e2df0174100707620e637571994917bbbd6",
    excluded: false,
  }),
  Object.freeze({
    table: "storage.vector_indexes",
    owner: "supabase_storage_admin",
    columnSignatureSha256:
      "3b92ba7f5cc6bb5b21a132eaf3aadc6533d27f746eea46a7dc3782f5c7e8c6b9",
    aclSignatureSha256:
      "9658469a3606725f208293d1b59ad5bbb7b9b96f0f23bf76ae3e7e0debc79dee",
    excluded: true,
  }),
]);

// Perfil cloud auditado el 2026-09-08. Contiene todo el inventario observado:
// Storage multitenant no crea las dos tablas iceberg. Los únicos hashes ACL
// distintos del perfil local son buckets/objects: los ocho grants del owner a
// sí mismo tienen grantable=true; columnas y privilegios efectivos coinciden.
// Este perfil acredita captura/verificación; no declara compatibilidad restore.
const CLOUD_MANAGED_DATA_TABLES = Object.freeze([
  Object.freeze({
    table: "auth.audit_log_entries",
    owner: "supabase_auth_admin",
    columnSignatureSha256:
      "3eb18f7b8e93c9c0abc90c5eda1c4f522b6c86b57c306f96525bb8946c3bf5fd",
    aclSignatureSha256:
      "60a6c95375fe6484d75bfb7a1e09ecaf8a2f881014eb1661004a20b465906efe",
    excluded: false,
  }),
  Object.freeze({
    table: "auth.custom_oauth_providers",
    owner: "supabase_auth_admin",
    columnSignatureSha256:
      "f012fbd7c044a310c191661d52a886820e095781f22eb018e32598501fe9a4af",
    aclSignatureSha256:
      "8319708fdb7f14f47f1b9eb2d12c7dd8dc1b63d97a1d4af2661c78e49c4cf5ba",
    excluded: false,
  }),
  Object.freeze({
    table: "auth.flow_state",
    owner: "supabase_auth_admin",
    columnSignatureSha256:
      "614fbc940766d895cfa3206a6b4bb86a965fd64121f719b7b88fd17f30f50231",
    aclSignatureSha256:
      "60a6c95375fe6484d75bfb7a1e09ecaf8a2f881014eb1661004a20b465906efe",
    excluded: false,
  }),
  Object.freeze({
    table: "auth.identities",
    owner: "supabase_auth_admin",
    columnSignatureSha256:
      "5c688d36a790bbeb35d686132ac3a90d48999a1b0857f5fc2739c42eb712f830",
    aclSignatureSha256:
      "60a6c95375fe6484d75bfb7a1e09ecaf8a2f881014eb1661004a20b465906efe",
    excluded: false,
  }),
  Object.freeze({
    table: "auth.instances",
    owner: "supabase_auth_admin",
    columnSignatureSha256:
      "778a505bde2a5f2681eabc28455bac575b32e50112aafbe7d3b9a880f1b1afda",
    aclSignatureSha256:
      "60a6c95375fe6484d75bfb7a1e09ecaf8a2f881014eb1661004a20b465906efe",
    excluded: false,
  }),
  Object.freeze({
    table: "auth.mfa_amr_claims",
    owner: "supabase_auth_admin",
    columnSignatureSha256:
      "b35e8da00a8c4e6688455cfc5cc6ba900fdef6af06622a8b756002d2a438f8ff",
    aclSignatureSha256:
      "60a6c95375fe6484d75bfb7a1e09ecaf8a2f881014eb1661004a20b465906efe",
    excluded: false,
  }),
  Object.freeze({
    table: "auth.mfa_challenges",
    owner: "supabase_auth_admin",
    columnSignatureSha256:
      "3d72acb82b48fea26bf9cb131157f19d810255aff516c7bb74de573fb8ada419",
    aclSignatureSha256:
      "60a6c95375fe6484d75bfb7a1e09ecaf8a2f881014eb1661004a20b465906efe",
    excluded: false,
  }),
  Object.freeze({
    table: "auth.mfa_factors",
    owner: "supabase_auth_admin",
    columnSignatureSha256:
      "b474b605f689bfc4d63c6745e4b5ef47b3dcc40044ea47eb11a726e4117f0969",
    aclSignatureSha256:
      "60a6c95375fe6484d75bfb7a1e09ecaf8a2f881014eb1661004a20b465906efe",
    excluded: false,
  }),
  Object.freeze({
    table: "auth.oauth_authorizations",
    owner: "supabase_auth_admin",
    columnSignatureSha256:
      "3a618f67e17d7b9950d0d45213304dc52ef488f4eb5b658edb2d856cd4bea557",
    aclSignatureSha256:
      "8319708fdb7f14f47f1b9eb2d12c7dd8dc1b63d97a1d4af2661c78e49c4cf5ba",
    excluded: false,
  }),
  Object.freeze({
    table: "auth.oauth_client_states",
    owner: "supabase_auth_admin",
    columnSignatureSha256:
      "4ca99fc928b0b2aad1d56043747173943de28979a90c6d54e05dd3beadc78b63",
    aclSignatureSha256:
      "8319708fdb7f14f47f1b9eb2d12c7dd8dc1b63d97a1d4af2661c78e49c4cf5ba",
    excluded: false,
  }),
  Object.freeze({
    table: "auth.oauth_clients",
    owner: "supabase_auth_admin",
    columnSignatureSha256:
      "dcf1f131da723025411db9819854787d2a3386fec3222c9e708e3ab414b4d333",
    aclSignatureSha256:
      "8319708fdb7f14f47f1b9eb2d12c7dd8dc1b63d97a1d4af2661c78e49c4cf5ba",
    excluded: false,
  }),
  Object.freeze({
    table: "auth.oauth_consents",
    owner: "supabase_auth_admin",
    columnSignatureSha256:
      "91c85da20ac81db54fae328eb82d54231bfdd7834765e05a40a136e0b67fee32",
    aclSignatureSha256:
      "8319708fdb7f14f47f1b9eb2d12c7dd8dc1b63d97a1d4af2661c78e49c4cf5ba",
    excluded: false,
  }),
  Object.freeze({
    table: "auth.one_time_tokens",
    owner: "supabase_auth_admin",
    columnSignatureSha256:
      "0c2b302c89a7b12ff050e23bbd89f1c2d927998f537bceee7984c39693f1d410",
    aclSignatureSha256:
      "60a6c95375fe6484d75bfb7a1e09ecaf8a2f881014eb1661004a20b465906efe",
    excluded: false,
  }),
  Object.freeze({
    table: "auth.refresh_tokens",
    owner: "supabase_auth_admin",
    columnSignatureSha256:
      "33c24cb958935a25f2b2a71279f85c75d64f421ce8d601cca7cd142855f74c5c",
    aclSignatureSha256:
      "60a6c95375fe6484d75bfb7a1e09ecaf8a2f881014eb1661004a20b465906efe",
    excluded: false,
  }),
  Object.freeze({
    table: "auth.saml_providers",
    owner: "supabase_auth_admin",
    columnSignatureSha256:
      "b9a2954a3aa63628c106b9987bc56c80a0fc8d424990e17d1afc8f4bf8c3b238",
    aclSignatureSha256:
      "60a6c95375fe6484d75bfb7a1e09ecaf8a2f881014eb1661004a20b465906efe",
    excluded: false,
  }),
  Object.freeze({
    table: "auth.saml_relay_states",
    owner: "supabase_auth_admin",
    columnSignatureSha256:
      "ff452b6f9ff75e5468654e6c4bebce20ad7d8d50b2e4a465124abcaa1171f4e4",
    aclSignatureSha256:
      "60a6c95375fe6484d75bfb7a1e09ecaf8a2f881014eb1661004a20b465906efe",
    excluded: false,
  }),
  Object.freeze({
    table: "auth.sessions",
    owner: "supabase_auth_admin",
    columnSignatureSha256:
      "470555c004f0e3797a7b7babb854dde37e95aedaeaab3f505c499bc47947c46e",
    aclSignatureSha256:
      "60a6c95375fe6484d75bfb7a1e09ecaf8a2f881014eb1661004a20b465906efe",
    excluded: false,
  }),
  Object.freeze({
    table: "auth.sso_domains",
    owner: "supabase_auth_admin",
    columnSignatureSha256:
      "fbed9aa2ee9930ac0288f194089ce5df9b7c37bb4d7be67d9be9416a511c0617",
    aclSignatureSha256:
      "60a6c95375fe6484d75bfb7a1e09ecaf8a2f881014eb1661004a20b465906efe",
    excluded: false,
  }),
  Object.freeze({
    table: "auth.sso_providers",
    owner: "supabase_auth_admin",
    columnSignatureSha256:
      "b40a6d4fed5e08d8c8ebd3a70731788c96ca97098f4b075e5c3ec9676f5e3fb4",
    aclSignatureSha256:
      "60a6c95375fe6484d75bfb7a1e09ecaf8a2f881014eb1661004a20b465906efe",
    excluded: false,
  }),
  Object.freeze({
    table: "auth.users",
    owner: "supabase_auth_admin",
    columnSignatureSha256:
      "14d45856066c6611b7f93d3de76cbc25f3569a74899db2cd9e6a47a1faf00210",
    aclSignatureSha256:
      "60a6c95375fe6484d75bfb7a1e09ecaf8a2f881014eb1661004a20b465906efe",
    excluded: false,
  }),
  Object.freeze({
    table: "auth.webauthn_challenges",
    owner: "supabase_auth_admin",
    columnSignatureSha256:
      "9c5c2dda508524b57bec2f76830448fcbb61de506e3fe4012c732782d3d2bdef",
    aclSignatureSha256:
      "8319708fdb7f14f47f1b9eb2d12c7dd8dc1b63d97a1d4af2661c78e49c4cf5ba",
    excluded: false,
  }),
  Object.freeze({
    table: "auth.webauthn_credentials",
    owner: "supabase_auth_admin",
    columnSignatureSha256:
      "63e018a9e5754ca8fb6e235a104c03101ab5662f956c86114b1f8d47b404c76e",
    aclSignatureSha256:
      "8319708fdb7f14f47f1b9eb2d12c7dd8dc1b63d97a1d4af2661c78e49c4cf5ba",
    excluded: false,
  }),
  Object.freeze({
    table: "storage.buckets",
    owner: "supabase_storage_admin",
    columnSignatureSha256:
      "fb7a74b95ffe8d1be60ff4c71a480e4c688775c574f12c411f3953a37ffb09df",
    aclSignatureSha256:
      "c4b5117c295e9c02603424f840814ac7457ddc465d0515d9718634563e621b0b",
    excluded: false,
  }),
  Object.freeze({
    table: "storage.buckets_analytics",
    owner: "supabase_storage_admin",
    columnSignatureSha256:
      "2260a69e1940c721b981f1775ab02dbe8ff7803107265748a9515cd63119cbd8",
    aclSignatureSha256:
      "b68fe4e3343078bbf6a652e4994a873d47186729fc98dbdaf7b73b4a90a02fb8",
    excluded: false,
  }),
  Object.freeze({
    table: "storage.buckets_vectors",
    owner: "supabase_storage_admin",
    columnSignatureSha256:
      "5502836d657d82da670be00bf1ba7189b50be905222c3a9c86bc7b01eafaec92",
    aclSignatureSha256:
      "9658469a3606725f208293d1b59ad5bbb7b9b96f0f23bf76ae3e7e0debc79dee",
    excluded: true,
  }),
  Object.freeze({
    table: "storage.objects",
    owner: "supabase_storage_admin",
    columnSignatureSha256:
      "14e674124dec759af3adf29f39d2c5fd1dc4423fed6e7231901a573344012dee",
    aclSignatureSha256:
      "c4b5117c295e9c02603424f840814ac7457ddc465d0515d9718634563e621b0b",
    excluded: false,
  }),
  Object.freeze({
    table: "storage.s3_multipart_uploads",
    owner: "supabase_storage_admin",
    columnSignatureSha256:
      "e5971b6c3be58f45aa65364a9fff577dc183398b857927d51c0f391d91f47b67",
    aclSignatureSha256:
      "21f519cd7c56d6b8f44a834567b36e2df0174100707620e637571994917bbbd6",
    excluded: false,
  }),
  Object.freeze({
    table: "storage.s3_multipart_uploads_parts",
    owner: "supabase_storage_admin",
    columnSignatureSha256:
      "da32b44193e51dfe9e4663db5deb3cc3cb7f0c5be1f8d1e50d7dc2fd592e7399",
    aclSignatureSha256:
      "21f519cd7c56d6b8f44a834567b36e2df0174100707620e637571994917bbbd6",
    excluded: false,
  }),
  Object.freeze({
    table: "storage.vector_indexes",
    owner: "supabase_storage_admin",
    columnSignatureSha256:
      "3b92ba7f5cc6bb5b21a132eaf3aadc6533d27f746eea46a7dc3782f5c7e8c6b9",
    aclSignatureSha256:
      "9658469a3606725f208293d1b59ad5bbb7b9b96f0f23bf76ae3e7e0debc79dee",
    excluded: true,
  }),
]);

export const DEFAULT_MANAGED_DATA_PROFILE_ID = "supabase-local-storage-v1.70.7";
export const CLOUD_MANAGED_DATA_PROFILE_ID =
  "supabase-cloud-storage-v1.70.7-20260908";
export const CLOUD_MANAGED_DATA_POLICY_VERSION =
  "supabase-cli-2.115.0-storage-v1.70.7/v3";

const managedDataProfiles = new Map([
  [
    DEFAULT_MANAGED_DATA_PROFILE_ID,
    Object.freeze({
      id: DEFAULT_MANAGED_DATA_PROFILE_ID,
      tables: EXPECTED_MANAGED_DATA_TABLES,
      policyVersion: MANAGED_DATA_POLICY_VERSION,
    }),
  ],
  [
    CLOUD_MANAGED_DATA_PROFILE_ID,
    Object.freeze({
      id: CLOUD_MANAGED_DATA_PROFILE_ID,
      tables: CLOUD_MANAGED_DATA_TABLES,
      policyVersion: CLOUD_MANAGED_DATA_POLICY_VERSION,
    }),
  ],
]);

export function getManagedDataProfile(id) {
  const profile = managedDataProfiles.get(id);
  if (!profile) {
    throw new Error(`Perfil administrado desconocido: ${String(id)}.`);
  }
  return profile;
}

function resolveExpectedProfile(expected) {
  // Conserva exclusivamente la inyección histórica de 31 firmas para fixtures.
  // Los nuevos perfiles se seleccionan por ID o por el objeto registrado.
  if (Array.isArray(expected)) {
    if (expected.length !== 31) {
      throw new Error(
        "La política histórica debe contener exactamente 31 tablas.",
      );
    }
    return {
      ...getManagedDataProfile(DEFAULT_MANAGED_DATA_PROFILE_ID),
      tables: expected,
    };
  }
  if (typeof expected === "string") return getManagedDataProfile(expected);
  const profile = getManagedDataProfile(expected?.id);
  if (profile !== expected) {
    throw new Error("El perfil administrado debe ser el objeto registrado.");
  }
  return profile;
}

function managedProfileCounts(tables) {
  const included = tables.filter(({ excluded }) => !excluded);
  return {
    inventoryTableCount: tables.length,
    includedCopyTableCount: included.length,
    expectedAuthCopyCount: included.filter(({ table }) =>
      table.startsWith("auth."),
    ).length,
    expectedStorageCopyCount: included.filter(({ table }) =>
      table.startsWith("storage."),
    ).length,
  };
}

function managedManifestIdentity(profile) {
  return {
    policyVersion: profile.policyVersion,
    ...(profile.policyVersion === CLOUD_MANAGED_DATA_POLICY_VERSION
      ? { profileId: profile.id }
      : {}),
  };
}

const excludedNames = new Set(
  MANAGED_DATA_EXCLUSIONS.map(({ table }) => table),
);

export const MANAGED_DATA_DUMP_FLAGS = Object.freeze([
  "--data-only",
  "--use-copy",
  "--exclude",
  "storage.buckets_vectors",
  "--exclude",
  "storage.vector_indexes",
]);

export function managedDataDumpFlags() {
  return [...MANAGED_DATA_DUMP_FLAGS];
}

export function assertManagedHistoriesAbsent(sql, label = "data.sql") {
  const normalized = sql.replaceAll('"', "").toLowerCase();
  for (const history of MANAGED_HISTORY_TABLES) {
    if (normalized.includes(history)) {
      throw new Error(
        `${label} referencia el historial administrado ${history}.`,
      );
    }
  }
  return true;
}

export function canonicalJson(value) {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalJson(value[key])]),
    );
  }
  return value;
}

export function sha256CanonicalJson(value) {
  return createHash("sha256")
    .update(JSON.stringify(canonicalJson(value)))
    .digest("hex");
}

export const MANAGED_CATALOG_SQL = String.raw`
with managed as (
  select c.oid, n.nspname, c.relname, c.relowner, c.relacl
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname in ('auth', 'storage')
    and c.relkind in ('r', 'p')
    and not (n.nspname = 'auth' and c.relname = 'schema_migrations')
    and not (n.nspname = 'storage' and c.relname = 'migrations')
), managed_rows as (
  select jsonb_build_object(
    'qualified', m.nspname || '.' || m.relname,
    'owner', pg_get_userbyid(m.relowner),
    'rowCount', case
      when m.nspname = 'storage' and m.relname = 'buckets_vectors'
        then (select count(*) from storage.buckets_vectors)
      when m.nspname = 'storage' and m.relname = 'vector_indexes'
        then (select count(*) from storage.vector_indexes)
      else null
    end,
    'columns', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'ordinal', a.attnum,
        'name', a.attname,
        'type', format_type(a.atttypid, a.atttypmod),
        'notNull', a.attnotnull,
        'identity', a.attidentity,
        'generated', a.attgenerated,
        'collation', case when a.attcollation = 0 then null
          else quote_ident(cn.nspname) || '.' || quote_ident(coll.collname) end,
        'default', pg_get_expr(ad.adbin, ad.adrelid)
      ) order by a.attnum), '[]'::jsonb)
      from pg_attribute a
      left join pg_attrdef ad
        on ad.adrelid = a.attrelid and ad.adnum = a.attnum
      left join pg_collation coll on coll.oid = a.attcollation
      left join pg_namespace cn on cn.oid = coll.collnamespace
      where a.attrelid = m.oid and a.attnum > 0 and not a.attisdropped
    ),
    'acl', jsonb_build_object(
      'table', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'grantor', pg_get_userbyid(x.grantor),
          'grantee', case when x.grantee = 0 then 'PUBLIC'
            else pg_get_userbyid(x.grantee) end,
          'privilege', x.privilege_type,
          'grantable', x.is_grantable
        ) order by
          case when x.grantee = 0 then 'PUBLIC' else pg_get_userbyid(x.grantee) end,
          x.privilege_type,
          pg_get_userbyid(x.grantor),
          x.is_grantable), '[]'::jsonb)
        from aclexplode(coalesce(m.relacl, acldefault('r', m.relowner))) x
      ),
      'columns', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'column', a.attname,
          'grantor', pg_get_userbyid(x.grantor),
          'grantee', case when x.grantee = 0 then 'PUBLIC'
            else pg_get_userbyid(x.grantee) end,
          'privilege', x.privilege_type,
          'grantable', x.is_grantable
        ) order by
          a.attnum,
          case when x.grantee = 0 then 'PUBLIC' else pg_get_userbyid(x.grantee) end,
          x.privilege_type,
          pg_get_userbyid(x.grantor),
          x.is_grantable), '[]'::jsonb)
        from pg_attribute a
        cross join lateral aclexplode(a.attacl) x
        where a.attrelid = m.oid and a.attnum > 0 and not a.attisdropped
      ),
      'effective', (
        select jsonb_object_agg(role_name, jsonb_build_object(
          'SELECT', has_table_privilege(role_name, m.oid, 'SELECT'),
          'INSERT', has_table_privilege(role_name, m.oid, 'INSERT'),
          'UPDATE', has_table_privilege(role_name, m.oid, 'UPDATE'),
          'DELETE', has_table_privilege(role_name, m.oid, 'DELETE'),
          'TRUNCATE', has_table_privilege(role_name, m.oid, 'TRUNCATE'),
          'REFERENCES', has_table_privilege(role_name, m.oid, 'REFERENCES'),
          'TRIGGER', has_table_privilege(role_name, m.oid, 'TRIGGER')
        ) order by role_name)
        from (values
          ('postgres'),
          ('supabase_auth_admin'),
          ('supabase_storage_admin')
        ) roles(role_name)
      )
    )
  ) as entry
  from managed m
)
select jsonb_build_object(
  'histories', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'qualified', n.nspname || '.' || c.relname,
      'owner', pg_get_userbyid(c.relowner)
    ) order by n.nspname, c.relname), '[]'::jsonb)
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where c.relkind in ('r', 'p') and (
      (n.nspname = 'auth' and c.relname = 'schema_migrations') or
      (n.nspname = 'storage' and c.relname = 'migrations')
    )
  ),
  'tables', (
    select coalesce(jsonb_agg(entry order by entry->>'qualified'), '[]'::jsonb)
    from managed_rows
  )
)::text as payload;
`;

function assertSha256(value, label) {
  if (!/^[a-f0-9]{64}$/.test(value ?? "")) {
    throw new Error(`${label} no es un SHA-256 válido.`);
  }
}

function assertCatalogShape(snapshot, label) {
  if (
    !snapshot ||
    !Array.isArray(snapshot.tables) ||
    !Array.isArray(snapshot.histories)
  ) {
    throw new Error(`${label}: snapshot administrado inválido.`);
  }
  const historyNames = snapshot.histories
    .map((history) => history.qualified)
    .sort();
  if (JSON.stringify(historyNames) !== JSON.stringify(MANAGED_HISTORY_TABLES)) {
    throw new Error(
      `${label}: historiales administrados inesperados: ${historyNames.join(", ")}.`,
    );
  }
  for (const history of snapshot.histories) {
    const expectedOwner = history.qualified.startsWith("auth.")
      ? "supabase_auth_admin"
      : "supabase_storage_admin";
    if (history.owner !== expectedOwner) {
      throw new Error(
        `${label}: owner inesperado para ${history.qualified}: ${history.owner}.`,
      );
    }
  }
  const actualNames = snapshot.tables.map((table) => table.qualified);
  if (new Set(actualNames).size !== actualNames.length) {
    throw new Error(`${label}: inventario administrado duplicado.`);
  }
  for (const table of snapshot.tables) {
    if (
      typeof table.qualified !== "string" ||
      typeof table.owner !== "string" ||
      !Array.isArray(table.columns) ||
      table.columns.length === 0 ||
      !table.acl ||
      !Array.isArray(table.acl.table) ||
      !Array.isArray(table.acl.columns) ||
      !table.acl.effective
    ) {
      throw new Error(`${label}: entrada incompleta para ${table.qualified}.`);
    }
  }
}

export function summarizeManagedCatalog(snapshot) {
  assertCatalogShape(snapshot, "catálogo");
  return snapshot.tables
    .map((table) => ({
      table: table.qualified,
      owner: table.owner,
      columnSignatureSha256: sha256CanonicalJson(table.columns),
      aclSignatureSha256: sha256CanonicalJson(table.acl),
      excluded: excludedNames.has(table.qualified),
    }))
    .sort((left, right) => left.table.localeCompare(right.table));
}

export function managedInventorySha256(summary) {
  return sha256CanonicalJson(summary);
}

export function assertManagedCatalogSnapshot(
  snapshot,
  label = "catálogo administrado",
  expected = EXPECTED_MANAGED_DATA_TABLES,
) {
  assertCatalogShape(snapshot, label);
  const profile = resolveExpectedProfile(expected);
  const summary = summarizeManagedCatalog(snapshot);
  const expectedSorted = [...profile.tables].sort((left, right) =>
    left.table.localeCompare(right.table),
  );
  const actualNames = summary.map(({ table }) => table);
  const expectedNames = expectedSorted.map(({ table }) => table);
  if (JSON.stringify(actualNames) !== JSON.stringify(expectedNames)) {
    throw new Error(
      `${label}: inventario Auth/Storage inesperado; actual=${actualNames.join(", ")}.`,
    );
  }

  const byName = new Map(
    snapshot.tables.map((table) => [table.qualified, table]),
  );
  for (let index = 0; index < expectedSorted.length; index += 1) {
    const expectedTable = expectedSorted[index];
    const actualSummary = summary[index];
    assertSha256(expectedTable.columnSignatureSha256, "firma de columnas");
    assertSha256(expectedTable.aclSignatureSha256, "firma ACL");
    for (const property of [
      "owner",
      "columnSignatureSha256",
      "aclSignatureSha256",
      "excluded",
    ]) {
      if (actualSummary[property] !== expectedTable[property]) {
        throw new Error(
          `${label}: ${property} cambió en ${expectedTable.table}; esperado=${String(expectedTable[property])}, actual=${String(actualSummary[property])}.`,
        );
      }
    }
    const table = byName.get(expectedTable.table);
    const postgresCanInsert = table.acl.effective.postgres?.INSERT === true;
    if (!expectedTable.excluded && !postgresCanInsert) {
      throw new Error(
        `${label}: postgres no puede INSERT/COPY en ${expectedTable.table}.`,
      );
    }
    if (expectedTable.excluded) {
      if (table.rowCount !== 0) {
        throw new Error(
          `${label}: ${expectedTable.table} debe tener exactamente 0 filas; tiene ${String(table.rowCount)}.`,
        );
      }
      if (
        postgresCanInsert ||
        table.acl.effective.supabase_storage_admin?.INSERT !== true
      ) {
        throw new Error(
          `${label}: privilegios vectoriales inesperados en ${expectedTable.table}.`,
        );
      }
    } else if (table.rowCount !== null) {
      throw new Error(
        `${label}: sólo las exclusiones pueden contener rowCount en el snapshot.`,
      );
    }
  }

  return {
    tables: summary,
    inventorySha256: managedInventorySha256(summary),
    authTables: summary.filter(({ table }) => table.startsWith("auth.")).length,
    storageTables: summary.filter(({ table }) => table.startsWith("storage."))
      .length,
    includedTables: summary.filter(({ excluded }) => !excluded).length,
    excludedTables: summary.filter(({ excluded }) => excluded).length,
  };
}

export function assertManagedDataDump(
  definitions,
  snapshot,
  label = "data.sql",
  expected = EXPECTED_MANAGED_DATA_TABLES,
) {
  const policy = assertManagedCatalogSnapshot(
    snapshot,
    `${label} catálogo`,
    expected,
  );
  const expectedIncluded = policy.tables
    .filter(({ excluded }) => !excluded)
    .map(({ table }) => table)
    .sort();
  const managedDefinitions = definitions.filter((definition) =>
    ["auth", "storage"].includes(definition.schema),
  );
  const actual = managedDefinitions
    .map((definition) => definition.qualified)
    .sort();
  if (JSON.stringify(actual) !== JSON.stringify(expectedIncluded)) {
    throw new Error(
      `${label}: los COPY Auth/Storage no coinciden con las ${expectedIncluded.length} tablas permitidas.`,
    );
  }
  const allDestinations = new Set(
    definitions.map(({ qualified }) => qualified),
  );
  for (const history of MANAGED_HISTORY_TABLES) {
    if (allDestinations.has(history)) {
      throw new Error(`${label}: COPY prohibido del historial ${history}.`);
    }
  }
  for (const { table } of MANAGED_DATA_EXCLUSIONS) {
    if (allDestinations.has(table)) {
      throw new Error(`${label}: COPY excluido todavía presente: ${table}.`);
    }
  }

  const byName = new Map(
    snapshot.tables.map((table) => [table.qualified, table]),
  );
  for (const definition of managedDefinitions) {
    const table = byName.get(definition.qualified);
    const expectedCopyColumns = table.columns
      .filter((column) => column.generated === "")
      .map((column) => column.name);
    if (
      JSON.stringify(definition.columns) !== JSON.stringify(expectedCopyColumns)
    ) {
      throw new Error(
        `${label}: header COPY inesperado para ${definition.qualified}.`,
      );
    }
    if (table.acl.effective.postgres?.INSERT !== true) {
      throw new Error(
        `${label}: postgres no puede INSERT/COPY en ${definition.qualified}.`,
      );
    }
  }

  return {
    authCopyCount: managedDefinitions.filter(({ schema }) => schema === "auth")
      .length,
    storageCopyCount: managedDefinitions.filter(
      ({ schema }) => schema === "storage",
    ).length,
    managedCopyCount: managedDefinitions.length,
    managedCopyTables: actual,
  };
}

export function buildManagedDataManifest(
  snapshot,
  expected = EXPECTED_MANAGED_DATA_TABLES,
) {
  const profile = resolveExpectedProfile(expected);
  const policy = assertManagedCatalogSnapshot(
    snapshot,
    "catálogo administrado",
    expected,
  );
  const byName = new Map(
    snapshot.tables.map((table) => [table.qualified, table]),
  );
  const dataExcludes = MANAGED_DATA_EXCLUSIONS.map(({ table, reason }) => {
    const source = byName.get(table);
    const expected = policy.tables.find((entry) => entry.table === table);
    return {
      table,
      owner: source.owner,
      rowCount: source.rowCount,
      columnSignature: source.columns,
      columnSignatureSha256: expected.columnSignatureSha256,
      aclSignatureSha256: expected.aclSignatureSha256,
      postgresCanInsert: source.acl.effective.postgres.INSERT,
      ownerCanInsert: source.acl.effective.supabase_storage_admin.INSERT,
      reason,
    };
  });
  const identity = managedManifestIdentity(profile);
  return {
    ...identity,
    ...managedProfileCounts(profile.tables),
    inventorySha256: policy.inventorySha256,
    dataExcludes,
    blockSha256: sha256CanonicalJson({
      ...identity,
      inventorySha256: policy.inventorySha256,
      dataExcludes,
    }),
  };
}

export function assertManagedDataManifest(database, expected) {
  const managed = database?.managedDataPolicy;
  const dataExcludes = database?.dataExcludes;
  let registeredProfile;
  if (managed?.policyVersion === MANAGED_DATA_POLICY_VERSION) {
    if (Object.hasOwn(managed, "profileId")) {
      throw new Error("La política histórica no admite un profileId.");
    }
    registeredProfile = getManagedDataProfile(DEFAULT_MANAGED_DATA_PROFILE_ID);
  } else if (managed?.policyVersion === CLOUD_MANAGED_DATA_POLICY_VERSION) {
    registeredProfile = getManagedDataProfile(managed.profileId);
    if (registeredProfile.policyVersion !== managed.policyVersion) {
      throw new Error("El perfil administrado no corresponde a la política.");
    }
  } else {
    throw new Error(
      "El manifiesto no contiene una política administrada conocida.",
    );
  }
  const profile =
    expected === undefined
      ? registeredProfile
      : resolveExpectedProfile(expected);
  if (
    profile.id !== registeredProfile.id ||
    profile.policyVersion !== registeredProfile.policyVersion
  ) {
    throw new Error(
      "El perfil administrado del manifiesto no coincide con el esperado.",
    );
  }
  const counts = managedProfileCounts(profile.tables);
  if (
    Object.entries(counts).some(([field, value]) => managed[field] !== value) ||
    !Array.isArray(dataExcludes) ||
    dataExcludes.length !== 2
  ) {
    throw new Error(
      "El manifiesto no contiene los counts/exclusiones del perfil administrado.",
    );
  }
  const expectedSummary = [...profile.tables].sort((left, right) =>
    left.table.localeCompare(right.table),
  );
  const expectedInventorySha256 = managedInventorySha256(expectedSummary);
  if (managed.inventorySha256 !== expectedInventorySha256) {
    throw new Error("El inventario administrado del manifiesto no coincide.");
  }
  for (let index = 0; index < MANAGED_DATA_EXCLUSIONS.length; index += 1) {
    const expectedExclusion = MANAGED_DATA_EXCLUSIONS[index];
    const actual = dataExcludes[index];
    const expectedTable = expectedSummary.find(
      ({ table }) => table === expectedExclusion.table,
    );
    if (
      actual?.table !== expectedExclusion.table ||
      actual.owner !== expectedTable.owner ||
      actual.rowCount !== 0 ||
      actual.reason !== expectedExclusion.reason ||
      actual.columnSignatureSha256 !== expectedTable.columnSignatureSha256 ||
      actual.aclSignatureSha256 !== expectedTable.aclSignatureSha256 ||
      sha256CanonicalJson(actual.columnSignature) !==
        expectedTable.columnSignatureSha256 ||
      actual.postgresCanInsert !== false ||
      actual.ownerCanInsert !== true
    ) {
      throw new Error(
        `Exclusión administrada inválida para ${expectedExclusion.table}.`,
      );
    }
  }
  const expectedBlockSha256 = sha256CanonicalJson({
    ...managedManifestIdentity(profile),
    inventorySha256: managed.inventorySha256,
    dataExcludes,
  });
  if (managed.blockSha256 !== expectedBlockSha256) {
    throw new Error("El hash del bloque de exclusiones no coincide.");
  }
  return managed;
}

export function getManagedDataManifestProfile(database) {
  const managed = assertManagedDataManifest(database);
  return getManagedDataProfile(
    managed.policyVersion === MANAGED_DATA_POLICY_VERSION
      ? DEFAULT_MANAGED_DATA_PROFILE_ID
      : managed.profileId,
  );
}
