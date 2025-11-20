import React, { useEffect, useRef } from 'react';
import { ThemeAnimationProps } from './themes';

export const NebulaAnimation: React.FC<ThemeAnimationProps> = ({ analyserNode }) => {
    const analyserRef = useRef(analyserNode);

    useEffect(() => {
        analyserRef.current = analyserNode;
    }, [analyserNode]);
    
    useEffect(() => {
        const canvas = document.getElementById('theme-animation-canvas') as HTMLCanvasElement;
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let animationFrameId: number;
        let particles: any[] = [];
        let orbs: any[] = [];
        let time = 0;
        const prefersReduced = typeof window !== 'undefined' && 'matchMedia' in window && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        let lowQ = prefersReduced;
        let lastTs = performance.now();
        let fpsAvg = 60;
        let paused = false;
        
        class Orb {
            x: number; y: number;
            vx: number; vy: number;
            radius: number;
            color: string;

            constructor() {
                this.x = Math.random() * canvas.width;
                this.y = Math.random() * canvas.height;
                this.vx = Math.random() - 0.5;
                this.vy = Math.random() - 0.5;
                this.radius = Math.random() * 10 + 10;
                this.color = `hsla(${Math.random() * 60 + 240}, 100%, 80%, 0.1)`;
            }

            update() {
                this.x += this.vx;
                this.y += this.vy;
                if (this.x < 0 || this.x > canvas.width) this.vx *= -1;
                if (this.y < 0 || this.y > canvas.height) this.vy *= -1;
            }

            draw() {
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
                ctx.fillStyle = this.color;
                ctx.fill();
                ctx.strokeStyle = this.color.replace('0.1', '0.5');
                ctx.stroke();
            }
        }

        class Particle {
            x: number; y: number;
            vx: number; vy: number;
            size: number;
            color: string;
            life: number;
            fromOrb: boolean;

            constructor(x: number, y: number, fromOrb = false) {
                this.x = x;
                this.y = y;
                this.fromOrb = fromOrb;
                this.size = fromOrb ? Math.random() * 3 + 1 : 1;
                const angle = Math.random() * Math.PI * 2;
                const speed = fromOrb ? Math.random() * 4 + 1 : 0;
                this.vx = fromOrb ? Math.cos(angle) * speed : 0;
                this.vy = fromOrb ? Math.sin(angle) * speed : 0;
                this.color = `hsla(${Math.random() * 60 + 240}, 100%, 80%, 1)`;
                this.life = 1;
            }

            update() {
                if (this.fromOrb) {
                    this.x += this.vx;
                    this.y += this.vy;
                    this.vy += 0.03; // gravity
                    this.vx *= 0.99;
                    this.vy *= 0.99;
                    this.life -= 0.02;
                }
            }

            draw() {
                ctx.fillStyle = this.color.replace('1)', `${this.life})`);
                ctx.beginPath();
                ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        
        const setup = () => {
             canvas.width = window.innerWidth;
             canvas.height = window.innerHeight;
             orbs = [];
             const target = lowQ ? 3 : 5;
             for (let i = 0; i < target; i++) { orbs.push(new Orb()); }
        }

        const animate = () => {
            if (paused) return;
            const now = performance.now();
            const dt = now - lastTs;
            lastTs = now;
            const fps = 1000 / Math.max(1, dt);
            fpsAvg = fpsAvg * 0.9 + fps * 0.1;
            if (fpsAvg < 28) lowQ = true; else if (fpsAvg > 45 && !prefersReduced) lowQ = false;
            time += 0.005;
            ctx.fillStyle = lowQ ? 'rgba(13, 15, 25, 0.28)' : 'rgba(13, 15, 25, 0.2)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            let audioLevel = 0;
            let bassLevel = 0;

            if (analyserRef.current) {
                const bufferLength = analyserRef.current.frequencyBinCount;
                const dataArray = new Uint8Array(bufferLength);
                analyserRef.current.getByteFrequencyData(dataArray);

                let sum = 0;
                for (let i = 0; i < bufferLength; i++) {
                    sum += dataArray[i];
                }
                audioLevel = sum / bufferLength / 128; // Normalize to 0-2 range

                let bassSum = 0;
                const bassBins = Math.floor(bufferLength * 0.1);
                for (let i = 0; i < bassBins; i++) {
                    bassSum += dataArray[i];
                }
                bassLevel = (bassSum / bassBins / 255); // Normalize to 0-1 range
            }

            ctx.save();
            ctx.translate(canvas.width / 2, canvas.height / 2);
            ctx.rotate(time * 0.1);
            const scale = 1 + bassLevel * 0.1;
            ctx.scale(scale, scale);

            const layers = lowQ ? 2 : 3;
            for (let i = 0; i < layers; i++) {
                ctx.beginPath();
                const angle = time * 0.5 + i * Math.PI * 2 / 3;
                const x = Math.cos(angle) * 100;
                const y = Math.sin(angle) * 100;
                const radius = (canvas.width / 4) * (1 + audioLevel * 0.2);
                const grad = ctx.createRadialGradient(x, y, 0, x, y, radius);
                grad.addColorStop(0, `rgba(192, 132, 252, ${0.1 + bassLevel * 0.2})`);
                grad.addColorStop(1, `rgba(192, 132, 252, 0)`);
                ctx.fillStyle = grad;
                ctx.arc(x, y, radius, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.restore();

            const targetOrbs = lowQ ? 3 : 5;
            if (orbs.length > targetOrbs) { orbs.length = targetOrbs; }
            while (orbs.length < targetOrbs) { orbs.push(new Orb()); }
            orbs.forEach(orb => { orb.update(); orb.draw(); });

            for (let i = particles.length - 1; i >= 0; i--) {
                particles[i].update();
                particles[i].draw();
                if (particles[i].life <= 0) {
                    particles.splice(i, 1);
                }
            }
            if (particles.length > (lowQ ? 120 : 200)) {
                particles.splice(0, particles.length - (lowQ ? 120 : 200));
            }
            animationFrameId = requestAnimationFrame(animate);
        };

        const handleClick = (e: MouseEvent) => {
            const rect = canvas.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;

            for (let i = orbs.length - 1; i >= 0; i--) {
                const orb = orbs[i];
                const dist = Math.hypot(mouseX - orb.x, mouseY - orb.y);
                if (dist < orb.radius) {
                    orbs.splice(i, 1);
                    const burst = lowQ ? 25 : 50;
                    for (let j = 0; j < burst; j++) {
                        particles.push(new Particle(orb.x, orb.y, true));
                    }
                    setTimeout(() => orbs.push(new Orb()), 2000); // Respawn new orb
                    break;
                }
            }
        };
        
        const handleResize = () => setup();
        const onVisibility = () => {
            paused = document.hidden;
            if (!paused) animationFrameId = requestAnimationFrame(animate);
        };

        setup();
        animate();
        canvas.addEventListener('click', handleClick);
        window.addEventListener('resize', handleResize);
        document.addEventListener('visibilitychange', onVisibility);

        return () => {
            cancelAnimationFrame(animationFrameId);
            canvas.removeEventListener('click', handleClick);
            window.removeEventListener('resize', handleResize);
            document.removeEventListener('visibilitychange', onVisibility);
            if(ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
        };
    }, []);

    return null;
};
