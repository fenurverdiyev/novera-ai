import React from 'react';
import type { ThemeAnimationProps } from './themes';

interface NeonCrystal {
  x: number;
  y: number;
  size: number;
  angle: number;
  sides: number;
  hue: number; // base hue
  rotSpeed: number;
  depth: number; // 0.5..1 for parallax & scale
}

interface Sparkle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  life: number;
  maxLife: number;
  hue: number;
}

// Light orbs that orbit crystals to create neon light trails
interface LightOrb {
  crystalIndex: number;
  angle: number;
  radius: number;
  speed: number;
  hue: number;
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  life: number;
  maxLife: number;
}

// Radial warp-speed particles
interface WarpParticle {
  angle: number;
  radius: number;
  speed: number;
  depth: number;
  hue: number;
}

// Aurora ribbons (lightweight flowing neon waves)
interface AuroraRibbon {
  baseY: number;
  amplitude: number;
  frequency: number;
  phase: number;
  speed: number;
  thickness: number;
  hueA: number;
  hueB: number;
  alpha: number;
  depth: number;
}

// Restrict palette to blue/pink/purple hues
const HUE_PALETTE = [210, 260, 300, 325];

// Performance flags (keep heavy effects off)
const DRAW_WARPS = false;
const DRAW_ORBS = false;
const DRAW_BEAMS = false;
const DRAW_PULSES = false;
const DRAW_SPARKLES = false;

export const NeonCrystalsAnimation: React.FC<ThemeAnimationProps> = ({ analyserNode }) => {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const crystals = React.useRef<NeonCrystal[]>([]).current;
  const sparkles = React.useRef<Sparkle[]>([]).current;
  const orbs = React.useRef<LightOrb[]>([]).current;
  const warps = React.useRef<WarpParticle[]>([]).current;
  const ribbons = React.useRef<AuroraRibbon[]>([]).current;
  const time = React.useRef(0);
  const mouse = React.useRef({ x: typeof window !== 'undefined' ? window.innerWidth / 2 : 0, y: typeof window !== 'undefined' ? window.innerHeight / 2 : 0 });

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const onMouseMove = (e: MouseEvent) => {
      mouse.current.x = e.clientX;
      mouse.current.y = e.clientY;
    };

    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      if (crystals.length === 0) {
        const count = 0; // disable crystals; we will draw an emblem instead
        for (let i = 0; i < count; i++) {
          crystals.push({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            size: 20 + Math.random() * 50,
            angle: Math.random() * Math.PI * 2,
            sides: 4 + Math.floor(Math.random() * 3), // 4..6
            hue: HUE_PALETTE[Math.floor(Math.random() * HUE_PALETTE.length)], // restricted to blue/pink/purple family
            rotSpeed: (Math.random() - 0.5) * 0.01,
            depth: 0.5 + Math.random() * 0.5,
          });
        }
      }

      // Initialize orbiting light orbs around random crystals
      orbs.length = 0;
      const orbCount = 0;
      for (let i = 0; i < orbCount; i++) {
        if (!crystals.length) break;
        const ci = Math.floor(Math.random() * crystals.length);
        const c = crystals[ci];
        const baseR = c.size * c.depth * (1.2 + Math.random() * 1.2);
        const angle = Math.random() * Math.PI * 2;
        const x = c.x + Math.cos(angle) * baseR;
        const y = c.y + Math.sin(angle) * baseR;
        orbs.push({
          crystalIndex: ci,
          angle,
          radius: baseR,
          speed: (0.005 + Math.random() * 0.01) * (Math.random() < 0.5 ? 1 : -1),
          hue: HUE_PALETTE[Math.floor(Math.random() * HUE_PALETTE.length)],
          x,
          y,
          prevX: x,
          prevY: y,
          life: 300 + Math.floor(Math.random() * 300),
          maxLife: 600,
        });
      }

      // Initialize warp-speed particles (radial streaks from center)
      warps.length = 0;
      const warpCount = 0;
      for (let i = 0; i < warpCount; i++) {
        warps.push({
          angle: Math.random() * Math.PI * 2,
          radius: Math.random() * Math.hypot(canvas.width, canvas.height) * 0.5,
          speed: 2 + Math.random() * 3,
          depth: 0.6 + Math.random() * 0.4,
          hue: HUE_PALETTE[Math.floor(Math.random() * HUE_PALETTE.length)],
        });
      }

      // Initialize aurora ribbons
      ribbons.length = 0;
      const rows = 3;
      for (let i = 0; i < rows; i++) {
        const depth = 0.6 + i * 0.2;
        const baseY = canvas.height * (0.35 + i * 0.18);
        const amplitude = 20 + i * 12;
        const frequency = 0.004 + i * 0.0015;
        const phase = Math.random() * Math.PI * 2;
        const speed = 0.3 + i * 0.12;
        const thickness = 14 + i * 8;
        const hueA = [200, 220, 280][i % 3];
        const hueB = [270, 300, 330][i % 3];
        const alpha = 0.18 + i * 0.04;
        ribbons.push({ baseY, amplitude, frequency, phase, speed, thickness, hueA, hueB, alpha, depth });
      }
    };
    window.addEventListener('resize', resizeCanvas);
    window.addEventListener('mousemove', onMouseMove);
    resizeCanvas();

    let animationFrameId: number;

    // Aurora draw
    const drawAurora = (energy: number) => {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const parallaxX = (mouse.current.x - canvas.width / 2) * 0.02;
      const parallaxY = (mouse.current.y - canvas.height / 2) * 0.015;
      for (let r = 0; r < ribbons.length; r++) {
        const rb = ribbons[r];
        const amp = rb.amplitude * (1 + energy * 0.8);
        const thick = rb.thickness * (1 + energy * 0.6);
        const midHue = (rb.hueA + rb.hueB) / 2;

        const grad = ctx.createLinearGradient(0, 0, canvas.width, 0);
        grad.addColorStop(0, `hsla(${rb.hueA}, 100%, 65%, ${rb.alpha})`);
        grad.addColorStop(1, `hsla(${rb.hueB}, 100%, 70%, ${rb.alpha})`);

        // Multi-pass glow
        for (let g = 3; g >= 1; g--) {
          ctx.shadowBlur = 10 * g + energy * 20;
          ctx.shadowColor = `hsla(${midHue},100%,70%,${0.15 + energy * 0.25})`;
          ctx.strokeStyle = grad;
          ctx.lineWidth = thick * (0.35 + g * 0.25);
          ctx.beginPath();
          const y0 = rb.baseY + parallaxY * rb.depth;
          for (let x = 0; x <= canvas.width + 20; x += 14) {
            const y = y0 + Math.sin(x * rb.frequency + rb.phase + time.current * rb.speed) * amp
                    + Math.sin((x * rb.frequency * 0.5) + rb.phase * 0.7 + time.current * rb.speed * 0.6) * amp * 0.25;
            if (x === 0) ctx.moveTo(x + parallaxX * rb.depth, y);
            else ctx.lineTo(x + parallaxX * rb.depth, y);
          }
          ctx.stroke();
        }
      }
      ctx.restore();
    };

    const drawCrystal = (c: NeonCrystal, energy: number) => {
      const glow = 0.5 + energy * 1.2;
      // Keep hue close to palette with gentle audio/time modulation
      const hueShift = c.hue + Math.sin(time.current * 0.7 + c.x * 0.02) * 12 + energy * 10;
      const pulseScale = 1 + Math.sin(time.current * 2 + c.x * 0.01) * 0.1 + energy * 0.3;

      ctx.save();
      const parallaxX = (mouse.current.x - canvas.width / 2) * 0.03 * (c.depth - 0.5);
      const parallaxY = (mouse.current.y - canvas.height / 2) * 0.02 * (c.depth - 0.5);
      ctx.translate(c.x + parallaxX, c.y + parallaxY);
      ctx.rotate(c.angle);
      ctx.scale(pulseScale, pulseScale);

      // Outer neon glow using additive blending
      ctx.globalCompositeOperation = 'lighter';
      for (let g = 3; g >= 1; g--) {
        ctx.beginPath();
        for (let i = 0; i < c.sides; i++) {
          const a = (i / c.sides) * Math.PI * 2;
          const r = (c.size * c.depth) * (1 + g * 0.15);
          const px = Math.cos(a) * r;
          const py = Math.sin(a) * r;
          i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.strokeStyle = `hsla(${hueShift}, 100%, ${65 + g * 5}%, ${glow * 0.06})`;
        ctx.lineWidth = 4 + g * 2;
        ctx.stroke();
      }

      // Inner bright core glow
      ctx.beginPath();
      for (let i = 0; i < c.sides; i++) {
        const a = (i / c.sides) * Math.PI * 2;
        const r = c.size * c.depth * 0.7;
        const px = Math.cos(a) * r;
        const py = Math.sin(a) * r;
        i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.closePath();
      const coreGradient = ctx.createRadialGradient(0, 0, 0, 0, 0, c.size * c.depth * 0.7);
      coreGradient.addColorStop(0, `hsla(${hueShift}, 100%, 90%, ${glow * 0.6})`);
      coreGradient.addColorStop(1, `hsla(${hueShift}, 100%, 70%, 0)`);
      ctx.fillStyle = coreGradient;
      ctx.fill();

      // Core shape
      ctx.beginPath();
      for (let i = 0; i < c.sides; i++) {
        const a = (i / c.sides) * Math.PI * 2;
        const r = c.size * c.depth;
        const px = Math.cos(a) * r;
        const py = Math.sin(a) * r;
        i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.strokeStyle = `hsla(${hueShift}, 100%, 85%, ${0.95})`;
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.restore();
      ctx.globalCompositeOperation = 'source-over';
    };

    const animate = () => {
      let energy = 0;
      if (analyserNode) {
        const dataArray = new Uint8Array(analyserNode.frequencyBinCount);
        analyserNode.getByteFrequencyData(dataArray);
        const sum = dataArray.slice(0, 24).reduce((a, b) => a + b, 0);
        energy = sum / (24 * 255);
      }

      time.current += 0.01 + energy * 0.02;
      // Background gradient
      const bg = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
      bg.addColorStop(0, `hsl(220, 50%, ${8 + energy * 3}%)`);
      bg.addColorStop(0.5, `hsl(240, 40%, ${6 + energy * 2}%)`);
      bg.addColorStop(1, `hsl(260, 45%, ${10 + energy * 4}%)`);
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Subtle starfield
      for (let i = 0; i < 18; i++) {
        const x = (i * 97) % canvas.width;
        const y = (i * 53) % canvas.height;
        const twinkle = Math.sin(time.current * 2 + i) * 0.5 + 0.5;
        const alpha = (0.06 + twinkle * 0.2) * (1 + energy * 0.8);
        ctx.fillStyle = `rgba(255,255,255,${alpha})`;
        ctx.fillRect(x, y, 1, 1);
      }

      // Aurora draw (centered, flowing)
      drawAurora(energy);

      // 3D warp-speed radial streaks (behind crystals)
      if (DRAW_WARPS) {
        const cx = canvas.width * 0.5 + (mouse.current.x - canvas.width * 0.5) * 0.05;
        const cy = canvas.height * 0.5 + (mouse.current.y - canvas.height * 0.5) * 0.04;
        const maxR = Math.hypot(canvas.width, canvas.height) * 0.7;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.lineCap = 'round';
        for (let i = 0; i < warps.length; i++) {
          const w = warps[i];
          const prevR = w.radius;
          w.radius += (w.speed + energy * 6) * (0.8 + w.depth * 0.4);
          let px = cx + Math.cos(w.angle) * prevR;
          let py = cy + Math.sin(w.angle) * prevR;
          let x = cx + Math.cos(w.angle) * w.radius;
          let y = cy + Math.sin(w.angle) * w.radius;
          if (w.radius > maxR || x < -50 || x > canvas.width + 50 || y < -50 || y > canvas.height + 50) {
            w.angle = Math.random() * Math.PI * 2;
            w.radius = Math.random() * 40;
            w.speed = 2 + Math.random() * 3;
            w.depth = 0.6 + Math.random() * 0.4;
            w.hue = HUE_PALETTE[Math.floor(Math.random() * HUE_PALETTE.length)];
            px = cx;
            py = cy;
            x = cx + Math.cos(w.angle) * w.radius;
            y = cy + Math.sin(w.angle) * w.radius;
          }
          const alpha = 0.08 + energy * 0.18;
          ctx.strokeStyle = `hsla(${w.hue}, 100%, 70%, ${alpha})`;
          ctx.shadowColor = `hsla(${w.hue}, 100%, 70%, ${alpha})`;
          ctx.shadowBlur = 8 + energy * 24;
          ctx.lineWidth = (0.6 + w.depth * 1.6) * (1 + energy * 1.2) * (0.6 + (w.radius / maxR) * 0.7);
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(x, y);
          ctx.stroke();
        }
        ctx.restore();
      }

      // Move and draw crystals
      crystals.forEach(c => {
        c.angle += c.rotSpeed + energy * 0.005;
        drawCrystal(c, energy);

        // Create crystal particles on high energy
        if (energy > 0.5 && Math.random() < 0.1) {
          const particleX = c.x + (Math.random() - 0.5) * c.size * 2;
          const particleY = c.y + (Math.random() - 0.5) * c.size * 2;

          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.fillStyle = `hsla(${c.hue}, 100%, 80%, ${energy * 0.8})`;
          ctx.beginPath();
          ctx.arc(particleX, particleY, 1 + Math.random() * 2, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      });

      // Orbiting light trails around crystals
      if (DRAW_ORBS) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.lineCap = 'round';
        for (let i = orbs.length - 1; i >= 0; i--) {
          const o = orbs[i];
          const c = crystals[o.crystalIndex];
          if (!c) { orbs.splice(i, 1); continue; }
          const parallaxX = (mouse.current.x - canvas.width / 2) * 0.02 * (c.depth - 0.5);
          const parallaxY = (mouse.current.y - canvas.height / 2) * 0.015 * (c.depth - 0.5);
          const cx = c.x + parallaxX;
          const cy = c.y + parallaxY;
          o.prevX = o.x;
          o.prevY = o.y;
          o.angle += o.speed + energy * 0.012;
          const wobble = 1 + Math.sin(time.current * 3 + i) * 0.04 + energy * 0.1;
          const r = o.radius * wobble;
          o.x = cx + Math.cos(o.angle) * r;
          o.y = cy + Math.sin(o.angle) * r;
          o.life--;
          if (o.life <= 0) {
            // Respawn around another random crystal
            const ni = Math.floor(Math.random() * crystals.length);
            const nc = crystals[ni];
            const nr = nc.size * nc.depth * (1.2 + Math.random() * 1.2);
            const na = Math.random() * Math.PI * 2;
            o.crystalIndex = ni;
            o.radius = nr;
            o.angle = na;
            o.x = nc.x + Math.cos(na) * nr;
            o.y = nc.y + Math.sin(na) * nr;
            o.prevX = o.x;
            o.prevY = o.y;
            o.hue = HUE_PALETTE[Math.floor(Math.random() * HUE_PALETTE.length)];
            o.life = o.maxLife;
          }

          // Multisegment trail (short motion blur)
          for (let t = 0; t < 3; t++) {
            const back = (t + 1) * 0.10;
            const ax = cx + Math.cos(o.angle - back) * r;
            const ay = cy + Math.sin(o.angle - back) * r;
            const alpha = 0.25 * (1 - t / 3) + energy * 0.2;
            ctx.strokeStyle = `hsla(${o.hue}, 100%, 70%, ${alpha})`;
            ctx.shadowColor = `hsla(${o.hue}, 100%, 70%, ${alpha})`;
            ctx.shadowBlur = 10 + energy * 30;
            ctx.lineWidth = 1.2 + energy * 2.2;
            ctx.beginPath();
            ctx.moveTo(ax, ay);
            ctx.lineTo(o.x, o.y);
            ctx.stroke();
          }
        }
        ctx.restore();
      }

      // Spawn sparkles near crystal edges (audio-reactive)
      if (DRAW_SPARKLES && energy > 0.3) {
        const sparkleCount = Math.floor(energy * 15);
        for (let s = 0; s < sparkleCount; s++) {
          const c = crystals[Math.floor(Math.random() * crystals.length)];
          if (!c) continue;

          // Create sparkles around crystal perimeter
          const angle = Math.random() * Math.PI * 2;
          const distance = c.size * c.depth * (1.2 + Math.random() * 0.5);
          const sparkleX = c.x + Math.cos(angle) * distance;
          const sparkleY = c.y + Math.sin(angle) * distance;

          ctx.save();
          ctx.globalCompositeOperation = 'lighter';

          // Multi-layer sparkle effect
          const sparkleSize = 1 + Math.random() * 3;
          const sparkleHue = (c.hue + Math.random() * 60 - 30) % 360;

          // Outer glow
          ctx.fillStyle = `hsla(${sparkleHue}, 100%, 70%, ${energy * 0.6})`;
          ctx.beginPath();
          ctx.arc(sparkleX, sparkleY, sparkleSize * 2, 0, Math.PI * 2);
          ctx.fill();

          // Inner bright core
          ctx.fillStyle = `hsla(${sparkleHue}, 100%, 90%, ${energy * 0.9})`;
          ctx.beginPath();
          ctx.arc(sparkleX, sparkleY, sparkleSize, 0, Math.PI * 2);
          ctx.fill();

          // Ultra-bright center
          ctx.fillStyle = `rgba(255, 255, 255, ${energy * 0.8})`;
          ctx.beginPath();
          ctx.arc(sparkleX, sparkleY, sparkleSize * 0.3, 0, Math.PI * 2);
          ctx.fill();

          ctx.restore();
        }
      }

      // Enhanced energy pulse waves
      if (DRAW_PULSES && energy > 0.4) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';

        const pulseCount = Math.floor(energy * 8);
        for (let p = 0; p < pulseCount; p++) {
          const centerX = canvas.width * (0.2 + Math.random() * 0.6);
          const centerY = canvas.height * (0.2 + Math.random() * 0.6);
          const maxRadius = 100 + Math.random() * 150;
          const pulsePhase = (time.current * 2 + p) % (Math.PI * 2);
          const currentRadius = (Math.sin(pulsePhase) * 0.5 + 0.5) * maxRadius;

          if (currentRadius > 10) {
            const pulseGradient = ctx.createRadialGradient(
              centerX, centerY, currentRadius * 0.8,
              centerX, centerY, currentRadius
            );
            const alpha = energy * 0.3 * (1 - currentRadius / maxRadius);
            const hue = (200 + Math.sin(time.current + p) * 60) % 360;

            pulseGradient.addColorStop(0, `hsla(${hue}, 80%, 70%, ${alpha})`);
            pulseGradient.addColorStop(1, `hsla(${hue}, 80%, 70%, 0)`);

            ctx.strokeStyle = pulseGradient;
            ctx.lineWidth = 2 + energy * 3;
            ctx.beginPath();
            ctx.arc(centerX, centerY, currentRadius, 0, Math.PI * 2);
            ctx.stroke();
          }
        }
        ctx.restore();
      }

      // Audio-reactive connecting beams between nearby crystals
      const beamCount = DRAW_BEAMS ? Math.min(8, Math.floor(energy * 12)) : 0;
      if (beamCount > 0 && crystals.length > 1) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (let b = 0; b < beamCount; b++) {
          const a = crystals[Math.floor(Math.random() * crystals.length)];
          const b2 = crystals[Math.floor(Math.random() * crystals.length)];
          if (a === b2) continue;
          const dx = b2.x - a.x;
          const dy = b2.y - a.y;
          const dist = Math.hypot(dx, dy);
          if (dist > 350) continue;
          const hueMid = (a.hue + b2.hue) / 2;
          const alpha = 0.15 + energy * 0.4;

          // Multi-layer beam effect
          ctx.strokeStyle = `hsla(${hueMid}, 100%, 60%, ${alpha * 0.3})`;
          ctx.lineWidth = 3 + energy * 2;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          const mx = (a.x + b2.x) / 2 + Math.sin(time.current + a.x * 0.01) * 6;
          const my = (a.y + b2.y) / 2 + Math.cos(time.current + a.y * 0.01) * 6;
          ctx.quadraticCurveTo(mx, my, b2.x, b2.y);
          ctx.stroke();

          // Bright core beam
          ctx.strokeStyle = `hsla(${hueMid}, 100%, 85%, ${alpha})`;
          ctx.lineWidth = 1 + energy;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.quadraticCurveTo(mx, my, b2.x, b2.y);
          ctx.stroke();
        }
        ctx.restore();
      }

      animationFrameId = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      window.removeEventListener('mousemove', onMouseMove);
      cancelAnimationFrame(animationFrameId);
    };
  }, [analyserNode, crystals, ribbons]);

  return <canvas ref={canvasRef} className="fixed top-0 left-0 w-full h-full -z-10" />;
};
