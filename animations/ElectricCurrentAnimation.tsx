import React from 'react';
import type { ThemeAnimationProps } from './themes';

interface Lightning {
    points: { x: number; y: number }[];
    life: number;
    maxLife: number;
    intensity: number;
}

interface Spark {
    x: number;
    y: number;
    vx: number;
    vy: number;
    life: number;
    maxLife: number;
}

interface EnergyRing {
    x: number;
    y: number;
    r: number;
    vr: number;
    life: number;
    maxLife: number;
}

export const ElectricCurrentAnimation: React.FC<ThemeAnimationProps> = ({ analyserNode }) => {
    const canvasRef = React.useRef<HTMLCanvasElement>(null);
    const lightnings = React.useRef<Lightning[]>([]).current;
    const sparks = React.useRef<Spark[]>([]).current;
    const rings = React.useRef<EnergyRing[]>([]).current;
    const flashRef = React.useRef(0); // global flash intensity 0..1

    React.useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const resizeCanvas = () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
            // No rain in electric theme
        };
        window.addEventListener('resize', resizeCanvas);
        resizeCanvas();

        let animationFrameId: number;

        const createLightning = (startX: number, startY: number, endX: number, endY: number, intensity: number) => {
            const points = [];
            const segments = 20;
            
            for (let i = 0; i <= segments; i++) {
                const t = i / segments;
                const x = startX + (endX - startX) * t + (Math.random() - 0.5) * 50 * intensity;
                const y = startY + (endY - startY) * t + (Math.random() - 0.5) * 30 * intensity;
                points.push({ x, y });
            }

            lightnings.push({
                points,
                life: 15,
                maxLife: 15,
                intensity,
            });
            // trigger brief global flash
            flashRef.current = Math.min(1, flashRef.current + 0.8);

            // energy rings at strike origin and destination
            const baseVr = 2 + intensity * 1.5;
            rings.push({ x: startX, y: startY, r: 8, vr: baseVr, life: 28, maxLife: 28 });
            rings.push({ x: endX, y: endY, r: 8, vr: baseVr, life: 28, maxLife: 28 });

            // Create small branching forks from mid segments
            for (let b = 0; b < 3; b++) {
                const idx = 5 + Math.floor(Math.random() * Math.max(1, points.length - 10));
                const base = points[idx];
                const offX = (Math.random() - 0.5) * 120;
                const offY = (Math.random() - 0.5) * 80;
                const branchEndX = base.x + offX;
                const branchEndY = base.y + offY;
                const branchPts: { x: number; y: number }[] = [];
                const segs = 8;
                for (let i = 0; i <= segs; i++) {
                    const t = i / segs;
                    const x = base.x + (branchEndX - base.x) * t + (Math.random() - 0.5) * 20 * intensity;
                    const y = base.y + (branchEndY - base.y) * t + (Math.random() - 0.5) * 12 * intensity;
                    branchPts.push({ x, y });
                }
                lightnings.push({ points: branchPts, life: 10, maxLife: 10, intensity: intensity * 0.6 });
            }
        };

        const createSpark = (x: number, y: number) => {
            sparks.push({
                x,
                y,
                vx: (Math.random() - 0.5) * 8,
                vy: (Math.random() - 0.5) * 8,
                life: 30,
                maxLife: 30,
            });
        };

        const animate = () => {
            let audioLevel = 0;
            if (analyserNode) {
                const dataArray = new Uint8Array(analyserNode.frequencyBinCount);
                analyserNode.getByteFrequencyData(dataArray);
                const sum = dataArray.slice(0, 32).reduce((a, b) => a + b, 0);
                audioLevel = sum / (32 * 255);
            }

            // Clear canvas with electric background
            const gradient = ctx.createRadialGradient(
                canvas.width / 2, canvas.height / 2, 0,
                canvas.width / 2, canvas.height / 2, Math.max(canvas.width, canvas.height) / 2
            );
            gradient.addColorStop(0, '#0d0f19');
            gradient.addColorStop(0.5, '#1e1b4b');
            gradient.addColorStop(1, '#0d0f19');
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // Subtle circuit grid glow
            const gridSpacing = Math.max(60, Math.min(120, Math.floor(canvas.width / 16)));
            const gridAlpha = 0.03 + audioLevel * 0.07;
            ctx.strokeStyle = `rgba(56, 78, 110, ${gridAlpha})`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            for (let x = 0; x <= canvas.width; x += gridSpacing) {
                ctx.moveTo(x + 0.5, 0);
                ctx.lineTo(x + 0.5, canvas.height);
            }
            for (let y = 0; y <= canvas.height; y += gridSpacing) {
                ctx.moveTo(0, y + 0.5);
                ctx.lineTo(canvas.width, y + 0.5);
            }
            ctx.stroke();

            // No rain layer in electric theme

            // Create new lightning based on audio
            if (Math.random() < audioLevel * 1.2 + 0.1) {
                const startX = Math.random() * canvas.width;
                const startY = Math.random() * canvas.height * 0.3;
                const endX = Math.random() * canvas.width;
                const endY = canvas.height * 0.7 + Math.random() * canvas.height * 0.3;
                createLightning(startX, startY, endX, endY, 0.8 + audioLevel * 3);
            }

            // Create horizontal lightning arcs (audio-reactive)
            if (Math.random() < audioLevel * 0.6) {
                const y = Math.random() * canvas.height;
                const startX = Math.random() * canvas.width * 0.3;
                const endX = canvas.width * 0.7 + Math.random() * canvas.width * 0.3;
                createLightning(startX, y, endX, y + (Math.random() - 0.5) * 100, 0.6 + audioLevel * 2);
            }

            // Update and draw lightning
            for (let i = lightnings.length - 1; i >= 0; i--) {
                const lightning = lightnings[i];
                lightning.life--;

                if (lightning.life <= 0) {
                    lightnings.splice(i, 1);
                    continue;
                }

                const alpha = (lightning.life / lightning.maxLife) * (0.8 + audioLevel * 0.4);
                
                // Draw lightning with blue glow + yellow core + white highlight
                const drawBolt = (color: string, width: number, a: number) => {
                    ctx.beginPath();
                    ctx.moveTo(lightning.points[0].x, lightning.points[0].y);
                    for (let j = 1; j < lightning.points.length; j++) {
                        ctx.lineTo(lightning.points[j].x, lightning.points[j].y);
                    }
                    ctx.strokeStyle = color.replace('$a', String(a));
                    ctx.lineWidth = width * lightning.intensity * (1 + audioLevel * 0.5);
                    ctx.stroke();
                };

                // Enhanced multi-layer lightning
                // Outer blue glow
                drawBolt(`rgba(96,165,250,$a)`, 8, alpha * 0.4);
                // Mid blue glow
                drawBolt(`rgba(147,197,253,$a)`, 5, alpha * 0.6);
                // Yellow-orange core
                drawBolt(`rgba(251,191,36,$a)`, 3, alpha * 0.9);
                // Bright white center
                drawBolt(`rgba(255,255,255,$a)`, 1.5, alpha);
                // Ultra-bright core flash
                if (lightning.life > lightning.maxLife * 0.8) {
                    drawBolt(`rgba(255,255,255,$a)`, 0.8, alpha * 1.5);
                }

                // Create sparks at random points
                if (Math.random() < 0.4 + audioLevel * 0.3) {
                    const randomPoint = lightning.points[Math.floor(Math.random() * lightning.points.length)];
                    createSpark(randomPoint.x, randomPoint.y);
                }
            }

            // Update and draw sparks
            for (let i = sparks.length - 1; i >= 0; i--) {
                const spark = sparks[i];
                
                spark.x += spark.vx;
                spark.y += spark.vy;
                spark.vx *= 0.98;
                spark.vy *= 0.98;
                spark.life--;

                if (spark.life <= 0) {
                    sparks.splice(i, 1);
                    continue;
                }

                const alpha = spark.life / spark.maxLife;
                
                ctx.beginPath();
                ctx.arc(spark.x, spark.y, 2, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(251, 191, 36, ${alpha})`;
                ctx.fill();
            }

            // Update and draw energy rings
            for (let i = rings.length - 1; i >= 0; i--) {
                const ring = rings[i];
                ring.r += ring.vr;
                ring.life--;
                if (ring.life <= 0) { rings.splice(i, 1); continue; }
                const a = (ring.life / ring.maxLife) * (0.25 + audioLevel * 0.5);
                ctx.save();
                ctx.globalCompositeOperation = 'screen';
                // soft halo
                ctx.strokeStyle = `rgba(144, 205, 255, ${a * 0.4})`;
                ctx.lineWidth = 6;
                ctx.beginPath();
                ctx.arc(ring.x, ring.y, ring.r, 0, Math.PI * 2);
                ctx.stroke();
                // inner brighter ring
                ctx.strokeStyle = `rgba(251, 191, 36, ${a * 0.6})`;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(ring.x, ring.y, ring.r, 0, Math.PI * 2);
                ctx.stroke();
                ctx.restore();
            }

            // Cap arrays
            if (rings.length > 24) rings.splice(0, rings.length - 24);

            // Keep arrays reasonable size
            if (lightnings.length > 10) {
                lightnings.splice(0, lightnings.length - 10);
            }
            if (sparks.length > 120) {
                sparks.splice(0, sparks.length - 120);
            }

            // Global lightning flash overlay
            if (flashRef.current > 0) {
                const f = flashRef.current;
                // Enhanced flash with blue tint
                ctx.fillStyle = `rgba(200,220,255,${0.15 * f})`;
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                flashRef.current = Math.max(0, flashRef.current - 0.08);
            }

            // Audio-reactive electric field distortion
            if (audioLevel > 0.3) {
                ctx.save();
                ctx.globalCompositeOperation = 'lighter';
                const fieldIntensity = (audioLevel - 0.3) * 2;
                for (let i = 0; i < 8; i++) {
                    const x = Math.random() * canvas.width;
                    const y = Math.random() * canvas.height;
                    const radius = 20 + Math.random() * 40;
                    
                    const fieldGradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
                    fieldGradient.addColorStop(0, `rgba(100, 150, 255, ${fieldIntensity * 0.3})`);
                    fieldGradient.addColorStop(1, 'rgba(100, 150, 255, 0)');
                    
                    ctx.fillStyle = fieldGradient;
                    ctx.beginPath();
                    ctx.arc(x, y, radius, 0, Math.PI * 2);
                    ctx.fill();
                }
                ctx.restore();
            }

            animationFrameId = requestAnimationFrame(animate);
        };
        animate();

        return () => {
            window.removeEventListener('resize', resizeCanvas);
            cancelAnimationFrame(animationFrameId);
        };
    }, [analyserNode, lightnings, sparks]);

    return <canvas ref={canvasRef} className="fixed top-0 left-0 w-full h-full -z-10" />;
};
