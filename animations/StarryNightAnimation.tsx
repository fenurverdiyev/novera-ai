import React from 'react';
import type { ThemeAnimationProps } from './themes';

interface Star {
    x: number;
    y: number;
    size: number;
    alpha: number;
    flickerSpeed: number;
}

interface ShootingStar {
    x: number;
    y: number;
    vx: number;
    vy: number;
    len: number;
    alpha: number;
}

export const StarryNightAnimation: React.FC<ThemeAnimationProps> = ({ analyserNode }) => {
    const canvasRef = React.useRef<HTMLCanvasElement>(null);
    const stars = React.useRef<Star[]>([]).current;
    const shootingStars = React.useRef<ShootingStar[]>([]).current;

    React.useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const resizeCanvas = () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
            if (stars.length === 0) {
                const starCount = Math.floor((canvas.width * canvas.height) / 10000);
                for (let i = 0; i < starCount; i++) {
                    stars.push({
                        x: Math.random() * canvas.width,
                        y: Math.random() * canvas.height,
                        size: Math.random() * 1.5 + 0.5,
                        alpha: Math.random() * 0.5 + 0.2,
                        flickerSpeed: Math.random() * 0.02 + 0.005,
                    });
                }
            }
        };
        window.addEventListener('resize', resizeCanvas);
        resizeCanvas();

        let animationFrameId: number;
        let frameCount = 0;

        const createShootingStar = () => {
            const angle = Math.random() * 0.2 + 0.1; // Shallow angle
            shootingStars.push({
                x: Math.random() * canvas.width,
                y: -20,
                vx: Math.cos(angle) * 15,
                vy: Math.sin(angle) * 15,
                len: Math.random() * 100 + 50,
                alpha: 1,
            });
        };

        const animate = () => {
            let audioLevel = 0;
            if (analyserNode) {
                const dataArray = new Uint8Array(analyserNode.frequencyBinCount);
                analyserNode.getByteFrequencyData(dataArray);
                const sum = dataArray.slice(32, 96).reduce((a, b) => a + b, 0); // Mid-range frequencies
                audioLevel = sum / (64 * 255);
            }

            // Slightly stronger trail for smooth upward drift
            ctx.fillStyle = 'rgba(13, 15, 25, 0.2)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // Draw stars
            stars.forEach(star => {
                // Upward drift (parallax: larger stars move a bit faster)
                // Faster base speed + a bit stronger audio reaction
                const drift = (0.16 + audioLevel * 0.9) * (0.7 + star.size * 0.6);
                star.y -= drift;
                if (star.y < -2) {
                    star.y = canvas.height + 2;
                    star.x = Math.random() * canvas.width;
                }

                const currentAlpha = star.alpha * (0.7 + Math.sin(frameCount * star.flickerSpeed + star.x) * 0.3);
                ctx.fillStyle = `rgba(255, 255, 255, ${currentAlpha})`;
                ctx.beginPath();
                ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
                ctx.fill();
            });

            // Create shooting stars based on audio
            if (audioLevel > 0.3 && Math.random() > 0.95) {
                createShootingStar();
            }

            // Draw shooting stars
            for (let i = shootingStars.length - 1; i >= 0; i--) {
                const ss = shootingStars[i];
                ss.x += ss.vx;
                ss.y += ss.vy;
                ss.alpha -= 0.02;

                if (ss.alpha <= 0) {
                    shootingStars.splice(i, 1);
                    continue;
                }

                const gradient = ctx.createLinearGradient(ss.x, ss.y, ss.x - ss.vx * ss.len, ss.y - ss.vy * ss.len);
                gradient.addColorStop(0, `rgba(255, 255, 255, ${ss.alpha})`);
                gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

                ctx.strokeStyle = gradient;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(ss.x, ss.y);
                ctx.lineTo(ss.x - ss.vx * ss.len, ss.y - ss.vy * ss.len);
                ctx.stroke();
            }

            frameCount++;
            animationFrameId = requestAnimationFrame(animate);
        };
        animate();

        return () => {
            window.removeEventListener('resize', resizeCanvas);
            cancelAnimationFrame(animationFrameId);
        };
    }, [analyserNode, stars, shootingStars]);

    return <canvas ref={canvasRef} className="fixed top-0 left-0 w-full h-full -z-10 bg-gradient-to-b from-[#0d0f19] to-[#1e293b]" />;
};
