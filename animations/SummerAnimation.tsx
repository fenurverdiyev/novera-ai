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
    depth: number; // 0.5..1 for parallax strength and scaling
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

interface Palm {
    x: number;
    baseY: number;
    height: number;
    lean: number;
    swayAmp: number;
    swaySpeed: number;
    depth: number;
}

interface Flora {
    x: number;
    y: number;
    vx: number;
    vy: number;
    size: number;
    hue: number;
    life: number;
    maxLife: number;
    depth: number;
}

export const SummerAnimation: React.FC<ThemeAnimationProps> = ({ analyserNode }) => {
    const canvasRef = React.useRef<HTMLCanvasElement>(null);
    const waves = React.useRef<Wave[]>([]).current;
    const clouds = React.useRef<Cloud[]>([]).current;
    const particles = React.useRef<Particle[]>([]).current;
    const time = React.useRef(0);
    const birds = React.useRef<Bird[]>([]).current;
    const mouse = React.useRef({ x: typeof window !== 'undefined' ? window.innerWidth / 2 : 0, y: typeof window !== 'undefined' ? window.innerHeight / 2 : 0 });
    const palms = React.useRef<Palm[]>([]).current;
    const flora = React.useRef<Flora[]>([]).current;

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
                    const depth = 0.5 + Math.random() * 0.5;
                    clouds.push({
                        x: Math.random() * canvas.width,
                        y: Math.random() * canvas.height * 0.35,
                        size: (Math.random() * 80 + 40) * depth,
                        speed: (Math.random() * 0.5 + 0.2) * depth,
                        opacity: Math.random() * 0.35 + 0.25,
                        depth,
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

            // Palms near shoreline
            if (palms.length === 0) {
                const sandHeight = Math.max(60, canvas.height * 0.12);
                const baseY = canvas.height - sandHeight + 6;
                const count = Math.max(3, Math.floor(canvas.width / 420));
                for (let i = 0; i < count; i++) {
                    const depth = 0.6 + Math.random() * 0.4;
                    palms.push({
                        x: canvas.width * (0.08 + Math.random() * 0.84),
                        baseY,
                        height: (120 + Math.random() * 100) * depth,
                        lean: (Math.random() * 40 - 20) * depth,
                        swayAmp: 0.15 + Math.random() * 0.25,
                        swaySpeed: 0.4 + Math.random() * 0.4,
                        depth,
                    });
                }
            }
        };
        window.addEventListener('resize', resizeCanvas);
        window.addEventListener('mousemove', onMouseMove);
        resizeCanvas();

        let animationFrameId: number;

        // Draw swaying palm silhouette with simple gradient
        const drawPalm = (p: Palm) => {
            const sway = Math.sin(time.current * p.swaySpeed + p.x * 0.002) * p.swayAmp;
            const parallaxX = (mouse.current.x - canvas.width / 2) * 0.015 * (p.depth - 0.5);
            const parallaxY = (mouse.current.y - canvas.height / 2) * 0.01 * (p.depth - 0.5);
            const baseX = p.x + parallaxX;
            const baseY = p.baseY + parallaxY;
            const topX = baseX + p.lean + sway * 20;
            const topY = baseY - p.height;

            const ctrlX = baseX + (p.lean * 0.6) + sway * 14;
            const ctrlY = baseY - p.height * 0.6;
            const width = Math.max(2, 6 * p.depth);
            const trunkGradient = ctx.createLinearGradient(baseX, baseY, topX, topY);
            trunkGradient.addColorStop(0, 'rgba(70,40,20,0.9)');
            trunkGradient.addColorStop(1, 'rgba(120,80,40,0.75)');

            ctx.save();
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.strokeStyle = trunkGradient;
            ctx.lineWidth = width;
            ctx.beginPath();
            ctx.moveTo(baseX, baseY);
            ctx.quadraticCurveTo(ctrlX, ctrlY, topX, topY);
            ctx.stroke();

            const leafCount = 6;
            for (let i = 0; i < leafCount; i++) {
                const a = (-Math.PI / 2) + (i - (leafCount - 1) / 2) * 0.35 + sway * 0.5;
                const len = 40 + p.height * 0.25;
                const tipX = topX + Math.cos(a) * len;
                const tipY = topY + Math.sin(a) * len;
                ctx.strokeStyle = `rgba(80, 200, 120, ${0.65 * p.depth})`;
                ctx.lineWidth = Math.max(1, 2.5 * p.depth);
                ctx.beginPath();
                ctx.moveTo(topX, topY);
                ctx.quadraticCurveTo(topX + Math.cos(a) * len * 0.4, topY + Math.sin(a) * len * 0.4, tipX, tipY);
                ctx.stroke();
            }
            ctx.restore();
        };

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
            const skyIntensity = 1 + audioLevel * 0.3;
            skyGradient.addColorStop(0, `hsl(200, 100%, ${Math.min(95, 85 * skyIntensity)}%)`);
            skyGradient.addColorStop(0.25, `hsl(210, 100%, ${Math.min(85, 75 * skyIntensity)}%)`);
            skyGradient.addColorStop(0.5, `hsl(200, 100%, ${Math.min(75, 65 * skyIntensity)}%)`);
            skyGradient.addColorStop(0.75, `hsl(205, 100%, ${Math.min(65, 55 * skyIntensity)}%)`);
            skyGradient.addColorStop(1, `hsl(210, 100%, ${Math.min(55, 45 * skyIntensity)}%)`);
            ctx.fillStyle = skyGradient;
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // Horizon haze near waterline
            {
                ctx.save();
                const haze = ctx.createLinearGradient(0, canvas.height * 0.45, 0, canvas.height * 0.8);
                haze.addColorStop(0, 'rgba(255,255,255,0)');
                haze.addColorStop(0.6, 'rgba(255,255,255,0.06)');
                haze.addColorStop(1, 'rgba(255,220,180,0.10)');
                ctx.fillStyle = haze;
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.restore();
            }

            // Subtle sand beach at the very bottom
            {
                ctx.save();
                const sandTop = canvas.height * 0.9;
                const sandGrad = ctx.createLinearGradient(0, sandTop, 0, canvas.height);
                sandGrad.addColorStop(0, 'rgba(206, 186, 140, 0.20)');
                sandGrad.addColorStop(1, 'rgba(194, 178, 128, 0.35)');
                ctx.fillStyle = sandGrad;
                ctx.fillRect(0, sandTop, canvas.width, canvas.height - sandTop);

                // Sparse speckles for texture (very lightweight)
                ctx.globalAlpha = 0.12;
                ctx.fillStyle = '#b49a6a';
                for (let i = 0; i < 24; i++) {
                    const sx = Math.random() * canvas.width;
                    const sy = sandTop + Math.random() * (canvas.height - sandTop);
                    ctx.beginPath();
                    ctx.arc(sx, sy, Math.random() * 1.2 + 0.4, 0, Math.PI * 2);
                    ctx.fill();
                }
                ctx.globalAlpha = 1;
                ctx.restore();
            }

            // Sun
            const sunX = canvas.width * 0.85;
            const sunY = canvas.height * 0.15;
            const sunRadius = 50 + audioLevel * 30;

            // Sun rays (audio-reactive)
            if (audioLevel > 0.1) {
                ctx.save();
                ctx.globalCompositeOperation = 'lighter';
                const rayCount = 12;
                const rayLength = sunRadius * (2 + audioLevel * 2);
                for (let i = 0; i < rayCount; i++) {
                    const angle = (i / rayCount) * Math.PI * 2 + time.current * 0.5;
                    const x1 = sunX + Math.cos(angle) * sunRadius * 1.2;
                    const y1 = sunY + Math.sin(angle) * sunRadius * 1.2;
                    const x2 = sunX + Math.cos(angle) * rayLength;
                    const y2 = sunY + Math.sin(angle) * rayLength;
                    
                    const rayGradient = ctx.createLinearGradient(x1, y1, x2, y2);
                    rayGradient.addColorStop(0, `rgba(255, 255, 100, ${audioLevel * 0.6})`);
                    rayGradient.addColorStop(1, 'rgba(255, 255, 100, 0)');
                    
                    ctx.strokeStyle = rayGradient;
                    ctx.lineWidth = 2 + audioLevel * 3;
                    ctx.beginPath();
                    ctx.moveTo(x1, y1);
                    ctx.lineTo(x2, y2);
                    ctx.stroke();
                }
                ctx.restore();
            }

            // Sun glow
            const sunGlow = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, sunRadius * 3);
            sunGlow.addColorStop(0, `rgba(255, 255, 100, ${0.8 + audioLevel * 0.3})`);
            sunGlow.addColorStop(0.3, `rgba(255, 200, 0, ${0.4 + audioLevel * 0.2})`);
            sunGlow.addColorStop(1, 'rgba(255, 150, 0, 0)');
            ctx.fillStyle = sunGlow;
            ctx.beginPath();
            ctx.arc(sunX, sunY, sunRadius * 3, 0, Math.PI * 2);
            ctx.fill();

            // Sun body
            const sunBody = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, sunRadius);
            sunBody.addColorStop(0, `hsl(60, 100%, ${Math.min(95, 85 + audioLevel * 15)}%)`);
            sunBody.addColorStop(0.7, `hsl(50, 100%, ${Math.min(85, 75 + audioLevel * 15)}%)`);
            sunBody.addColorStop(1, `hsl(40, 100%, ${Math.min(75, 65 + audioLevel * 15)}%)`);
            ctx.fillStyle = sunBody;
            ctx.beginPath();
            ctx.arc(sunX, sunY, sunRadius, 0, Math.PI * 2);
            ctx.fill();

            // Sun limb darkening for realism
            {
                ctx.save();
                ctx.globalCompositeOperation = 'multiply';
                const limb = ctx.createRadialGradient(sunX, sunY, sunRadius * 0.6, sunX, sunY, sunRadius);
                limb.addColorStop(0, 'rgba(0,0,0,0)');
                limb.addColorStop(0.75, 'rgba(0,0,0,0.05)');
                limb.addColorStop(1, 'rgba(0,0,0,0.12)');
                ctx.fillStyle = limb;
                ctx.beginPath();
                ctx.arc(sunX, sunY, sunRadius, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            }

            // Lens flare along vector to screen center (enhanced)
            {
                const toCenterX = canvas.width * 0.5;
                const toCenterY = canvas.height * 0.5;
                const dx = toCenterX - sunX;
                const dy = toCenterY - sunY;
                const steps = 5;
                ctx.save();
                ctx.globalCompositeOperation = 'screen';
                for (let i = 1; i <= steps; i++) {
                    const t = i / (steps + 1);
                    const fx = sunX + dx * t;
                    const fy = sunY + dy * t;
                    const r = sunRadius * (0.3 + (steps - i) * 0.2) * (1 + audioLevel * 0.5);
                    const flareGradient = ctx.createRadialGradient(fx, fy, 0, fx, fy, r);
                    const alpha = (0.3 * (1 - t) + audioLevel * 0.3) * (1 + Math.sin(time.current * 2 + i) * 0.2);
                    flareGradient.addColorStop(0, `rgba(255,255,200,${alpha})`);
                    flareGradient.addColorStop(0.5, `rgba(255,220,150,${alpha * 0.7})`);
                    flareGradient.addColorStop(1, 'rgba(255,200,100,0)');
                    ctx.fillStyle = flareGradient;
                    ctx.beginPath();
                    ctx.arc(fx, fy, r, 0, Math.PI * 2);
                    ctx.fill();
                }
                ctx.restore();
            }

            // Enhanced sun corona effect
            if (audioLevel > 0.2) {
                ctx.save();
                ctx.globalCompositeOperation = 'lighter';
                const coronaRadius = sunRadius * (2.5 + audioLevel * 1.5);
                const coronaGradient = ctx.createRadialGradient(sunX, sunY, sunRadius, sunX, sunY, coronaRadius);
                coronaGradient.addColorStop(0, `rgba(255, 255, 150, ${audioLevel * 0.4})`);
                coronaGradient.addColorStop(0.5, `rgba(255, 200, 100, ${audioLevel * 0.2})`);
                coronaGradient.addColorStop(1, 'rgba(255, 150, 50, 0)');
                ctx.fillStyle = coronaGradient;
                ctx.beginPath();
                ctx.arc(sunX, sunY, coronaRadius, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            }

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

            // Update and draw clouds (with parallax)
            clouds.forEach(cloud => {
                cloud.x += cloud.speed;
                if (cloud.x > canvas.width + cloud.size) {
                    cloud.x = -cloud.size;
                }

                const parallaxX = (mouse.current.x - canvas.width / 2) * 0.02 * (cloud.depth - 0.5);
                const parallaxY = (mouse.current.y - canvas.height / 2) * 0.01 * (cloud.depth - 0.5);
                const cx = cloud.x + parallaxX;
                const cy = cloud.y + parallaxY;

                // Cloud shadow
                ctx.fillStyle = `rgba(200, 200, 200, ${cloud.opacity * 0.3})`;
                for (let i = 0; i < 5; i++) {
                    ctx.beginPath();
                    ctx.arc(
                        cx + i * cloud.size * 0.3 + 2,
                        cy + i * cloud.size * 0.1 + 2,
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
                        cx + i * cloud.size * 0.3,
                        cy + i * cloud.size * 0.1,
                        cloud.size * (0.3 + i * 0.1),
                        0, Math.PI * 2
                    );
                    ctx.fill();
                }
            });

            // Palms (draw after clouds, before waves)
            palms.forEach(drawPalm);

            // Create sparkles
            if (Math.random() < 0.1 + audioLevel * 0.3) {
                createParticle(
                    Math.random() * canvas.width,
                    canvas.height * 0.5 + Math.random() * canvas.height * 0.3
                );
            }

            // Update and draw waves
            waves.forEach((wave, index) => {
                wave.phase += wave.speed + audioLevel * 0.02;
                
                ctx.beginPath();
                ctx.moveTo(0, wave.y);

                for (let x = 0; x <= canvas.width; x += 6) {
                    const par = Math.sin((x * 0.004) + time.current * (0.4 + index * 0.1)) * (index * 2 + audioLevel * 3);
                    const waveHeight = Math.sin(x * wave.frequency + wave.phase) * 
                                     (wave.amplitude + audioLevel * 40);
                    const y = wave.y + waveHeight + par;
                    ctx.lineTo(x, y);
                }

                ctx.lineTo(canvas.width, canvas.height);
                ctx.lineTo(0, canvas.height);
                ctx.closePath();

                const alpha = (0.6 - index * 0.1) + audioLevel * 0.2;
                const waveGradient = ctx.createLinearGradient(0, wave.y - 50, 0, canvas.height);
                waveGradient.addColorStop(0, `hsla(175, 75%, ${70 + audioLevel * 10}%, ${alpha})`);
                waveGradient.addColorStop(0.5, `hsla(175, 65%, ${60 + audioLevel * 10}%, ${alpha})`);
                waveGradient.addColorStop(1, `hsla(175, 55%, ${50 + audioLevel * 10}%, ${alpha})`);
                ctx.fillStyle = waveGradient;
                ctx.fill();

                // Wave foam
                ctx.beginPath();
                ctx.moveTo(0, wave.y);
                for (let x = 0; x <= canvas.width; x += 6) {
                    const par = Math.sin((x * 0.004) + time.current * (0.4 + index * 0.1)) * (index * 2 + audioLevel * 3);
                    const waveHeight = Math.sin(x * wave.frequency + wave.phase) * 
                                     (wave.amplitude + audioLevel * 40);
                    const y = wave.y + waveHeight + par;
                    ctx.lineTo(x, y);
                }
                ctx.strokeStyle = `rgba(255, 255, 255, ${0.8 + audioLevel * 0.3})`;
                ctx.lineWidth = 2 + audioLevel * 2;
                ctx.stroke();

                // Specular highlights along crests
                if (audioLevel > 0.05) {
                    ctx.save();
                    ctx.globalCompositeOperation = 'lighter';
                    for (let gx = 30; gx < canvas.width; gx += 120) {
                        const x = gx + ((time.current * 20 + index * 15) % 40) - 20;
                        const par = Math.sin((x * 0.004) + time.current * (0.4 + index * 0.1)) * (index * 2 + audioLevel * 3);
                        const waveHeight = Math.sin(x * wave.frequency + wave.phase) * (wave.amplitude + audioLevel * 40);
                        const y = wave.y + waveHeight + par;
                        ctx.strokeStyle = `rgba(255, 255, 220, ${0.25 + audioLevel * 0.25})`;
                        ctx.lineWidth = 1 + audioLevel * 1.5;
                        ctx.beginPath();
                        ctx.moveTo(x - 6, y);
                        ctx.lineTo(x + 6, y);
                        ctx.stroke();
                    }
                    ctx.restore();
                }
            });

            // Water caustics overlay (lightweight sine bands)
            {
                ctx.save();
                ctx.globalCompositeOperation = 'screen';
                const bandAlpha = 0.05 + audioLevel * 0.06;
                const yStart = canvas.height * 0.56;
                const yEnd = canvas.height * 0.88;
                for (let y = yStart; y < yEnd; y += 14) {
                    ctx.beginPath();
                    for (let x = 0; x <= canvas.width; x += 16) {
                        const offset = Math.sin((x * 0.015) + time.current * 0.9) * 6 + Math.sin((y * 0.03) + time.current * 0.7) * 4;
                        if (x === 0) ctx.moveTo(x, y + offset);
                        else ctx.lineTo(x, y + offset);
                    }
                    ctx.strokeStyle = `rgba(255, 245, 200, ${bandAlpha})`;
                    ctx.lineWidth = 0.8;
                    ctx.stroke();
                }
                ctx.restore();
            }

            // Sun reflection glint on water
            {
                ctx.save();
                ctx.globalCompositeOperation = 'screen';
                const sigma = Math.max(40, canvas.width * 0.08);
                for (let x = 0; x <= canvas.width; x += 4) {
                    const dx = x - sunX;
                    const weight = Math.exp(-(dx * dx) / (2 * sigma * sigma));
                    if (weight < 0.02) continue;
                    let yRef = 0; let set = false;
                    for (let index = 0; index < waves.length; index++) {
                        const w = waves[index];
                        const par = Math.sin((x * 0.004) + time.current * (0.4 + index * 0.1)) * (index * 2 + audioLevel * 3);
                        const waveHeight = Math.sin(x * w.frequency + w.phase) * 
                                        (w.amplitude + audioLevel * 40);
                        const y = w.y + waveHeight + par;
                        if (!set || y < yRef) { yRef = y; set = true; }
                    }
                    const len = 6 + weight * 28 + audioLevel * 20;
                    const alpha = 0.07 + weight * 0.35 + audioLevel * 0.18;
                    ctx.strokeStyle = `rgba(255, 245, 200, ${alpha})`;
                    ctx.lineWidth = 1 + Math.min(3, 0.5 + weight * 3 + audioLevel * 1.5);
                    ctx.beginPath();
                    ctx.moveTo(x, yRef - len * 0.25);
                    ctx.lineTo(x, yRef + len * 0.75);
                    ctx.stroke();
                }
                ctx.restore();
            }

            // Tropical flora particles (gentle floating petals)
            if (Math.random() < 0.06 + audioLevel * 0.08) {
                const depth = 0.6 + Math.random() * 0.4;
                flora.push({
                    x: Math.random() * canvas.width,
                    y: canvas.height * (0.55 + Math.random() * 0.35),
                    vx: (Math.random() - 0.5) * 0.6,
                    vy: -0.2 - Math.random() * 0.4,
                    size: 2 + Math.random() * 3,
                    hue: [330, 350, 20, 300][Math.floor(Math.random() * 4)],
                    life: 120,
                    maxLife: 120,
                    depth,
                });
            }
            for (let i = flora.length - 1; i >= 0; i--) {
                const f = flora[i];
                f.x += f.vx;
                f.y += f.vy;
                f.vx += Math.sin(time.current * 0.1 + i) * 0.002;
                f.life--;
                if (f.life <= 0) { flora.splice(i, 1); continue; }
                const alpha = (f.life / f.maxLife) * (0.5 + 0.5 * f.depth);
                ctx.save();
                ctx.globalCompositeOperation = 'lighter';
                const grad = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.size * 2.2);
                grad.addColorStop(0, `hsla(${f.hue}, 90%, 70%, ${alpha})`);
                grad.addColorStop(1, `hsla(${f.hue}, 90%, 70%, 0)`);
                ctx.fillStyle = grad;
                ctx.beginPath();
                ctx.arc(f.x, f.y, f.size * (1 + audioLevel * 0.4), 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            }
            if (flora.length > 80) flora.splice(0, flora.length - 80);

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
            window.removeEventListener('mousemove', onMouseMove);
            cancelAnimationFrame(animationFrameId);
        };
    }, [analyserNode, waves, clouds, particles, time, palms, flora]);

    return <canvas ref={canvasRef} className="fixed top-0 left-0 w-full h-full -z-10" />;
};
