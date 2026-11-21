#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  D72_STATIC_ASSET_PROOF_BLOCKER,
  assertD72RemoteArtifactProof,
  createD72ExpectedUploadManifest,
  createD72AssetUploadFetchObserver,
  verifyD72RemoteVersionArtifact,
} from "./d72-canary-remote-artifact-policy.mjs";
import { createD72CanaryUploadApiGuard } from "./run-d72-canary.mjs";

assert.equal(process.versions.node, "22.22.0");

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const candidateVersionId = "22222222-2222-4222-8222-222222222222";
const stableScriptEtag = "9".repeat(64);
const artifactHash = "a".repeat(64);
const uploadPlan = Object.freeze({
  artifactHash,
  planSha256: "b".repeat(64),
});
const root = mkdtempSync(path.join(os.tmpdir(), "agorbis-d72-remote-proof-"));
const dist = path.join(root, "dist");
const boundary = "----formdata-undici-012345678901";

function multipartFor(metadata, modules) {
  const chunks = [
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="metadata"\r\n\r\n${JSON.stringify(metadata)}`,
      "utf8",
    ),
  ];
  for (const module of modules) {
    chunks.push(
      Buffer.from(
        `\r\n--${boundary}\r\nContent-Disposition: form-data; name="${module.name}"; filename="${module.name}"\r\nContent-Type: ${module.contentType}\r\n\r\n`,
        "utf8",
      ),
      module.content,
    );
  }
  chunks.push(Buffer.from(`\r\n--${boundary}--\r\n`, "ascii"));
  return Buffer.concat(chunks);
}

try {
  mkdirSync(dist, { mode: 0o700 });
  const files = new Map([
    [
      "wrangler.jsonc",
      readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8"),
    ],
    [
      "dist/.assetsignore",
      "_worker.js\n_routes.json\n_headers\n_redirects\nsitemap.xml\n404.html\nq-manifest.json\n",
    ],
    ["dist/_worker.js", "export default { fetch() {} };\n"],
    ["dist/_headers", "/*\n  X-Test: fixture\n"],
    ["dist/app.txt", "asset fixture\n"],
    ["dist/nested/_worker.js", "ignored nested worker\n"],
    ["dist/nested/deeper/404.html", "ignored nested 404\n"],
    ["dist/nested/.assetsignore", "uploaded nested control name\n"],
  ]);
  for (const [relativePath, content] of files) {
    const filePath = path.join(root, relativePath);
    mkdirSync(path.dirname(filePath), { mode: 0o700, recursive: true });
    writeFileSync(filePath, content, { mode: 0o600 });
  }
  const artifactManifest = {
    contentSha256: artifactHash,
    files: [...files].map(([relativePath, content]) => ({
      path: relativePath,
      sha256: sha256(Buffer.from(content)),
      size: Buffer.byteLength(content),
    })),
  };
  const metadata = {
    annotations: {
      "workers/message": "d72 fixture",
      "workers/tag": "d72-canary-fixture",
    },
    bindings: [
      { name: "AGORBIS_LAUNCH_MODE", text: "open", type: "plain_text" },
      { name: "ASSETS", type: "assets" },
      { name: "CRON_SECRET", type: "inherit" },
    ],
    compatibility_date: "2026-08-25",
    compatibility_flags: ["nodejs_compat"],
    keep_bindings: ["secret_text", "secret_key"],
    limits: { cpu_ms: 30_000 },
    main_module: "worker.js",
    package_dependencies: [
      {
        installedVersion: "4.5.6",
        name: "another-package",
        packageJsonVersion: "~4.5.0",
      },
      {
        installedVersion: "1.2.3",
        name: "fixture-package",
        packageJsonVersion: "^1.0.0",
      },
    ],
  };
  const moduleContent = Buffer.from("export default { fetch() {} };\n");
  const canonicalModules = [
    {
      name: "worker.js",
      contentType: "application/javascript+module",
      content: moduleContent,
    },
  ];
  const multipartSource = multipartFor(metadata, canonicalModules);
  const expectedUploadManifest = createD72ExpectedUploadManifest({
    uploadPlan,
    multipartSource,
    artifactRoot: root,
    artifactManifest,
  });
  assert.match(expectedUploadManifest.uploadPayloadHash, /^[0-9a-f]{64}$/);
  assert.equal(expectedUploadManifest.modules.length, 1);
  assert.deepEqual(Object.keys(expectedUploadManifest.assets.manifest), [
    "/app.txt",
    "/nested/.assetsignore",
  ]);
  assert.deepEqual(expectedUploadManifest.assets.config, {
    run_worker_first: true,
  });

  const ignorePath = path.join(dist, ".assetsignore");
  const canonicalIgnoreSource = files.get("dist/.assetsignore");
  const alteredIgnoreSource = `${canonicalIgnoreSource}unexpected.txt\n`;
  writeFileSync(ignorePath, alteredIgnoreSource, { mode: 0o600 });
  const alteredIgnoreManifest = {
    ...artifactManifest,
    files: artifactManifest.files.map((entry) =>
      entry.path === "dist/.assetsignore"
        ? {
            ...entry,
            sha256: sha256(Buffer.from(alteredIgnoreSource)),
            size: Buffer.byteLength(alteredIgnoreSource),
          }
        : entry,
    ),
  };
  try {
    assert.throws(
      () =>
        createD72ExpectedUploadManifest({
          uploadPlan,
          multipartSource,
          artifactRoot: root,
          artifactManifest: alteredIgnoreManifest,
        }),
      /\.assetsignore no coincide/,
    );
  } finally {
    writeFileSync(ignorePath, canonicalIgnoreSource, { mode: 0o600 });
  }

  for (const [metadataPatch, pattern] of [
    [
      {
        annotations: {
          ...metadata.annotations,
          "workers/unknown": "must fail closed",
        },
      },
      /annotations contiene campos faltantes o desconocidos/,
    ],
    [
      { keep_bindings: ["secret_text", "secret_key", "plain_text"] },
      /configuración desconocida/,
    ],
    [
      { limits: { ...metadata.limits, unknown_limit: 1 } },
      /configuración desconocida/,
    ],
  ]) {
    assert.throws(
      () =>
        createD72ExpectedUploadManifest({
          uploadPlan,
          multipartSource: multipartFor(
            { ...metadata, ...metadataPatch },
            canonicalModules,
          ),
          artifactRoot: root,
          artifactManifest,
        }),
      pattern,
    );
  }
  assert.throws(
    () =>
      createD72ExpectedUploadManifest({
        uploadPlan,
        multipartSource: multipartFor(metadata, [
          ...canonicalModules,
          ...canonicalModules,
        ]),
        artifactRoot: root,
        artifactManifest,
      }),
    /inválida o duplicada/,
  );
  const excessiveModules = [
    ...canonicalModules,
    ...Array.from({ length: 2_047 }, (_, index) => ({
      name: `module-${String(index).padStart(4, "0")}.js`,
      contentType: "application/javascript+module",
      content: Buffer.alloc(0),
    })),
  ];
  assert.throws(
    () =>
      createD72ExpectedUploadManifest({
        uploadPlan,
        multipartSource: multipartFor(metadata, excessiveModules),
        artifactRoot: root,
        artifactManifest,
      }),
    /demasiadas partes/,
  );

  const betaEndpoint = `/accounts/4d78fb10c1ae65281ec851479d5045dc/workers/workers/agorbis/versions/${candidateVersionId}?include=modules`;
  const fixtureAssetsJwt = [
    "fixture-header",
    "fixture-payload",
    "fixture-signature",
  ].join(".");
  const betaResult = {
    annotations: {
      ...metadata.annotations,
      "workers/triggered_by": "wrangler",
    },
    assets: {
      config: { run_worker_first: true },
      jwt: fixtureAssetsJwt,
    },
    bindings: metadata.bindings.map((binding) =>
      binding.type === "inherit"
        ? { name: binding.name, type: "secret_text" }
        : binding,
    ),
    compatibility_date: metadata.compatibility_date,
    compatibility_flags: metadata.compatibility_flags,
    cache_options: {},
    containers: [],
    created_on: "2026-08-31T12:00:00.000000Z",
    exports: {},
    exports_reconciliation: {},
    id: candidateVersionId,
    limits: metadata.limits,
    main_module: metadata.main_module,
    migration_tag: null,
    modules: [
      {
        name: "worker.js",
        content_type: "application/javascript+module",
        content_base64: moduleContent.toString("base64"),
      },
    ],
    number: 12,
    package_dependencies: [...metadata.package_dependencies].reverse(),
    source: "wrangler",
    startup_time_ms: 11,
    urls: { preview: null },
  };
  const betaGet = {
    body: { errors: [], messages: [], result: betaResult, success: true },
    endpoint: betaEndpoint,
    method: "GET",
    status: 200,
  };
  const proof = verifyD72RemoteVersionArtifact({
    expectedUploadManifest,
    candidateVersionId,
    stableScriptEtag,
    betaGet,
  });
  assert.equal(proof.staticAssetsVerified, false);
  assert.equal(proof.staticAssetsBlocker, D72_STATIC_ASSET_PROOF_BLOCKER);
  assert.equal(
    proof.uploadPayloadHash,
    expectedUploadManifest.uploadPayloadHash,
  );
  assert.equal(
    assertD72RemoteArtifactProof(proof, {
      expectedUploadManifest,
      candidateVersionId,
      stableScriptEtag,
    }),
    proof,
  );
  assert.throws(
    () =>
      assertD72RemoteArtifactProof(structuredClone(proof), {
        expectedUploadManifest,
        candidateVersionId,
        stableScriptEtag,
      }),
    /opaca/,
  );
  assert.throws(
    () =>
      verifyD72RemoteVersionArtifact({
        expectedUploadManifest,
        candidateVersionId,
        stableScriptEtag,
        betaGet: {
          ...betaGet,
          body: {
            ...betaGet.body,
            result: {
              ...betaResult,
              modules: [
                {
                  ...betaResult.modules[0],
                  content_base64: Buffer.from("altered").toString("base64"),
                },
              ],
            },
          },
        },
      }),
    /no coincide byte a byte/,
  );
  assert.throws(
    () =>
      verifyD72RemoteVersionArtifact({
        expectedUploadManifest,
        candidateVersionId,
        stableScriptEtag,
        betaGet: {
          ...betaGet,
          body: {
            ...betaGet.body,
            result: {
              ...betaResult,
              compatibility_date: "2026-08-24",
            },
          },
        },
      }),
    /config no coincide/,
  );
  for (const config of [
    { run_worker_first: false },
    { html_handling: "none", run_worker_first: true },
    { not_found_handling: "404-page", run_worker_first: true },
  ]) {
    assert.throws(
      () =>
        verifyD72RemoteVersionArtifact({
          expectedUploadManifest,
          candidateVersionId,
          stableScriptEtag,
          betaGet: {
            ...betaGet,
            body: {
              ...betaGet.body,
              result: {
                ...betaResult,
                assets: { ...betaResult.assets, config },
              },
            },
          },
        }),
      /assets\.config no coincide exactamente/,
    );
  }
  assert.throws(
    () =>
      verifyD72RemoteVersionArtifact({
        expectedUploadManifest,
        candidateVersionId,
        stableScriptEtag,
        betaGet: {
          ...betaGet,
          body: {
            ...betaGet.body,
            result: {
              ...betaResult,
              package_dependencies: [
                metadata.package_dependencies[0],
                {
                  installedVersion: "9.9.9",
                  name: "fixture-package",
                  packageJsonVersion: "^1.0.0",
                },
              ],
            },
          },
        },
      }),
    /package_dependencies no coincide exactamente/,
  );
  for (const resultPatch of [
    { cache_options: { enabled: true } },
    { containers: [{ name: "unexpected" }] },
    { source: "api" },
  ]) {
    assert.throws(
      () =>
        verifyD72RemoteVersionArtifact({
          expectedUploadManifest,
          candidateVersionId,
          stableScriptEtag,
          betaGet: {
            ...betaGet,
            body: {
              ...betaGet.body,
              result: { ...betaResult, ...resultPatch },
            },
          },
        }),
      /configuración opcional no aprobada/,
    );
  }
  assert.throws(
    () =>
      verifyD72RemoteVersionArtifact({
        expectedUploadManifest: structuredClone(expectedUploadManifest),
        candidateVersionId,
        stableScriptEtag,
        betaGet,
      }),
    /opaco/,
  );
  assert.throws(
    () =>
      verifyD72RemoteVersionArtifact({
        expectedUploadManifest,
        candidateVersionId,
        stableScriptEtag,
        betaGet: { ...betaGet, endpoint: `${betaEndpoint}&extra=true` },
      }),
    /include=modules exactos/,
  );
  assert.throws(
    () =>
      verifyD72RemoteVersionArtifact({
        expectedUploadManifest,
        candidateVersionId,
        stableScriptEtag,
        betaGet: {
          ...betaGet,
          body: {
            ...betaGet.body,
            result: {
              ...betaResult,
              modules: [betaResult.modules[0], betaResult.modules[0]],
            },
          },
        },
      }),
    /módulo inválido\/duplicado/,
  );

  const apiRoot =
    "https://api.cloudflare.com/client/v4/accounts/4d78fb10c1ae65281ec851479d5045dc/workers";
  const sessionUrl = `${apiRoot}/scripts/agorbis/assets-upload-session`;
  const versionUrl = `${apiRoot}/scripts/agorbis/versions?bindings_inherit=strict`;
  const syntheticJwt = (kind) =>
    [
      JSON.stringify({ alg: "test" }),
      JSON.stringify({ [kind]: "A" }),
      `synthetic-${kind}-only`,
    ]
      .map((value) => Buffer.from(value).toString("base64url"))
      .join(".");
  const sessionJwt = syntheticJwt("session");
  const completionJwt = syntheticJwt("completion");
  const assetRows = Object.entries(expectedUploadManifest.assets.manifest).map(
    ([filePath, entry]) => ({
      ...entry,
      content: Buffer.from(files.get(`dist${filePath}`)),
    }),
  );
  function assetsMultipart(rows) {
    return Buffer.concat(
      rows
        .flatMap((row, index) => [
          Buffer.from(
            `${index === 0 ? "" : "\r\n"}--${boundary}\r\nContent-Disposition: form-data; name="${row.hash}"; filename="${row.hash}"\r\nContent-Type: text/plain\r\n\r\n`,
          ),
          Buffer.from(row.content.toString("base64")),
        ])
        .concat(Buffer.from(`\r\n--${boundary}--\r\n`)),
    );
  }
  function uploadObservationCase({ cached = false, finalStatus = 201 } = {}) {
    const calls = [];
    let assetCalls = 0;
    const fetchImpl = async (url) => {
      calls.push(url);
      let result;
      let status = 200;
      if (url === sessionUrl)
        result = {
          buckets: cached ? [] : [assetRows.map((row) => row.hash)],
          jwt: cached ? completionJwt : sessionJwt,
        };
      else if (url.startsWith(`${apiRoot}/assets/upload`)) {
        assetCalls++;
        const final =
          url.includes("?base64=true") || assetCalls === assetRows.length;
        status = final ? finalStatus : 200;
        result = final ? { jwt: completionJwt } : {};
      } else if (url === versionUrl) result = { id: candidateVersionId };
      else throw new Error("unexpected synthetic upstream");
      return new Response(
        JSON.stringify({ success: true, errors: [], messages: [], result }),
        { status, headers: { "content-type": "application/json" } },
      );
    };
    const observer = createD72AssetUploadFetchObserver({
      expectedUploadManifest,
      fetchImpl,
      testOnly: true,
    });
    const sessionInit = (
      manifest = expectedUploadManifest.assets.manifest,
    ) => ({
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ manifest }),
    });
    const bulkInit = (rows = assetRows, token = sessionJwt) => ({
      method: "POST",
      headers: {
        "content-type": `multipart/form-data; boundary=${boundary}`,
        authorization: `Bearer ${token}`,
      },
      body: assetsMultipart(rows),
    });
    const versionInit = (
      token = completionJwt,
      modules = canonicalModules,
    ) => ({
      method: "POST",
      headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
      body: multipartFor(
        {
          ...metadata,
          assets: { config: expectedUploadManifest.assets.config, jwt: token },
        },
        modules,
      ),
    });
    return { observer, fetchImpl, calls, sessionInit, bulkInit, versionInit };
  }
  async function completedObservation(mode) {
    const value = uploadObservationCase({ cached: mode === "cached" });
    await value.observer.fetch(sessionUrl, value.sessionInit());
    if (mode === "bulk")
      await value.observer.fetch(
        `${apiRoot}/assets/upload?base64=true`,
        value.bulkInit(),
      );
    if (mode === "single")
      for (const row of assetRows)
        await value.observer.fetch(`${apiRoot}/assets/upload/${row.hash}`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${sessionJwt}`,
            "content-type": "text/plain",
          },
          body: Buffer.from(row.content),
        });
    await value.observer.fetch(versionUrl, value.versionInit());
    return value.observer.receipt();
  }
  const observedBetaGet = {
    ...betaGet,
    body: {
      ...betaGet.body,
      result: {
        ...betaResult,
        assets: { ...betaResult.assets, jwt: completionJwt },
      },
    },
  };
  for (const mode of ["bulk", "single", "cached"]) {
    const observation = await completedObservation(mode);
    assert.equal(observation.assetCount, assetRows.length);
    assert.equal(
      observation.uploadedHashCount,
      mode === "cached" ? 0 : assetRows.length,
    );
    assert.equal(JSON.stringify(observation).includes(completionJwt), false);
    const input = {
      expectedUploadManifest,
      candidateVersionId,
      stableScriptEtag,
      betaGet: observedBetaGet,
      assetUploadObservation: observation,
      allowTestOnlyUploadEvidence: true,
    };
    const observedProof = verifyD72RemoteVersionArtifact(input);
    assert.equal(observedProof.staticAssetsVerified, true);
    assert.equal(observedProof.staticAssetsBlocker, null);
    assert.throws(
      () =>
        verifyD72RemoteVersionArtifact({
          ...input,
          allowTestOnlyUploadEvidence: false,
        }),
      /observación opaca/,
    );
    assert.throws(
      () =>
        verifyD72RemoteVersionArtifact({
          ...input,
          assetUploadObservation: structuredClone(observation),
        }),
      /observación opaca/,
    );
    assert.throws(
      () => verifyD72RemoteVersionArtifact({ ...input, betaGet }),
      /observación opaca/,
    );
    const otherVersion = "33333333-3333-4333-8333-333333333333";
    assert.throws(
      () =>
        verifyD72RemoteVersionArtifact({
          ...input,
          candidateVersionId: otherVersion,
          betaGet: {
            ...observedBetaGet,
            endpoint: observedBetaGet.endpoint.replace(
              candidateVersionId,
              otherVersion,
            ),
            body: {
              ...observedBetaGet.body,
              result: { ...observedBetaGet.body.result, id: otherVersion },
            },
          },
        }),
      /observación opaca/,
    );
    assert.throws(
      () =>
        assertD72RemoteArtifactProof(observedProof, {
          expectedUploadManifest,
          candidateVersionId,
          stableScriptEtag,
        }),
      /opaca/,
    );
    assert.equal(
      assertD72RemoteArtifactProof(observedProof, {
        expectedUploadManifest,
        candidateVersionId,
        stableScriptEtag,
        allowTestOnly: true,
      }),
      observedProof,
    );
  }
  for (const manifest of [
    {},
    {
      ...expectedUploadManifest.assets.manifest,
      "/extra.txt": { hash: "a".repeat(32), size: 1 },
    },
    Object.fromEntries(
      Object.entries(expectedUploadManifest.assets.manifest).map(
        ([name, entry]) => [name, { ...entry, size: entry.size + 1 }],
      ),
    ),
  ]) {
    const value = uploadObservationCase();
    await assert.rejects(
      value.observer.fetch(sessionUrl, value.sessionInit(manifest)),
      /manifest/,
    );
    assert.equal(value.calls.length, 0);
    assert.throws(() => value.observer.receipt(), /incompleta/);
  }
  for (const bad of [
    "early-version",
    "omitted-part",
    "wrong-bytes",
    "mixed-session",
    "mixed-completion",
    "duplicate-session",
    "wrong-method",
    "wrong-account",
    "omitted-module",
    "final-not-201",
  ]) {
    const value = uploadObservationCase({
      finalStatus: bad === "final-not-201" ? 200 : 201,
    });
    await value.observer.fetch(sessionUrl, value.sessionInit());
    if (bad === "early-version")
      await assert.rejects(
        value.observer.fetch(versionUrl, value.versionInit()),
        /Version antes/,
      );
    else if (bad === "omitted-part")
      await assert.rejects(
        value.observer.fetch(
          `${apiRoot}/assets/upload?base64=true`,
          value.bulkInit(assetRows.slice(0, 1)),
        ),
        /bucket completo/,
      );
    else if (bad === "wrong-bytes")
      await assert.rejects(
        value.observer.fetch(
          `${apiRoot}/assets/upload?base64=true`,
          value.bulkInit(
            assetRows.map((row) => ({
              ...row,
              content: Buffer.from("changed"),
            })),
          ),
        ),
        /bytes sellados/,
      );
    else if (bad === "mixed-session")
      await assert.rejects(
        value.observer.fetch(
          `${apiRoot}/assets/upload?base64=true`,
          value.bulkInit(assetRows, completionJwt),
        ),
        /Cadena de assets/,
      );
    else if (bad === "duplicate-session")
      await assert.rejects(
        value.observer.fetch(sessionUrl, value.sessionInit()),
        /Sesión de assets/,
      );
    else if (bad === "wrong-method")
      await assert.rejects(
        value.observer.fetch(versionUrl, {
          ...value.versionInit(),
          method: "PUT",
        }),
        /Método/,
      );
    else if (bad === "wrong-account")
      await assert.rejects(
        value.observer.fetch(
          versionUrl.replace(
            "4d78fb10c1ae65281ec851479d5045dc",
            "a".repeat(32),
          ),
          value.versionInit(),
        ),
        /Origen/,
      );
    else if (bad === "final-not-201")
      await assert.rejects(
        value.observer.fetch(
          `${apiRoot}/assets/upload?base64=true`,
          value.bulkInit(),
        ),
        /Cadena de assets/,
      );
    else {
      await value.observer.fetch(
        `${apiRoot}/assets/upload?base64=true`,
        value.bulkInit(),
      );
      await assert.rejects(
        value.observer.fetch(
          versionUrl,
          value.versionInit(
            bad === "mixed-completion" ? sessionJwt : completionJwt,
            bad === "omitted-module" ? [] : canonicalModules,
          ),
        ),
        bad === "mixed-completion" ? /Cadena de assets/ : /módulos/,
      );
    }
    assert.throws(() => value.observer.receipt(), /incompleta/);
  }
  // Exercise the real loopback guard, with upstream Cloudflare replaced by the
  // same synthetic transport. No actual upstream request is made in this test.
  const guarded = uploadObservationCase({ cached: true });
  const guard = await createD72CanaryUploadApiGuard({
    expectedUploadManifest,
    fetchImpl: guarded.fetchImpl,
    testOnly: true,
  });
  try {
    const local = (url) =>
      url.replace("https://api.cloudflare.com/client/v4", guard.apiBaseUrl);
    for (const [url, init] of [
      [sessionUrl, guarded.sessionInit()],
      [versionUrl, guarded.versionInit()],
    ]) {
      const response = await fetch(local(url), init);
      assert.equal(response.status, 200);
      await response.arrayBuffer();
    }
    await guard.close();
    assert.equal(
      guard.assetUploadObservation().candidateVersionId,
      candidateVersionId,
    );
  } finally {
    await guard.close();
  }

  // Recovery hashes are separate from the primary candidate, and their local
  // configuration must keep Google disabled before any multipart is accepted.
  const recoverySource = readFileSync(
    new URL("../wrangler.open-recovery.jsonc", import.meta.url),
    "utf8",
  );
  const recoveryPlan = {
    ...uploadPlan,
    releaseMode: "OPEN_UPDATE",
    artifactPurpose: "recovery",
    uploadArtifactHash: "c".repeat(64),
  };
  const recoveryManifest = {
    ...artifactManifest,
    artifactPurpose: "recovery",
    contentSha256: recoveryPlan.uploadArtifactHash,
    files: artifactManifest.files.map((entry) =>
      entry.path === "wrangler.jsonc"
        ? {
            ...entry,
            sha256: sha256(Buffer.from(recoverySource)),
            size: Buffer.byteLength(recoverySource),
          }
        : entry,
    ),
  };
  writeFileSync(path.join(root, "wrangler.jsonc"), recoverySource, {
    mode: 0o600,
  });
  const recoveryUpload = createD72ExpectedUploadManifest({
    uploadPlan: recoveryPlan,
    multipartSource,
    artifactRoot: root,
    artifactManifest: recoveryManifest,
  });
  assert.equal(
    recoveryUpload.expectedArtifactHash,
    recoveryPlan.uploadArtifactHash,
  );
  assert.notEqual(recoveryUpload.expectedArtifactHash, uploadPlan.artifactHash);
  assert.throws(
    () =>
      createD72ExpectedUploadManifest({
        uploadPlan: recoveryPlan,
        multipartSource,
        artifactRoot: root,
        artifactManifest: { ...recoveryManifest, contentSha256: artifactHash },
      }),
    /Bindings/,
  );
  assert.throws(
    () =>
      createD72ExpectedUploadManifest({
        uploadPlan: { ...recoveryPlan, releaseMode: undefined },
        multipartSource,
        artifactRoot: root,
        artifactManifest: recoveryManifest,
      }),
    /Bindings/,
  );
  const wrongRecoverySource = recoverySource.replace(
    '"PUBLIC_GOOGLE_AUTH_ENABLED": "false"',
    '"PUBLIC_GOOGLE_AUTH_ENABLED": "true"',
  );
  assert.notEqual(wrongRecoverySource, recoverySource);
  writeFileSync(path.join(root, "wrangler.jsonc"), wrongRecoverySource, {
    mode: 0o600,
  });
  const wrongRecoveryManifest = {
    ...recoveryManifest,
    files: recoveryManifest.files.map((entry) =>
      entry.path === "wrangler.jsonc"
        ? {
            ...entry,
            sha256: sha256(Buffer.from(wrongRecoverySource)),
            size: Buffer.byteLength(wrongRecoverySource),
          }
        : entry,
    ),
  };
  assert.throws(
    () =>
      createD72ExpectedUploadManifest({
        uploadPlan: recoveryPlan,
        multipartSource,
        artifactRoot: root,
        artifactManifest: wrongRecoveryManifest,
      }),
    /Google y Facebook deshabilitados/,
  );

  process.stdout.write(
    "D72 remote artifact policy: PASS (modules/config/bytes exactos; assets ligados a sesión, completion JWT y Version GET; bulk/single/cache y negativos con upstream sintético).\n",
  );
} finally {
  rmSync(root, { recursive: true, force: true });
}
