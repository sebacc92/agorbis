import { PublicationError } from "~/components/forms/PublicationError";
import { PublishedNotice } from "~/components/forms/PublishedNotice";
import {
  $,
  component$,
  noSerialize,
  useSignal,
  type NoSerialize,
} from "@qwik.dev/core";
import { Form, routeLoader$, type DocumentHead } from "@qwik.dev/router";
import {
  CircularCharCounter,
  ConfirmPanel,
  DraftStatusBar,
  FormShell,
} from "~/components/forms/FormShell";
import {
  buttonClass,
  Badge,
  Card,
  Icon,
  Input,
  SubmitButton,
  Textarea,
  cx,
  showToast,
  triggerHapticFeedback,
} from "~/components/ui";
import { routes } from "~/lib/community";
import {
  addClaimImages,
  type PreparedClaimImage,
} from "~/lib/claim-image-selection";
import {
  CATEGORY_CHOICE,
  CATEGORY_CHOICE_CHECK,
  CATEGORY_CHOICE_OFF,
  CATEGORY_CHOICE_ON,
} from "~/components/forms/category-choice";
import { draftKey, useDraft } from "~/components/forms/useDraft";
import { postedText } from "~/components/forms/posted-fields";
import { LocationCapture } from "~/components/claims/LocationCapture";
import { SimilarClaimsDetector } from "~/components/claims/SimilarClaimsDetector";
import { CONTENT_TYPES } from "~/lib/quota";
import {
  APP_NAME,
  CLAIMS_DISCLAIMER,
  CLAIM_CATEGORIES,
  MAX_CLAIM_IMAGES,
  MAX_CLAIM_IMAGE_BYTES,
} from "~/lib/constants";
import { formatNumber } from "~/lib/format";
import { loadCreateContext, useCreateClaim } from "~/lib/content-actions";
import { useLocale, DEFAULT_LOCALE, translate } from "~/lib/i18n";
import { useLocaleLoader } from "~/routes/layout";
import { responseDaysForLevel } from "~/lib/claim-escalation";
import { supabase } from "~/lib/session";
import { toPublicLocationPoint } from "~/lib/geolocation-privacy";

export const useClaimContext = routeLoader$(async (ev) => {
  const base = await loadCreateContext(ev, "claim");
  const db = supabase(ev);
  const { data: openClaims } = await db
    .from("claims")
    .select("id, title, support_count")
    .eq("community_id", base.community.id)
    .neq("status", "resolved")
    .neq("status", "removed")
    .order("support_count", { ascending: false })
    .limit(50);

  return {
    ...base,
    existingClaims: (openClaims ?? []) as {
      id: string;
      title: string;
      support_count: number;
    }[],
  };
});

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const ClaimForm = component$(() => {
  const ctx = useClaimContext();
  const create = useCreateClaim();
  const locale = useLocale();

  const { community, chain, summary, quota, draftOwnerId } = ctx.value;
  /** Plazo que arranca al publicar (D58); null en los niveles sin ventana. */
  const responseDays = responseDaysForLevel(community.level);
  const title = useSignal(postedText(create.formData, "title"));
  const description = useSignal(postedText(create.formData, "description"));
  const category = useSignal(
    postedText(create.formData, "category", "infraestructura"),
  );
  const existingClaims = ctx.value.existingClaims ?? [];
  const locationText = useSignal(postedText(create.formData, "location_text"));
  const locationPoint = useSignal(
    toPublicLocationPoint(
      postedText(create.formData, "lat"),
      postedText(create.formData, "lng"),
    ),
  );
  const imagePreviews = useSignal<string[]>([]);
  const selectedImages = useSignal<NoSerialize<PreparedClaimImage[]>>();
  const processingImages = useSignal(false);
  const imageProcessingFailed = useSignal(false);
  /**
   * Cuántas fotos quedaron afuera por el tope. El `slice` las descartaba en
   * silencio: se elegían siete, aparecían cuatro miniaturas y las otras tres
   * no estaban ni en la vista previa ni en el envío, sin que nada lo dijera.
   */
  const ignoredImages = useSignal(0);
  const isDraggingImages = useSignal(false);
  /**
   * Qué se eligió, en texto. El input de archivos sólo muestra "4 archivos"
   * y las miniaturas no dicen cuánto pesa el resultado optimizado. Mostrar el
   * estado evita que una foto que no pudo entrar en el límite seguro llegue al
   * servidor sin una explicación útil.
   */
  const pickedFiles = useSignal<
    { name: string; size: number; originalSize?: number }[]
  >([]);
  const oversized = pickedFiles.value.filter(
    (f) => f.size > MAX_CLAIM_IMAGE_BYTES,
  );
  const totalOriginalBytes = pickedFiles.value.reduce(
    (acc, f) => acc + (f.originalSize ?? f.size),
    0,
  );
  const totalCompressedBytes = pickedFiles.value.reduce(
    (acc, f) => acc + f.size,
    0,
  );
  const savingsPercent =
    totalOriginalBytes > 0 && totalCompressedBytes < totalOriginalBytes
      ? Math.round(
          ((totalOriginalBytes - totalCompressedBytes) / totalOriginalBytes) *
            100,
        )
      : 0;

  const addPhotos = $(async (incoming: File[]) => {
    if (processingImages.value) return;
    const input = document.getElementById("images") as HTMLInputElement | null;
    if (!input) return;
    const previous = selectedImages.value ?? [];
    const writeFiles = (images: PreparedClaimImage[]) => {
      const transfer = new DataTransfer();
      for (const image of images) transfer.items.add(image.file);
      input.files = transfer.files;
    };
    processingImages.value = true;
    imageProcessingFailed.value = false;
    const newUrls: string[] = [];
    try {
      const result = await addClaimImages(previous, incoming);
      for (const image of result.images.slice(previous.length))
        newUrls.push(URL.createObjectURL(image.file));
      writeFiles(result.images);
      selectedImages.value = noSerialize(result.images);
      pickedFiles.value = result.images.map(({ file, originalSize }) => ({
        name: file.name,
        size: file.size,
        originalSize,
      }));
      imagePreviews.value = [...imagePreviews.value, ...newUrls];
      ignoredImages.value = result.ignored;
      imageProcessingFailed.value = result.failed > 0;
    } catch {
      for (const url of newUrls) URL.revokeObjectURL(url);
      writeFiles(previous);
      imageProcessingFailed.value = true;
    } finally {
      processingImages.value = false;
    }
  });

  const movePhoto = $((from: number, to: number) => {
    if (to < 0 || to >= imagePreviews.value.length) return;
    triggerHapticFeedback("selection");
    const nextPreviews = [...imagePreviews.value];
    const nextPicked = [...pickedFiles.value];
    const [movedPreview] = nextPreviews.splice(from, 1);
    const [movedFile] = nextPicked.splice(from, 1);
    nextPreviews.splice(to, 0, movedPreview);
    nextPicked.splice(to, 0, movedFile);
    imagePreviews.value = nextPreviews;
    pickedFiles.value = nextPicked;
    const nextImages = [...(selectedImages.value ?? [])];
    const [movedImage] = nextImages.splice(from, 1);
    nextImages.splice(to, 0, movedImage);
    selectedImages.value = noSerialize(nextImages);

    const inputEl = document.getElementById(
      "images",
    ) as HTMLInputElement | null;
    if (inputEl && inputEl.files) {
      const currentFiles = Array.from(inputEl.files);
      const [movedF] = currentFiles.splice(from, 1);
      currentFiles.splice(to, 0, movedF);
      const dt = new DataTransfer();
      for (const f of currentFiles) dt.items.add(f);
      inputEl.files = dt.files;
    }
  });

  const removePhoto = $((index: number) => {
    triggerHapticFeedback("medium");
    URL.revokeObjectURL(imagePreviews.value[index]);
    const nextPreviews = imagePreviews.value.filter((_, i) => i !== index);
    const nextPicked = pickedFiles.value.filter((_, i) => i !== index);
    imagePreviews.value = nextPreviews;
    pickedFiles.value = nextPicked;
    selectedImages.value = noSerialize(
      (selectedImages.value ?? []).filter((_, i) => i !== index),
    );

    const inputEl = document.getElementById(
      "images",
    ) as HTMLInputElement | null;
    if (inputEl && inputEl.files) {
      const currentFiles = Array.from(inputEl.files).filter(
        (_, i) => i !== index,
      );
      const dt = new DataTransfer();
      for (const f of currentFiles) dt.items.add(f);
      inputEl.files = dt.files;
    }
  });

  /**
   * Un reclamo detallado son veinte minutos de trabajo. Sin esto, tocar
   * "atrás" por reflejo lo perdía entero. Las fotos no entran en el borrador:
   * `localStorage` no guarda archivos y prometerlo sería peor que no hacerlo.
   */
  const draft = draftKey("claim", community.slug, draftOwnerId);
  // Sin desestructurar: el build de cliente compilaba
  // `const { persist } = useDraft(draft, …)` como `useDraft(undefined, …)`, y
  // tras cualquier re-render el envío guardaba el borrador bajo la clave
  // "undefined" en vez de la del dueño (ver `useDraft`).
  const draftStorage = useDraft(
    draft,
    { title, description, locationText, category },
    create,
  );

  const discardDraft$ = $(async () => {
    await draftStorage.reset();
    triggerHapticFeedback("selection");
    showToast(translate(locale, "Borrador descartado"), "info");
  });

  /**
   * Volver a editar después de la revisión. Las fotos ya se subieron en esa
   * fase y el servidor las conserva por `image_paths`; el `<input type="file">`
   * se vuelve a montar vacío y las miniaturas locales ya no representan nada
   * que se vaya a enviar: se limpian, y el formulario muestra las que quedan
   * guardadas en el servidor.
   */
  const editAfterPreview$ = $(async () => {
    for (const url of imagePreviews.value) URL.revokeObjectURL(url);
    imagePreviews.value = [];
    pickedFiles.value = [];
    selectedImages.value = noSerialize([]);
    await draftStorage.edit();
  });

  const editingPreview =
    draftStorage.editing.value &&
    create.value &&
    "preview" in create.value &&
    create.value.preview &&
    create.value.preview.community_slug === community.slug
      ? create.value.preview
      : null;
  const keptImagePaths = editingPreview?.image_paths ?? [];
  const keptImageUrls = editingPreview?.image_urls ?? [];

  const preview =
    create.value &&
    "preview" in create.value &&
    create.value.preview &&
    create.value.preview.community_slug === community.slug &&
    !draftStorage.editing.value
      ? create.value.preview
      : null;

  if (preview) {
    const cat = CLAIM_CATEGORIES.find((c) => c.key === preview.category);
    return (
      <FormShell
        draftStatus={draftStorage.status.value}
        beforeNavigate$={draftStorage.beforeNavigate}
        revealOnMount
        type="claim"
        community={community}
        chain={chain}
        summary={summary}
        title={translate(locale, "Confirmá tu reclamo")}
        subtitle={translate(
          locale,
          "Así lo va a ver el resto. Todavía no se publicó.",
        )}
      >
        <Card class="p-5 sm:p-6">
          <ConfirmPanel
            type="claim"
            communityName={community.name}
            remaining={quota?.remaining ?? null}
          />

          <div class="mt-5">
            {cat && (
              <Badge tone="neutral">
                <Icon name={cat.icon} />
                {translate(locale, cat.label)}
              </Badge>
            )}
            <h2 dir="auto" class="mt-2 text-xl font-semibold tracking-tight">
              {preview.title}
            </h2>

            {preview.image_urls.length > 0 && (
              <div class="mt-4 grid gap-3 sm:grid-cols-2">
                {preview.image_urls.map((url, index) => (
                  <img
                    key={url}
                    src={url}
                    alt={translate(
                      locale,
                      "Imagen adjunta {{number}} del reclamo",
                      {
                        number: index + 1,
                      },
                    )}
                    width={800}
                    height={500}
                    class="aspect-video w-full rounded-2xl border border-subtle object-cover"
                  />
                ))}
              </div>
            )}

            <p
              dir="auto"
              class="ugc-text mt-4 whitespace-pre-line text-sm leading-relaxed text-ink-muted"
            >
              {preview.description}
            </p>

            {/* El dónde viajaba en un campo oculto pero no se revisaba: la
                única pantalla que existe para repasar todo junto antes de
                publicar se saltaba justamente el dato que ubica el problema. */}
            <p class="mt-4 inline-flex items-center gap-1.5 rounded-full border border-control bg-muted/60 px-3 py-1 text-xs font-medium text-ink-strong">
              <span aria-hidden="true">📍</span>
              <span dir="auto">
                {preview.location_text ||
                  translate(
                    locale,
                    toPublicLocationPoint(preview.lat, preview.lng)
                      ? "Ubicación aproximada marcada"
                      : "Sin ubicación adjunta",
                  )}
              </span>
              {toPublicLocationPoint(preview.lat, preview.lng) &&
                preview.location_text && (
                  <span class="font-normal text-ink-faint">
                    {translate(locale, "· con zona aproximada")}
                  </span>
                )}
            </p>
          </div>

          <p class="mt-5 rounded-2xl bg-muted px-4 py-3 text-xs text-ink-muted">
            <span aria-hidden="true">ℹ️</span>{" "}
            {translate(locale, CLAIMS_DISCLAIMER)}
          </p>

          <Form
            action={create}
            onSubmit$={draftStorage.persist}
            class="mt-6 flex flex-wrap gap-2"
          >
            <input type="hidden" name="community_slug" value={community.slug} />
            <input type="hidden" name="title" value={preview.title} />
            <input
              type="hidden"
              name="description"
              value={preview.description}
            />
            <input type="hidden" name="category" value={preview.category} />
            <input
              type="hidden"
              name="location_text"
              value={preview.location_text}
            />
            <input type="hidden" name="lat" value={preview.lat} />
            <input type="hidden" name="lng" value={preview.lng} />
            {/* Las imágenes ya se subieron en la fase anterior: sólo viajan sus referencias. */}
            {preview.image_paths.map((path) => (
              <input key={path} type="hidden" name="image_paths" value={path} />
            ))}
            <input type="hidden" name="confirm" value="si" />
            {/* Al publicar, el borrador ya cumplió: dejarlo convertiría el
                próximo reclamo en éste a medio escribir. */}
            <SubmitButton
              size="lg"
              pending={create.isRunning || draftStorage.published.value}
            >
              {translate(locale, "Publicar reclamo")}
            </SubmitButton>
            {/* La revisión es estado de la acción, no otra entrada del historial. */}
            <a
              data-requires-script
              href={routes.newContent(
                community.slug,
                CONTENT_TYPES["claim"].newPath,
              )}
              class={buttonClass("secondary", "lg")}
              preventdefault:click
              onClick$={editAfterPreview$}
            >
              {translate(locale, "Volver a editar")}
            </a>
            <div data-without-script>
              <button
                type="submit"
                name="edit"
                value="si"
                class={buttonClass("secondary", "lg")}
              >
                {translate(locale, "Volver a editar")}
              </button>
            </div>
          </Form>

          <PublicationError value={create.value} />
        </Card>
      </FormShell>
    );
  }

  return (
    <FormShell
      draftStatus={draftStorage.status.value}
      beforeNavigate$={draftStorage.beforeNavigate}
      revealOnMount={draftStorage.editing.value}
      type="claim"
      community={community}
      chain={chain}
      summary={summary}
      title={translate(locale, "Nuevo reclamo")}
      subtitle={translate(
        locale,
        "Cuanto más concreto —dónde, desde cuándo, a quiénes afecta— más difícil de ignorar.",
      )}
    >
      <Card class="p-5 sm:p-6">
        <Form
          data-native-form
          action={create}
          onSubmit$={draftStorage.persist}
          enctype="multipart/form-data"
          class="space-y-6"
        >
          <input type="hidden" name="community_slug" value={community.slug} />

          <PublicationError value={create.value} />
          <PublishedNotice href={draftStorage.publishedTo.value} />
          {create.formData?.get("edit") === "si" &&
            create.formData.has("image_paths") && (
              <p
                role="status"
                class="rounded-xl bg-muted px-4 py-3 text-sm text-ink-muted"
              >
                {translate(
                  locale,
                  "Volvé a seleccionar las fotos antes de revisar: los archivos no se conservan al volver a editar.",
                )}
              </p>
            )}

          {keptImagePaths.length > 0 && (
            <div
              role="status"
              class="rounded-xl bg-muted px-4 py-3 text-sm text-ink-muted"
            >
              <p>
                {translate(
                  locale,
                  keptImagePaths.length === 1
                    ? "La foto que ya subiste se conserva al publicar. Podés agregar hasta {{remaining}} más."
                    : "Las {{count}} fotos que ya subiste se conservan al publicar. Podés agregar hasta {{remaining}} más.",
                  {
                    count: formatNumber(keptImagePaths.length, locale),
                    remaining: formatNumber(
                      Math.max(0, MAX_CLAIM_IMAGES - keptImagePaths.length),
                      locale,
                    ),
                  },
                )}
              </p>
              {keptImageUrls.length > 0 && (
                <div class="mt-2 flex flex-wrap gap-2">
                  {keptImageUrls.map((url, index) => (
                    <img
                      key={url}
                      src={url}
                      alt={translate(
                        locale,
                        "Imagen adjunta {{number}} del reclamo",
                        { number: index + 1 },
                      )}
                      width={96}
                      height={64}
                      class="h-16 w-24 rounded-lg border border-subtle object-cover"
                    />
                  ))}
                </div>
              )}
              {keptImagePaths.map((path) => (
                <input
                  key={path}
                  type="hidden"
                  name="image_paths"
                  value={path}
                />
              ))}
            </div>
          )}

          <DraftStatusBar
            status={draftStorage.status.value}
            hasContent={!!(title.value || description.value)}
            onDiscard$={discardDraft$}
            restored={draftStorage.restored.value}
          />

          {/* Una sola pantalla: el asistente pedía cuatro pasos y dos revisiones
              para tres campos obligatorios. Sin JavaScript ya se veía así; la
              única revisión es la del servidor, antes de publicar (D34). */}
          <div class="space-y-6">
            <h2 class="text-lg font-semibold">
              {translate(locale, "¿Qué pasó?")}
            </h2>
            <div>
              <div class="flex items-baseline justify-between gap-2">
                <label
                  for="title"
                  class="block text-sm font-medium text-ink-strong"
                >
                  {translate(locale, "¿Qué está pasando?")}{" "}
                  <span class="text-danger" aria-hidden="true">
                    *
                  </span>
                </label>
                <CircularCharCounter
                  value={title.value}
                  max={150}
                  id="title-count"
                />
              </div>
              <Input
                name="title"
                required
                maxLength={150}
                class="mt-1.5"
                placeholder={translate(
                  locale,
                  "La rambla de Playa Grande está sin luz hace tres semanas",
                )}
                invalid={!!create.value?.fieldErrors?.title}
                aria-describedby={
                  create.value?.fieldErrors?.title
                    ? "title-error title-count"
                    : "title-count"
                }
                value={title.value}
                onInput$={(_, el) => (title.value = el.value)}
              />
              {create.value?.fieldErrors?.title && (
                <p
                  id="title-error"
                  role="alert"
                  class="mt-1 text-xs text-danger"
                >
                  {translate(
                    locale,
                    Array.isArray(create.value.fieldErrors.title)
                      ? (create.value.fieldErrors.title[0] ?? "")
                      : create.value.fieldErrors.title,
                  )}
                </p>
              )}

              <SimilarClaimsDetector
                titleQuery={title.value}
                existingClaims={existingClaims}
              />
            </div>

            {/* Categoría con íconos */}
            <fieldset>
              <legend class="mb-2 text-sm font-medium text-ink-strong">
                {translate(locale, "Categoría")}
              </legend>
              {/* La misma fila que usa la encuesta (`category-choice`):
                  antes eran baldosas altas con el ícono arriba. */}
              <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {CLAIM_CATEGORIES.map((option) => (
                  <label
                    key={option.key}
                    class={cx(
                      CATEGORY_CHOICE,
                      category.value === option.key
                        ? CATEGORY_CHOICE_ON
                        : CATEGORY_CHOICE_OFF,
                    )}
                  >
                    <input
                      type="radio"
                      name="category"
                      value={option.key}
                      checked={category.value === option.key}
                      class="sr-only"
                      onChange$={() => (category.value = option.key)}
                    />
                    {/* Ícono propio de la categoría en vez del emoji (D125). */}
                    <span aria-hidden="true" class="relative shrink-0">
                      <Icon name={option.icon} class="text-base" />
                      {category.value === option.key && (
                        <span class={CATEGORY_CHOICE_CHECK}>
                          <Icon name="check" stroke={2.5} />
                        </span>
                      )}
                    </span>
                    {translate(locale, option.label)}
                  </label>
                ))}
              </div>
            </fieldset>

            <div>
              <div class="flex items-baseline justify-between gap-2">
                <label
                  for="description"
                  class="block text-sm font-medium text-ink-strong"
                >
                  {translate(locale, "Contalo en detalle")}{" "}
                  <span class="text-danger" aria-hidden="true">
                    *
                  </span>
                </label>
                <CircularCharCounter
                  value={description.value}
                  max={2000}
                  id="description-count"
                />
              </div>
              <Textarea
                name="description"
                required
                rows={5}
                maxLength={2000}
                class="mt-1.5"
                placeholder={translate(
                  locale,
                  "Dónde exactamente, desde cuándo, a quiénes afecta y qué gestiones hiciste.",
                )}
                invalid={!!create.value?.fieldErrors?.description}
                value={description.value}
                onInput$={(_, el) => (description.value = el.value)}
              />
              {create.value?.fieldErrors?.description && (
                <p role="alert" class="mt-1 text-xs text-danger">
                  {translate(
                    locale,
                    Array.isArray(create.value.fieldErrors.description)
                      ? (create.value.fieldErrors.description[0] ?? "")
                      : create.value.fieldErrors.description,
                  )}
                </p>
              )}
            </div>

            {/* Fotos con vista previa local antes de subir */}
            <div>
              <label
                for="images"
                class="block text-sm font-medium text-ink-strong"
              >
                {translate(locale, "Fotos")}
              </label>
              <p id="claim-images-help" class="mt-0.5 text-xs text-ink-faint">
                {translate(
                  locale,
                  "Opcionales, hasta {{count}} imágenes optimizadas a menos de 1 MB cada una. Priorizá las que mejor muestren el problema.",
                  { count: MAX_CLAIM_IMAGES },
                )}
              </p>
              <p
                id="claim-images-draft-help"
                class="mt-1 text-xs text-ink-muted"
              >
                {translate(
                  locale,
                  "Las fotos no se guardan en el borrador. Si recargás o salís del formulario, tendrás que seleccionarlas de nuevo.",
                )}
              </p>
              <p data-requires-script class="mt-1 text-xs text-ink-muted">
                {translate(
                  locale,
                  "Cada selección suma fotos. Para reemplazar una, primero quitá la anterior.",
                )}
              </p>
              <div
                class={cx(
                  "mt-1.5 rounded-2xl border-2 transition-all duration-150 p-2 sm:p-3",
                  isDraggingImages.value
                    ? "border-dashed border-brand-500 bg-brand-50/60 ring-2 ring-brand-500/20 dark:bg-brand-950/40"
                    : "border-transparent bg-transparent",
                )}
                preventdefault:dragover
                preventdefault:drop
                onDragOver$={() => {
                  isDraggingImages.value = true;
                }}
                onDragLeave$={() => {
                  isDraggingImages.value = false;
                }}
                onDrop$={async (event) => {
                  isDraggingImages.value = false;
                  await addPhotos(Array.from(event.dataTransfer?.files ?? []));
                }}
              >
                <Input
                  id="images"
                  name="images"
                  type="file"
                  aria-describedby="claim-images-help claim-images-draft-help"
                  multiple
                  disabled={processingImages.value}
                  accept="image/jpeg,image/png,image/webp"
                  class="file:mr-3 file:rounded-xl file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-ink-strong"
                  onChange$={(_, el) => addPhotos(Array.from(el.files ?? []))}
                />
              </div>
              {processingImages.value && (
                <p role="status" class="mt-2 text-xs font-medium text-brand">
                  {translate(
                    locale,
                    "Preparando imágenes y quitando metadatos…",
                  )}
                </p>
              )}
              {imageProcessingFailed.value && (
                <p role="alert" class="mt-2 text-xs font-medium text-danger">
                  {translate(
                    locale,
                    "No pudimos preparar algunas imágenes. Las fotos anteriores se conservaron; probá con JPG, PNG o WebP.",
                  )}
                </p>
              )}
              {ignoredImages.value > 0 && (
                <p role="status" class="mt-2 text-xs font-medium text-warn">
                  {translate(
                    locale,
                    "Podés adjuntar hasta {{max}} fotos. {{ignored}} de esta selección quedaron afuera.",
                    {
                      max: MAX_CLAIM_IMAGES,
                      ignored: ignoredImages.value,
                    },
                  )}
                </p>
              )}

              {oversized.length > 0 && (
                <p role="alert" class="mt-2 text-xs font-medium text-danger">
                  <span aria-hidden="true">⚠</span>{" "}
                  {oversized.length === 1
                    ? translate(
                        locale,
                        "«{{name}}» todavía supera el límite seguro después de optimizarla. Sacala o reemplazala antes de publicar.",
                        {
                          name: oversized[0].name,
                        },
                      )
                    : translate(
                        locale,
                        "{{count}} de las fotos todavía superan el límite seguro después de optimizarlas. Sacalas o reemplazalas antes de publicar.",
                        {
                          count: formatNumber(oversized.length, locale),
                        },
                      )}
                </p>
              )}

              {pickedFiles.value.length > 0 && (
                <p class="mt-2 text-xs text-ink-faint">
                  {translate(locale, "{{current}} de {{total}}", {
                    current: formatNumber(pickedFiles.value.length, locale),
                    total: formatNumber(MAX_CLAIM_IMAGES, locale),
                  })}
                </p>
              )}

              {imagePreviews.value.length > 0 && (
                <>
                  {savingsPercent > 0 && (
                    <div class="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-success-500/20 bg-success-50/60 p-3 text-xs text-success-800 dark:border-success-500/30 dark:bg-success-950/20 dark:text-success-300">
                      <div class="flex items-center gap-2">
                        <Icon name="sparkles" class="text-base" />
                        <span>
                          <strong class="font-semibold">
                            {formatBytes(totalOriginalBytes)}
                          </strong>{" "}
                          <Icon name="arrow-right" class="text-xs" />{" "}
                          <strong class="font-semibold">
                            {formatBytes(totalCompressedBytes)}
                          </strong>
                          <span class="ml-1 opacity-85">
                            (
                            {translate(locale, "{{percent}}% optimizado", {
                              percent: savingsPercent,
                            })}
                            )
                          </span>
                        </span>
                      </div>
                      <span class="inline-flex items-center gap-1 rounded-full bg-success-600/10 px-2 py-0.5 text-2xs font-semibold text-success-700 dark:bg-success-400/10 dark:text-success-300">
                        <span aria-hidden="true">🔒</span>
                        {translate(locale, "Metadatos GPS eliminados")}
                      </span>
                    </div>
                  )}

                  <div class="mt-3 grid gap-3 sm:grid-cols-2">
                    {imagePreviews.value.map((url, index) => {
                      const file = pickedFiles.value[index];
                      const isCover = index === 0;
                      return (
                        <div
                          key={url}
                          class={cx(
                            "group relative overflow-hidden rounded-2xl border transition-all animate-scale-pop",
                            isCover
                              ? "border-brand-500 ring-2 ring-brand-500/20"
                              : "border-subtle",
                          )}
                        >
                          <img
                            src={url}
                            alt={translate(
                              locale,
                              "Vista previa de la imagen {{number}}",
                              {
                                number: index + 1,
                              },
                            )}
                            width={640}
                            height={400}
                            class="aspect-video w-full object-cover transition-transform duration-300 group-hover:scale-105"
                          />

                          {/* Controles superiores: Portada y Acciones */}
                          <div class="absolute left-2 right-2 top-2 flex items-center justify-between gap-1">
                            {isCover ? (
                              <span class="inline-flex items-center gap-1 rounded-full bg-brand-600/90 px-2.5 py-1 text-2xs font-bold text-white shadow-soft backdrop-blur-md">
                                <span aria-hidden="true">⭐</span>
                                {translate(locale, "Portada")}
                              </span>
                            ) : (
                              <button
                                type="button"
                                disabled={processingImages.value}
                                onClick$={() => movePhoto(index, 0)}
                                class="touch-target inline-flex items-center gap-1 rounded-full bg-black/60 px-2.5 py-1 text-2xs font-medium text-white shadow-sm backdrop-blur-md transition-all hover:bg-black/80 active:scale-95"
                              >
                                <span aria-hidden="true">⭐</span>
                                {translate(locale, "Hacer portada")}
                              </button>
                            )}

                            <div class="flex items-center gap-1.5">
                              {index > 0 && (
                                <button
                                  type="button"
                                  disabled={processingImages.value}
                                  onClick$={() => movePhoto(index, index - 1)}
                                  title={translate(
                                    locale,
                                    "Mover a la izquierda",
                                  )}
                                  aria-label={translate(
                                    locale,
                                    "Mover a la izquierda",
                                  )}
                                  class="touch-target flex size-8 items-center justify-center rounded-lg bg-black/60 text-xs font-bold text-white shadow-sm backdrop-blur-md transition-all hover:bg-black/80 active:scale-95"
                                >
                                  ◀
                                </button>
                              )}
                              {index < imagePreviews.value.length - 1 && (
                                <button
                                  type="button"
                                  disabled={processingImages.value}
                                  onClick$={() => movePhoto(index, index + 1)}
                                  title={translate(
                                    locale,
                                    "Mover a la derecha",
                                  )}
                                  aria-label={translate(
                                    locale,
                                    "Mover a la derecha",
                                  )}
                                  class="touch-target flex size-8 items-center justify-center rounded-lg bg-black/60 text-xs font-bold text-white shadow-sm backdrop-blur-md transition-all hover:bg-black/80 active:scale-95"
                                >
                                  ▶
                                </button>
                              )}
                              <button
                                type="button"
                                disabled={processingImages.value}
                                onClick$={() => removePhoto(index)}
                                title={translate(locale, "Eliminar foto")}
                                aria-label={translate(locale, "Eliminar foto")}
                                class="touch-target flex size-8 items-center justify-center rounded-lg bg-red-600/80 text-xs font-bold text-white shadow-sm backdrop-blur-md transition-all hover:bg-red-600 active:scale-95"
                              >
                                ✕
                              </button>
                            </div>
                          </div>

                          {file && (
                            <div class="absolute bottom-2 left-2 right-2 flex items-center justify-between rounded-lg bg-black/60 px-2 py-1 text-2xs font-medium text-white backdrop-blur-sm">
                              <span class="max-w-[60%] truncate">
                                {file.name}
                              </span>
                              <span>{formatBytes(file.size)}</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </div>

          <div class="space-y-4 border-t border-subtle pt-6">
            <h2 class="text-lg font-semibold">
              {translate(locale, "Ubicación (opcional)")}
            </h2>
            <div>
              <label
                for="location_text"
                class="block text-sm font-medium text-ink-strong"
              >
                {translate(locale, "¿Dónde?")}
              </label>
              <Input
                id="location_text"
                name="location_text"
                maxLength={200}
                class="mt-1.5"
                placeholder={translate(
                  locale,
                  "Rivadavia y San Martín, frente a la plaza",
                )}
                value={locationText.value}
                onInput$={(_, el) => (locationText.value = el.value)}
              />
              <div data-requires-script>
                <LocationCapture
                  locationText={locationText.value}
                  point={locationPoint}
                />
              </div>
              {postedText(create.formData, "lat") &&
                postedText(create.formData, "lng") && (
                  <div data-without-script>
                    <p class="mt-1.5 text-xs text-ink-muted">
                      {translate(locale, "Ubicación aproximada lista")}
                    </p>
                  </div>
                )}
              <p class="mt-1.5 text-xs text-ink-faint">
                {translate(
                  locale,
                  "Mencioná la esquina o la altura de la calle. No escribas un domicilio particular ni la ubicación precisa de otra persona.",
                )}
              </p>
            </div>
          </div>

          <div class="space-y-4 border-t border-subtle pt-6">
            {responseDays !== null && (
              <div class="rounded-2xl border border-brand-500/30 bg-brand-50 px-4 py-3 dark:bg-brand-950/40">
                <p class="text-xs font-semibold text-brand">
                  <span aria-hidden="true">⏱️</span>{" "}
                  {translate(locale, "Qué pasa después de publicarlo")}
                </p>
                <p class="mt-1 text-xs text-ink-muted">
                  {translate(
                    locale,
                    "Las instituciones de {{community}} van a tener {{days}} días para acusar recibo. Si nadie responde y el reclamo junta apoyo suficiente, sube solo a la comunidad superior.",
                    {
                      community: community.name,
                      days: formatNumber(responseDays, locale),
                    },
                  )}
                </p>
              </div>
            )}

            <div class="rounded-2xl bg-muted px-4 py-3">
              <p class="text-xs text-ink-muted">
                <span aria-hidden="true">ℹ️</span>{" "}
                {translate(locale, CLAIMS_DISCLAIMER)}{" "}
                {translate(
                  locale,
                  "Se publica en {{community}} y lo van a ver todos sus miembros.",
                  {
                    community: community.name,
                  },
                )}
              </p>
            </div>

            <div class="flex justify-end">
              <SubmitButton
                size="lg"
                pending={create.isRunning || draftStorage.published.value}
                disabled={processingImages.value || oversized.length > 0}
              >
                {translate(locale, "Revisar antes de publicar")}
              </SubmitButton>
            </div>
          </div>
        </Form>
      </Card>
    </FormShell>
  );
});

export default component$(() => {
  const { community, draftOwnerId } = useClaimContext().value;
  return <ClaimForm key={`${draftOwnerId}:${community.slug}`} />;
});

export const head: DocumentHead = ({ resolveValue }) => {
  const locale = resolveValue(useLocaleLoader) ?? DEFAULT_LOCALE;
  return {
    title: `${translate(locale, "Nuevo reclamo")} · ${APP_NAME}`,
    meta: [{ name: "robots", content: "noindex" }],
  };
};
