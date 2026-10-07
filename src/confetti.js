// A small canvas confetti burst. The canvas is created on first use and clears itself when done.

const COLORS = ["#6366f1", "#22d3ee", "#34d399", "#fbbf24", "#f472b6", "#a78bfa"];
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");

let canvas = null;
let context = null;
let pieces = [];
let frame = 0;
let last = 0;

function setUp() {
  canvas = document.createElement("canvas");
  canvas.className = "confetti";
  canvas.setAttribute("aria-hidden", "true");
  document.body.append(canvas);
  context = canvas.getContext("2d");
  const resize = () => {
    const ratio = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(innerWidth * ratio);
    canvas.height = Math.round(innerHeight * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
  };
  resize();
  addEventListener("resize", resize);
}

function tick(time) {
  const step = last ? Math.min((time - last) / 16.7, 3) : 1;
  last = time;
  context.clearRect(0, 0, innerWidth, innerHeight);
  pieces = pieces.filter((piece) => piece.life < piece.ttl && piece.y < innerHeight + 20);
  for (const piece of pieces) {
    piece.life += step;
    piece.vy += 0.22 * step;
    piece.vx *= 0.985 ** step;
    piece.x += piece.vx * step;
    piece.y += piece.vy * step;
    piece.rotation += piece.spin * step;
    context.globalAlpha = Math.max(0, 1 - piece.life / piece.ttl);
    context.fillStyle = piece.color;
    context.save();
    context.translate(piece.x, piece.y);
    context.rotate(piece.rotation);
    if (piece.round) {
      context.beginPath();
      context.arc(0, 0, piece.size / 3, 0, Math.PI * 2);
      context.fill();
    } else {
      context.fillRect(-piece.size / 2, -piece.size / 4, piece.size, piece.size / 2);
    }
    context.restore();
  }
  context.globalAlpha = 1;
  if (pieces.length) {
    frame = requestAnimationFrame(tick);
  } else {
    frame = 0;
    last = 0;
  }
}

/** Burst `count` pieces upward from (x, y) in viewport pixels. */
export function confetti(x, y, { count = 24, spread = 0.9, power = 1 } = {}) {
  if (reduceMotion.matches) return;
  if (!canvas) setUp();
  for (let i = 0; i < count; i++) {
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * spread;
    const speed = (3.5 + Math.random() * 5.5) * power;
    pieces.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size: 5 + Math.random() * 5,
      rotation: Math.random() * Math.PI,
      spin: (Math.random() - 0.5) * 0.35,
      color: COLORS[i % COLORS.length],
      round: Math.random() < 0.35,
      life: 0,
      ttl: 55 + Math.random() * 45,
    });
  }
  if (!frame) frame = requestAnimationFrame(tick);
}

/** The bigger show for finishing everything on the list. */
export function celebrate() {
  confetti(innerWidth * 0.22, innerHeight * 0.45, { count: 70, spread: 1.1, power: 1.6 });
  confetti(innerWidth * 0.78, innerHeight * 0.45, { count: 70, spread: 1.1, power: 1.6 });
}
