import React from 'react';
import type { ThemeAnimationProps } from './themes';

interface Leaf {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  angle: number;
  spin: number;
  hue: number;
  depth: number; // 0.4 .. 1 for parallax
}

export const FallingLeavesAnimation: React.FC<ThemeAnimationProps> = ({ analyserNode }) => {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const leaves = React.useRef<Leaf[]>([]).current;
  const time = React.useRef(0);
  const mouse = React.useRef({ x: window.innerWidth / 2, y: window.innerHeight / 2 });

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      if (leaves.length === 0) {
        const count = Math.max(60, Math.floor((canvas.width * canvas.height) / 35000));
        for (let i = 0; i < count; i++) {
          const depth = 0.4 + Math.random() * 0.6;
          leaves.push({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            vx: (Math.random() - 0.5) * 0.6 * depth,
            vy: (0.5 + Math.random()) * 0.6 * depth,
            size: (12 + Math.random() * 24) * depth,
            angle: Math.random() * Math.PI * 2,
            spin: (Math.random() - 0.5) * 0.02 * depth,
            hue: [28, 32, 18, 10, 6, 40, 20][Math.floor(Math.random() * 7)], // autumn hues
            depth,
          });
        }
      }
    };

    const onMouseMove = (e: MouseEvent) => {
      mouse.current.x = e.clientX;
      mouse.current.y = e.clientY;
    };

    window.addEventListener('resize', resizeCanvas);
    window.addEventListener('mousemove', onMouseMove);
    resizeCanvas();

    let animationFrameId: number;

    const drawLeaf = (leaf: Leaf, audioEnergy: number) => {
      const parallaxX = (mouse.current.x - canvas.width / 2) * 0.02 * (leaf.depth - 0.5);
      const parallaxY = (mouse.current.y - canvas.height / 2) * 0.01 * (leaf.depth - 0.5);

      ctx.save();
      ctx.translate(leaf.x + parallaxX, leaf.y + parallaxY);
      ctx.rotate(leaf.angle);

      // Leaf gradient body
      const grd = ctx.createLinearGradient(-leaf.size * 0.6, 0, leaf.size * 0.6, 0);
      const base = leaf.hue;
      grd.addColorStop(0, `hsla(${base - 10}, 80%, 45%, 0.9)`);
      grd.addColorStop(0.5, `hsla(${base}, 90%, ${50 + audioEnergy * 10}%, 0.95)`);
      grd.addColorStop(1, `hsla(${base + 10}, 80%, 45%, 0.9)`);
      ctx.fillStyle = grd;

      ctx.beginPath();
      // simple leaf shape (diamond + slight curve)
      const s = leaf.size;
      ctx.moveTo(0, -s * 0.8);
      ctx.quadraticCurveTo(s * 0.5, -s * 0.2, 0, s * 0.9);
      ctx.quadraticCurveTo(-s * 0.5, -s * 0.2, 0, -s * 0.8);
      ctx.closePath();
      ctx.fill();

      // Vein
      ctx.strokeStyle = `hsla(${base}, 30%, 20%, 0.5)`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.7);
      ctx.lineTo(0, s * 0.8);
      ctx.stroke();

      ctx.restore();
    };

    const animate = () => {
      let audioEnergy = 0;
      if (analyserNode) {
        const dataArray = new Uint8Array(analyserNode.frequencyBinCount);
        analyserNode.getByteFrequencyData(dataArray);
        const sum = dataArray.slice(0, 48).reduce((a, b) => a + b, 0);
        audioEnergy = sum / (48 * 255);
      }

      time.current += 0.01 + audioEnergy * 0.02;

      // Background gradient (autumn dusk)
      const bg = ctx.createLinearGradient(0, 0, 0, canvas.height);
      bg.addColorStop(0, '#1a1321');
      bg.addColorStop(0.5, '#2a1b16');
      bg.addColorStop(1, '#0d0f19');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // subtle vignette
      const v = ctx.createRadialGradient(
        canvas.width / 2, canvas.height / 2, Math.min(canvas.width, canvas.height) / 4,
        canvas.width / 2, canvas.height / 2, Math.max(canvas.width, canvas.height) / 1.05
      );
      v.addColorStop(0, 'rgba(0,0,0,0)');
      v.addColorStop(1, 'rgba(0,0,0,0.35)');
      ctx.fillStyle = v;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // wind sway
      const wind = Math.sin(time.current * 0.6) * (0.5 + audioEnergy * 1.2);

      // update + draw leaves
      for (let i = 0; i < leaves.length; i++) {
        const leaf = leaves[i];
        leaf.x += leaf.vx + wind * (0.7 * leaf.depth);
        leaf.y += leaf.vy + Math.sin(time.current + leaf.x * 0.01) * 0.2;
        leaf.angle += leaf.spin + audioEnergy * 0.02 * (leaf.depth);

        // Respawn if off-screen
        if (leaf.y > canvas.height + 30) {
          leaf.y = -40;
          leaf.x = Math.random() * canvas.width;
          leaf.vx = (Math.random() - 0.5) * 0.6 * leaf.depth;
          leaf.vy = (0.5 + Math.random()) * 0.6 * leaf.depth;
        }
        if (leaf.x < -50) leaf.x = canvas.width + 50;
        if (leaf.x > canvas.width + 50) leaf.x = -50;

        drawLeaf(leaf, audioEnergy);
      }

      animationFrameId = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      window.removeEventListener('mousemove', onMouseMove);
      cancelAnimationFrame(animationFrameId);
    };
  }, [analyserNode, leaves]);

  return <canvas ref={canvasRef} className="fixed top-0 left-0 w-full h-full -z-10" />;
};
