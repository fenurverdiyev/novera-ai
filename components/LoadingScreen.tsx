import React, { useEffect, useRef } from 'react';
import { Logo } from './Logo';

export const LoadingScreen: React.FC = () => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let animationFrameId: number;
        const stars: { x: number, y: number, radius: number, alpha: number, velocity: { x: number, y: number } }[] = [];
        const shootingStars: { x: number, y: number, len: number, speed: number, size: number, wait: number, active: boolean }[] = [];

        const setup = () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;

            for (let i = 0; i < 150; i++) {
                stars.push({
                    x: Math.random() * canvas.width,
                    y: Math.random() * canvas.height,
                    radius: Math.random() * 1.5,
                    alpha: Math.random(),
                    velocity: { x: (Math.random() - 0.5) * 0.1, y: (Math.random() - 0.5) * 0.1 }
                });
            }
            
            for (let i = 0; i < 3; i++) {
                shootingStars.push({
                    x: Math.random() * canvas.width,
                    y: Math.random() * canvas.height,
                    len: Math.random() * 80 + 10,
                    speed: Math.random() * 10 + 6,
                    size: Math.random() * 1 + 0.5,
                    wait: Math.random() * 3000,
                    active: false
                });
            }
        };

        const draw = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            // Stars
            ctx.fillStyle = "white";
            stars.forEach(star => {
                ctx.save();
                ctx.globalAlpha = star.alpha;
                ctx.beginPath();
                ctx.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            });
            
            // Shooting stars
            shootingStars.forEach(star => {
                if (star.active) {
                    ctx.beginPath();
                    ctx.moveTo(star.x, star.y);
                    ctx.lineTo(star.x + star.len, star.y - star.len);
                    ctx.strokeStyle = `rgba(255, 255, 255, 0.5)`;
                    ctx.lineWidth = star.size;
                    ctx.stroke();
                }
            });

            update();
            animationFrameId = requestAnimationFrame(draw);
        };

        const update = () => {
            stars.forEach(star => {
                star.x += star.velocity.x;
                star.y += star.velocity.y;
                if (star.x < 0 || star.x > canvas.width) star.velocity.x *= -1;
                if (star.y < 0 || star.y > canvas.height) star.velocity.y *= -1;
            });
            
            shootingStars.forEach(star => {
                if (star.active) {
                    star.x -= star.speed;
                    star.y += star.speed;
                    if (star.x < -star.len || star.y > canvas.height + star.len) {
                        star.active = false;
                        star.wait = Math.random() * 5000 + 1000;
                    }
                } else {
                    star.wait -= 16;
                    if (star.wait <= 0) {
                        star.x = Math.random() * canvas.width + 50;
                        star.y = -10;
                        star.active = true;
                    }
                }
            });
        };

        const handleResize = () => {
            stars.length = 0;
            shootingStars.length = 0;
            setup();
        };

        setup();
        draw();
        window.addEventListener('resize', handleResize);

        return () => {
            cancelAnimationFrame(animationFrameId);
            window.removeEventListener('resize', handleResize);
        };
    }, []);

    return (
        <div className="w-full h-full flex flex-col items-center justify-center gap-8">
            <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
            <div className="z-10 animate-pulse text-center">
                <Logo isLarge={true} />
            </div>
            <p className="z-10 text-text-sub text-lg animate-pulse tracking-widest uppercase font-medium">
                Yüklənir...
            </p>
        </div>
    );
};