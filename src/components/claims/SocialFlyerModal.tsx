import { $, component$, useSignal, useVisibleTask$ } from "@qwik.dev/core";
import { useLocation } from "@qwik.dev/router";
import {
  Button,
  Icon,
  Modal,
  showToast,
  triggerHapticFeedback,
} from "~/components/ui";
import { playCivicSound } from "~/lib/audio-feedback";
import { translate, useLocale } from "~/lib/i18n";

export const SocialFlyerModal = component$<{
  claimId: string;
  claimTitle: string;
  communityName: string;
  categoryLabel: string;
  supportCount: number;
  imageUrl?: string | null;
}>(
  ({
    claimId,
    claimTitle,
    communityName,
    categoryLabel,
    supportCount,
    imageUrl,
  }) => {
    const locale = useLocale();
    const location = useLocation();
    // Antes se imprimía "agorbis.com/reclamos/" + los primeros 8 caracteres
    // del id: esa ruta no existe (el id es un UUID completo) y daba 404. Se
    // imprime la URL entera del origen en el que se está navegando, sin el
    // esquema para que entre en la placa.
    const claimUrl = new URL(`/reclamos/${claimId}`, location.url.origin);
    const flyerUrlHead = `${claimUrl.host}/reclamos/`;
    const isOpen = useSignal(false);
    const canvasRef = useSignal<HTMLCanvasElement>();
    const isGenerating = useSignal(false);

    const renderCanvas = $(() => {
      const canvas = canvasRef.value;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const w = 1080;
      const h = 1920;
      canvas.width = w;
      canvas.height = h;

      // 1. Fondo degradado de alta densidad cívica
      const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
      bgGrad.addColorStop(0, "#080E1A");
      bgGrad.addColorStop(0.4, "#0F1A2E");
      bgGrad.addColorStop(1, "#050912");
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, w, h);

      // Acento de color superior
      const accentGrad = ctx.createRadialGradient(
        w / 2,
        0,
        50,
        w / 2,
        0,
        w * 0.7,
      );
      accentGrad.addColorStop(0, "rgba(234, 88, 12, 0.35)");
      accentGrad.addColorStop(1, "transparent");
      ctx.fillStyle = accentGrad;
      ctx.fillRect(0, 0, w, 800);

      // 2. Encabezado Agorbis y Comunidad
      ctx.fillStyle = "#EA580C";
      ctx.beginPath();
      ctx.roundRect(80, 100, 320, 64, 32);
      ctx.fill();

      ctx.fillStyle = "#FFFFFF";
      ctx.font = "bold 26px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("AGORBIS CÍVICO", 240, 142);

      ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
      ctx.font = "600 28px sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(`📍 ${communityName.toUpperCase()}`, 430, 142);

      // 3. Título del Reclamo
      ctx.fillStyle = "#FFFFFF";
      ctx.font = "bold 64px sans-serif";
      ctx.textAlign = "left";

      // Ajuste de texto (Word wrapping)
      const words = claimTitle.split(" ");
      let line = "";
      let y = 280;
      const maxWidth = 920;
      const lineHeight = 80;

      for (let n = 0; n < words.length; n++) {
        const testLine = line + words[n] + " ";
        const metrics = ctx.measureText(testLine);
        if (metrics.width > maxWidth && n > 0) {
          ctx.fillText(line, 80, y);
          line = words[n] + " ";
          y += lineHeight;
          if (y > 480) {
            line += "…";
            break;
          }
        } else {
          line = testLine;
        }
      }
      ctx.fillText(line, 80, y);

      // 4. Pastilla de Categoría
      const pillY = y + 40;
      ctx.fillStyle = "rgba(255, 255, 255, 0.12)";
      ctx.beginPath();
      ctx.roundRect(80, pillY, 300, 56, 28);
      ctx.fill();

      ctx.fillStyle = "#FDBA74";
      ctx.font = "600 26px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(`📣 ${categoryLabel}`, 230, pillY + 38);

      // 5. Marco para Foto
      const photoY = pillY + 100;
      const photoH = 740;
      const photoW = 920;

      const drawPhotoOrPlaceholder = (img?: HTMLImageElement) => {
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(80, photoY, photoW, photoH, 40);
        ctx.clip();

        if (img) {
          // Centrar y escalar foto estilo object-cover
          const hRatio = photoW / img.width;
          const vRatio = photoH / img.height;
          const ratio = Math.max(hRatio, vRatio);
          const centerShiftX = (photoW - img.width * ratio) / 2;
          const centerShiftY = (photoH - img.height * ratio) / 2;
          ctx.drawImage(
            img,
            0,
            0,
            img.width,
            img.height,
            80 + centerShiftX,
            photoY + centerShiftY,
            img.width * ratio,
            img.height * ratio,
          );
        } else {
          ctx.fillStyle = "#1E293B";
          ctx.fillRect(80, photoY, photoW, photoH);
          ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
          ctx.font = "bold 40px sans-serif";
          ctx.textAlign = "center";
          ctx.fillText(
            "FOTO DEL REPORTE",
            80 + photoW / 2,
            photoY + photoH / 2,
          );
        }
        ctx.restore();

        // Borde elegante sobre la foto
        ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.roundRect(80, photoY, photoW, photoH, 40);
        ctx.stroke();

        // 6. Tarjeta de impacto / apoyos (abajo)
        const statY = photoY + photoH + 50;
        ctx.fillStyle = "rgba(234, 88, 12, 0.18)";
        ctx.beginPath();
        ctx.roundRect(80, statY, photoW, 200, 36);
        ctx.fill();
        ctx.strokeStyle = "rgba(234, 88, 12, 0.45)";
        ctx.lineWidth = 3;
        ctx.stroke();

        ctx.fillStyle = "#FFEDD5";
        ctx.font = "bold 32px sans-serif";
        ctx.textAlign = "left";
        ctx.fillText(
          translate(locale, "RESPALDO VECINAL ACTIVO"),
          130,
          statY + 65,
        );

        ctx.fillStyle = "#FFFFFF";
        ctx.font = "bold 60px sans-serif";
        ctx.fillText(`${supportCount}`, 130, statY + 145);

        ctx.fillStyle = "rgba(255, 255, 255, 0.75)";
        ctx.font = "500 32px sans-serif";
        ctx.fillText(
          translate(locale, "apoyos vecinales sumados"),
          260,
          statY + 145,
        );

        // 7. Pie con llamado a la acción
        const footerY = statY + 280;
        ctx.fillStyle = "#FFFFFF";
        ctx.font = "bold 40px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(translate(locale, "Sumá tu apoyo en:"), w / 2, footerY);

        // La URL completa no entra en una línea a 46 px: va en dos (origen y
        // ruta, luego el id) y la fuente se achica hasta que cada una entra.
        const fitText = (text: string, weight: string, maxSize: number) => {
          let size = maxSize;
          ctx.font = `${weight} ${size}px sans-serif`;
          while (ctx.measureText(text).width > w - 120 && size > 20) {
            size -= 2;
            ctx.font = `${weight} ${size}px sans-serif`;
          }
        };
        ctx.fillStyle = "#FB923C";
        fitText(flyerUrlHead, "bold", 46);
        ctx.fillText(flyerUrlHead, w / 2, footerY + 70);
        fitText(claimId, "bold", 40);
        ctx.fillText(claimId, w / 2, footerY + 125);
      };

      if (imageUrl) {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => drawPhotoOrPlaceholder(img);
        img.onerror = () => drawPhotoOrPlaceholder();
        img.src = imageUrl;
      } else {
        drawPhotoOrPlaceholder();
      }
    });

    // eslint-disable-next-line qwik/no-use-visible-task -- dibuja en un canvas que recién existe cuando el modal terminó de montarse
    useVisibleTask$(({ track }) => {
      track(() => isOpen.value);
      if (isOpen.value) {
        setTimeout(() => {
          renderCanvas();
        }, 80);
      }
    });

    const downloadFlyer = $(() => {
      triggerHapticFeedback("success");
      playCivicSound("celebrate");
      const canvas = canvasRef.value;
      if (!canvas) return;
      const link = document.createElement("a");
      link.download = `reclamo-${claimId.slice(0, 8)}-historias.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    });

    const copyFlyer = $(() => {
      const canvas = canvasRef.value;
      if (!canvas) return;
      try {
        canvas.toBlob(async (blob) => {
          if (!blob) return;
          if (navigator.clipboard && window.ClipboardItem) {
            await navigator.clipboard.write([
              new ClipboardItem({ "image/png": blob }),
            ]);
            triggerHapticFeedback("success");
            playCivicSound("click");
            showToast(
              translate(locale, "Imagen copiada al portapapeles"),
              "success",
            );
          } else {
            downloadFlyer();
          }
        }, "image/png");
      } catch {
        downloadFlyer();
      }
    });

    const shareFlyer = $(async () => {
      triggerHapticFeedback("selection");
      playCivicSound("click");
      const canvas = canvasRef.value;
      if (!canvas) return;
      isGenerating.value = true;
      try {
        canvas.toBlob(async (blob) => {
          if (!blob) return;
          const file = new File([blob], `reclamo-${claimId.slice(0, 8)}.png`, {
            type: "image/png",
          });
          if (
            navigator.canShare &&
            navigator.canShare({ files: [file] }) &&
            navigator.share
          ) {
            await navigator.share({
              title: claimTitle,
              text: translate(
                locale,
                "Reclamo vecinal en {{community}}: sumá tu apoyo.",
                { community: communityName },
              ),
              files: [file],
            });
          } else {
            downloadFlyer();
          }
        }, "image/png");
      } catch {
        downloadFlyer();
      } finally {
        isGenerating.value = false;
      }
    });

    return (
      <>
        {/* La misma fila que los imprimibles de "Difundir" (D126): tenía otra
            forma, subía al pasar el mouse y llevaba un emoji y Title Case. */}
        <button
          type="button"
          onClick$={() => {
            triggerHapticFeedback("selection");
            playCivicSound("toggle");
            isOpen.value = true;
          }}
          class="flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-xl border border-control bg-surface px-3 py-2 text-left text-sm font-medium text-ink-strong transition-colors hover:border-brand-500 hover:bg-muted touch-manipulation"
        >
          <Icon name="image" class="text-base text-ink-muted" />
          <span>{translate(locale, "Flyer para historias y redes")}</span>
        </button>

        {isOpen.value && (
          <Modal
            open={isOpen.value}
            onClose$={() => {
              isOpen.value = false;
            }}
            // El mismo nombre que el disparador: se tocaba un texto y se abría
            // un diálogo que decía otro, en Title Case.
            title={translate(locale, "Flyer para historias y redes")}
          >
            <div class="space-y-4">
              <p class="text-xs text-ink-muted">
                {translate(
                  locale,
                  "Generamos una imagen vertical de alta definición optimizada para subir a Historias de Instagram, estados de WhatsApp o Twitter con 1 clic:",
                )}
              </p>

              <div class="animate-scale-pop flex justify-center rounded-2xl bg-neutral-950 p-4 ring-1 ring-white/10 shadow-inner">
                <canvas
                  ref={canvasRef}
                  class="h-auto max-h-[50vh] w-auto max-w-full rounded-2xl shadow-2xl ring-1 ring-white/15"
                />
              </div>

              {/* Íconos propios y el movimiento de `Button` (D124): los emojis
                  hacían de íconos y una clase propia los subía al pasar el
                  mouse, sin respetar "reducir movimiento". El set no tiene
                  ícono de descarga: va la flecha hacia abajo, como en la
                  descarga de resultados de la encuesta. */}
              <div class="flex flex-wrap items-center justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick$={copyFlyer}
                >
                  <Icon name="copy" />
                  <span>{translate(locale, "Copiar imagen")}</span>
                </Button>

                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick$={downloadFlyer}
                >
                  <Icon name="arrow-right" class="rotate-90" />
                  <span>{translate(locale, "Descargar PNG")}</span>
                </Button>

                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick$={shareFlyer}
                >
                  <Icon name="share" />
                  <span>
                    {isGenerating.value
                      ? translate(locale, "Preparando...")
                      : translate(locale, "Compartir en redes")}
                  </span>
                </Button>
              </div>
            </div>
          </Modal>
        )}
      </>
    );
  },
);
