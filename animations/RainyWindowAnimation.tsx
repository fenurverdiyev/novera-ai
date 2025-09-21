import React from 'react';
import type { ThemeAnimationProps } from './themes';

interface Drop {
    x: number;
    y: number;
    len: number;
    speed: number;
    alpha: number;
}

interface Ripple {
    x: number;
    y: number;
    r: number;
    a: number;
}

export const RainyWindowAnimation: React.FC<ThemeAnimationProps> = ({ analyserNode }) => {
    const canvasRef = React.useRef<HTMLCanvasElement>(null);
    const drops = React.useRef<Drop[]>([]).current;
    const enableFlash = true;
    const flash = React.useRef(0);
    const ripplesRef = React.useRef<Ripple[]>([]);

    React.useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const resizeCanvas = () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
            if (drops.length === 0) {
                const count = Math.max(350, Math.floor((canvas.width * canvas.height) / 8000));
                for (let i = 0; i < count; i++) {
                    drops.push({
                        x: Math.random() * canvas.width,
                        y: Math.random() * canvas.height,
                        len: 8 + Math.random() * 18,
                        speed: 3 + Math.random() * 5,
                        alpha: 0.15 + Math.random() * 0.35,
                    });
                }
            }
        };
        window.addEventListener('resize', resizeCanvas);
        resizeCanvas();

        let animationFrameId: number;

        const animate = () => {
            let audioLevel = 0;
            if (analyserNode) {
                const dataArray = new Uint8Array(analyserNode.frequencyBinCount);
                analyserNode.getByteFrequencyData(dataArray);
                const sum = dataArray.slice(0, 32).reduce((a, b) => a + b, 0);
                audioLevel = sum / (32 * 255);
            }

            const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
            grad.addColorStop(0, '#0d0f19');
            grad.addColorStop(1, '#111827');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            const vignette = ctx.createRadialGradient(
                canvas.width / 2, canvas.height / 2, Math.min(canvas.width, canvas.height) / 3,
                canvas.width / 2, canvas.height / 2, Math.max(canvas.width, canvas.height) / 1.1
            );
            vignette.addColorStop(0, 'rgba(0,0,0,0)');
            vignette.addColorStop(1, 'rgba(0,0,0,0.35)');
            ctx.fillStyle = vignette;
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            ctx.strokeStyle = 'rgba(200, 220, 255, 0.35)';
            ctx.lineWidth = 1;
            const boost = 1 + audioLevel * 2;
            for (let i = 0; i < drops.length; i++) {
                const d = drops[i];
                ctx.globalAlpha = d.alpha;
                ctx.beginPath();
                ctx.moveTo(d.x, d.y);
                ctx.lineTo(d.x + 0.8, d.y + d.len);
                ctx.stroke();
                d.y += d.speed * boost;
                d.x += 0.25;
                if (d.y > canvas.height) {
                    ripplesRef.current.push({ x: d.x, y: canvas.height - 6, r: 1, a: 0.35 + Math.random() * 0.2 });
                    if (ripplesRef.current.length > 120) ripplesRef.current.splice(0, ripplesRef.current.length - 120);
                    d.y = -10; d.x = Math.random() * canvas.width;
                }
                if (d.x > canvas.width + 10) d.x = -10;
            }
            ctx.globalAlpha = 1;

            if (ripplesRef.current.length) {
                ctx.save();
                ctx.globalCompositeOperation = 'lighter';
                for (let i = ripplesRef.current.length - 1; i >= 0; i--) {
                    const rp = ripplesRef.current[i];
                    ctx.strokeStyle = `rgba(160, 190, 255, ${rp.a})`;
                    ctx.lineWidth = 1.2;
                    ctx.beginPath();
                    ctx.arc(rp.x, rp.y, rp.r, 0, Math.PI * 2);
                    ctx.stroke();
                    rp.r += 1.5 * boost;
                    rp.a *= 0.97;
                    if (rp.a < 0.02 || rp.r > 240) {
                        ripplesRef.current.splice(i, 1);
                    }
                }
                ctx.restore();
            }

            if (enableFlash) {
                if (flash.current <= 0 && Math.random() < (0.012 + audioLevel * 0.03)) {
                    flash.current = 1.0;
                }
                if (flash.current > 0) {
                    ctx.fillStyle = `rgba(255,255,255,${0.25 * flash.current})`;
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                    const bolts = 2;
                    for (let b = 0; b < bolts; b++) {
                        const startX = Math.random() * canvas.width;
                        let y = Math.random() * (canvas.height * 0.2);
                        let x = startX;
                        const boltAlpha = 0.8 * flash.current;
                        ctx.strokeStyle = `rgba(255,255,255,${boltAlpha})`;
                        ctx.lineWidth = 3;
                        ctx.beginPath();
                        ctx.moveTo(x, y);
                        const segments = 6 + Math.floor(Math.random() * 5);
                        for (let s = 0; s < segments; s++) {
                            x += (Math.random() - 0.5) * 60;
                            y += canvas.height / (segments * (2 + Math.random()));
                            ctx.lineTo(x, y);
                        }
                        ctx.stroke();
                        ctx.save();
                        ctx.globalAlpha = boltAlpha * 0.35;
                        ctx.lineWidth = 10;
                        ctx.stroke();
                        ctx.restore();
                    }
                    flash.current *= 0.92;
                }
            }

            animationFrameId = requestAnimationFrame(animate);
        };
        animate();

        return () => {
            window.removeEventListener('resize', resizeCanvas);
            cancelAnimationFrame(animationFrameId);
        };
    }, [analyserNode, drops]);

    return <canvas ref={canvasRef} className="fixed top-0 left-0 w-full h-full -z-10" />;
};
