import React from 'react';
import type { ThemeAnimationProps } from './themes';

interface Wave {
    x: number;
    y: number;
    amplitude: number;
    frequency: number;
    phase: number;
    speed: number;
}

interface Cloud {
    x: number;
    y: number;
    size: number;
    speed: number;
    opacity: number;
}

interface Particle {
    x: number;
    y: number;
    vx: number;
    vy: number;
    size: number;
    hue: number;
    life: number;
    maxLife: number;
}

interface Bird {
    x: number;
    y: number;
    vx: number;
    flap: number;
    size: number;
}

export const SummerAnimation: React.FC<ThemeAnimationProps> = ({ analyserNode }) => {
    const canvasRef = React.useRef<HTMLCanvasElement>(null);
    const waves = React.useRef<Wave[]>([]).current;
    const clouds = React.useRef<Cloud[]>([]).current;
    const particles = React.useRef<Particle[]>([]).current;
    const time = React.useRef(0);
    const birds = React.useRef<Bird[]>([]).current;

    React.useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const resizeCanvas = () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
            
            if (waves.length === 0) {
                for (let i = 0; i < 5; i++) {
                    waves.push({
                        x: 0,
                        y: canvas.height * 0.6 + i * 30,
                        amplitude: 25 + i * 8,
                        frequency: 0.006 + i * 0.002,
                        phase: i * Math.PI / 3,
                        speed: 0.015 + i * 0.005,
                    });
                }
            }
            
            if (clouds.length === 0) {
                for (let i = 0; i < 6; i++) {
                    clouds.push({
                        x: Math.random() * canvas.width,
                        y: Math.random() * canvas.height * 0.4,
                        size: Math.random() * 80 + 40,
                        speed: Math.random() * 0.5 + 0.2,
                        opacity: Math.random() * 0.4 + 0.3,
                    });
                }
            }

            if (birds.length === 0) {
                const count = Math.max(8, Math.floor(canvas.width / 180));
                for (let i = 0; i < count; i++) {
                    birds.push({
                        x: Math.random() * canvas.width,
                        y: 40 + Math.random() * canvas.height * 0.35,
                        vx: 0.6 + Math.random() * 1.2,
                        flap: Math.random() * Math.PI * 2,
                        size: 6 + Math.random() * 6,
                    });
                }
            }
        };
        window.addEventListener('resize', resizeCanvas);
        resizeCanvas();

        let animationFrameId: number;

        const createParticle = (x: number, y: number) => {
            particles.push({
                x,
                y,
                vx: (Math.random() - 0.5) * 3,
                vy: -Math.random() * 2 - 1,
                size: Math.random() * 4 + 2,
                hue: 45 + Math.random() * 15,
                life: 80,
                maxLife: 80,
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

            time.current += 0.02;

            // Sky gradient
            const skyGradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
            skyGradient.addColorStop(0, '#87ceeb');
            skyGradient.addColorStop(0.3, '#b0e0e6');
            skyGradient.addColorStop(0.6, '#40e0d0');
            skyGradient.addColorStop(0.8, '#20b2aa');
            skyGradient.addColorStop(1, '#008b8b');
            ctx.fillStyle = skyGradient;
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // Sun
            const sunX = canvas.width * 0.85;
            const sunY = canvas.height * 0.15;
            const sunRadius = 50 + audioLevel * 20;

            // Sun glow
            const sunGlow = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, sunRadius * 3);
            sunGlow.addColorStop(0, 'rgba(255, 255, 100, 0.8)');
            sunGlow.addColorStop(0.3, 'rgba(255, 200, 0, 0.4)');
            sunGlow.addColorStop(1, 'rgba(255, 150, 0, 0)');
            ctx.fillStyle = sunGlow;
            ctx.beginPath();
            ctx.arc(sunX, sunY, sunRadius * 3, 0, Math.PI * 2);
            ctx.fill();

            // Sun body
            const sunBody = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, sunRadius);
            sunBody.addColorStop(0, '#ffff99');
            sunBody.addColorStop(0.7, '#ffcc00');
            sunBody.addColorStop(1, '#ff9900');
            ctx.fillStyle = sunBody;
            ctx.beginPath();
            ctx.arc(sunX, sunY, sunRadius, 0, Math.PI * 2);
            ctx.fill();

            // Birds (simple V-shape)
            birds.forEach(b => {
                b.x += b.vx;
                b.flap += 0.2;
                const amp = Math.sin(b.flap) * (b.size * 0.25);
                if (b.x - b.size > canvas.width) {
                    b.x = -20;
                    b.y = 40 + Math.random() * canvas.height * 0.35;
                    b.vx = 0.6 + Math.random() * 1.2;
                }
                ctx.strokeStyle = 'rgba(255,255,255,0.8)';
                ctx.lineWidth = 1.2;
                ctx.beginPath();
                ctx.moveTo(b.x - b.size, b.y);
                ctx.quadraticCurveTo(b.x, b.y - amp, b.x + b.size, b.y);
                ctx.stroke();
            });

            // Update and draw clouds
            clouds.forEach(cloud => {
                cloud.x += cloud.speed;
                if (cloud.x > canvas.width + cloud.size) {
                    cloud.x = -cloud.size;
                }

                // Cloud shadow
                ctx.fillStyle = `rgba(200, 200, 200, ${cloud.opacity * 0.3})`;
                for (let i = 0; i < 5; i++) {
                    ctx.beginPath();
                    ctx.arc(
                        cloud.x + i * cloud.size * 0.3 + 2,
                        cloud.y + i * cloud.size * 0.1 + 2,
                        cloud.size * (0.3 + i * 0.1),
                        0, Math.PI * 2
                    );
                    ctx.fill();
                }

                // Cloud body
                ctx.fillStyle = `rgba(255, 255, 255, ${cloud.opacity})`;
                for (let i = 0; i < 5; i++) {
                    ctx.beginPath();
                    ctx.arc(
                        cloud.x + i * cloud.size * 0.3,
                        cloud.y + i * cloud.size * 0.1,
                        cloud.size * (0.3 + i * 0.1),
                        0, Math.PI * 2
                    );
                    ctx.fill();
                }
            });

            // Create sparkles
            if (Math.random() < 0.1 + audioLevel * 0.3) {
                createParticle(
                    Math.random() * canvas.width,
                    canvas.height * 0.5 + Math.random() * canvas.height * 0.3
                );
            }

            // Update and draw waves
            waves.forEach((wave, index) => {
                wave.phase += wave.speed + audioLevel * 0.01;
                
                ctx.beginPath();
                ctx.moveTo(0, wave.y);

                for (let x = 0; x <= canvas.width; x += 6) {
                    const waveHeight = Math.sin(x * wave.frequency + wave.phase) * 
                                     (wave.amplitude + audioLevel * 30);
                    const y = wave.y + waveHeight;
                    ctx.lineTo(x, y);
                }

                ctx.lineTo(canvas.width, canvas.height);
                ctx.lineTo(0, canvas.height);
                ctx.closePath();

                const alpha = 0.6 - index * 0.1;
                const waveGradient = ctx.createLinearGradient(0, wave.y - 50, 0, canvas.height);
                waveGradient.addColorStop(0, `rgba(64, 224, 208, ${alpha})`);
                waveGradient.addColorStop(0.5, `rgba(32, 178, 170, ${alpha})`);
                waveGradient.addColorStop(1, `rgba(0, 139, 139, ${alpha})`);
                ctx.fillStyle = waveGradient;
                ctx.fill();

                // Wave foam
                ctx.beginPath();
                ctx.moveTo(0, wave.y);
                for (let x = 0; x <= canvas.width; x += 6) {
                    const waveHeight = Math.sin(x * wave.frequency + wave.phase) * 
                                     (wave.amplitude + audioLevel * 30);
                    const y = wave.y + waveHeight;
                    ctx.lineTo(x, y);
                }
                ctx.strokeStyle = `rgba(255, 255, 255, ${0.8 + audioLevel * 0.2})`;
                ctx.lineWidth = 2;
                ctx.stroke();
            });

            // Sandy shoreline at bottom
            const sandHeight = Math.max(60, canvas.height * 0.12);
            const sandGradient = ctx.createLinearGradient(0, canvas.height - sandHeight, 0, canvas.height);
            sandGradient.addColorStop(0, 'rgba(238, 214, 175, 0.85)');
            sandGradient.addColorStop(1, 'rgba(210, 180, 140, 0.95)');
            ctx.fillStyle = sandGradient;
            ctx.fillRect(0, canvas.height - sandHeight, canvas.width, sandHeight);

            // Update and draw sparkles
            for (let i = particles.length - 1; i >= 0; i--) {
                const particle = particles[i];
                
                particle.x += particle.vx;
                particle.y += particle.vy;
                particle.vy += 0.05;
                particle.life--;

                if (particle.life <= 0) {
                    particles.splice(i, 1);
                    continue;
                }

                const alpha = particle.life / particle.maxLife;
                
                // Sparkle body
                ctx.beginPath();
                ctx.arc(particle.x, particle.y, particle.size * alpha, 0, Math.PI * 2);
                ctx.fillStyle = `hsla(${particle.hue}, 100%, 80%, ${alpha})`;
                ctx.fill();

                // Sparkle cross
                ctx.beginPath();
                ctx.moveTo(particle.x - particle.size * 2, particle.y);
                ctx.lineTo(particle.x + particle.size * 2, particle.y);
                ctx.moveTo(particle.x, particle.y - particle.size * 2);
                ctx.lineTo(particle.x, particle.y + particle.size * 2);
                ctx.strokeStyle = `hsla(${particle.hue}, 100%, 90%, ${alpha * 0.8})`;
                ctx.lineWidth = 1;
                ctx.stroke();
            }

            if (particles.length > 60) {
                particles.splice(0, particles.length - 60);
            }

            animationFrameId = requestAnimationFrame(animate);
        };
        animate();

        return () => {
            window.removeEventListener('resize', resizeCanvas);
            cancelAnimationFrame(animationFrameId);
        };
    }, [analyserNode, waves, clouds, particles, time]);

    return <canvas ref={canvasRef} className="fixed top-0 left-0 w-full h-full -z-10" />;
};
