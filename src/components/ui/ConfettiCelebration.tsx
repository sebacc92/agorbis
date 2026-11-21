import { prefersReducedMotion } from "~/lib/accessibility-preferences";

// Acá vivía también un componente `<ConfettiCelebration>` que disparaba esto
// al montarse con una tarea visible; nadie lo usaba y se retiró. Lo que se usa
// es la función, llamada desde el gesto que celebra.

/**
 * Dispara una ráfaga sutil de confeti cívico en pantalla.
 * Utiliza un canvas efímero y liviano sin dependencias externas.
 */
export const triggerCivicConfetti = () => {
  if (prefersReducedMotion()) return;

  const canvas = document.createElement("canvas");
  canvas.style.position = "fixed";
  canvas.style.top = "0";
  canvas.style.left = "0";
  canvas.style.width = "100vw";
  canvas.style.height = "100vh";
  canvas.style.pointerEvents = "none";
  canvas.style.zIndex = "9999";
  document.body.appendChild(canvas);

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    canvas.remove();
    return;
  }

  const dpr = window.devicePixelRatio || 1;
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  ctx.scale(dpr, dpr);

  const colors = ["#7c3aed", "#fbbf24", "#10b981", "#06b6d4", "#f43f5e"];
  const count = 40;
  const particles: Array<{
    x: number;
    y: number;
    size: number;
    color: string;
    vx: number;
    vy: number;
    rotation: number;
    vRot: number;
    opacity: number;
  }> = [];

  const originX = window.innerWidth / 2;
  const originY = window.innerHeight * 0.45;

  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 2 + Math.random() * 5;
    particles.push({
      x: originX,
      y: originY,
      size: 4 + Math.random() * 5,
      color: colors[Math.floor(Math.random() * colors.length)],
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 2.5,
      rotation: Math.random() * 360,
      vRot: (Math.random() - 0.5) * 10,
      opacity: 1,
    });
  }

  let animationFrameId: number;
  const startTime = performance.now();

  const draw = (now: number) => {
    const elapsed = now - startTime;
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

    let activeCount = 0;
    for (const p of particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.15; // Gravedad suave
      p.vx *= 0.98; // Resistencia al aire
      p.rotation += p.vRot;

      if (elapsed > 1200) {
        p.opacity = Math.max(0, 1 - (elapsed - 1200) / 800);
      }

      if (p.opacity > 0) {
        activeCount++;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.globalAlpha = p.opacity;
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 1.5);
        ctx.restore();
      }
    }

    if (activeCount > 0 && elapsed < 2200) {
      animationFrameId = requestAnimationFrame(draw);
    } else {
      cancelAnimationFrame(animationFrameId);
      canvas.remove();
    }
  };

  animationFrameId = requestAnimationFrame(draw);
};
