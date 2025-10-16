// Live conversation audio utilities: initialize AudioWorklet modules and
// start/stop microphone capture with PCM frames posted from the worklet.

let audioCtx: AudioContext | null = null;
let ctxOwnedByService = false;
let mediaStream: MediaStream | null = null;
let mediaSource: MediaStreamAudioSourceNode | null = null;
let workletNode: AudioWorkletNode | null = null;
let silentGain: GainNode | null = null;
let modulesLoaded = false;
let subscriber: ((pcm: Float32Array) => void) | null = null;

export function onPcmData(cb: ((pcm: Float32Array) => void) | null) {
  subscriber = cb;
  if (workletNode) {
    workletNode.port.onmessage = (e) => subscriber?.(e.data as Float32Array);
  }
}

export async function initAudioWorklets(ctx: AudioContext): Promise<void> {
  if (!ctx) throw new Error('AudioContext is required');
  if (modulesLoaded) return;
  // Vite serves from /public as root
  await ctx.audioWorklet.addModule('/audio-processor.js');
  await ctx.audioWorklet.addModule('/pcm-processor.js');
  modulesLoaded = true;
}

type StartMicOpts = {
  processor?: 'audio-processor' | 'pcm-processor';
  onData?: (pcm: Float32Array) => void;
  context?: AudioContext; // optional external context
};

export async function startMic(opts: StartMicOpts = {}): Promise<void> {
  const { processor = 'pcm-processor', onData, context } = opts;

  if (!audioCtx) {
    if (context) {
      audioCtx = context;
      ctxOwnedByService = false;
    } else {
      audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      ctxOwnedByService = true;
    }
  }

  if (audioCtx.state === 'suspended') {
    try { await audioCtx.resume(); } catch {}
  }

  await initAudioWorklets(audioCtx);

  // Request microphone
  mediaStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      channelCount: 1,
      sampleRate: audioCtx.sampleRate,
    },
    video: false,
  });

  // Build audio graph: mic -> worklet -> silent gain -> destination (pull engine, muted)
  mediaSource = audioCtx.createMediaStreamSource(mediaStream);
  workletNode = new AudioWorkletNode(audioCtx, processor, { numberOfInputs: 1, numberOfOutputs: 1 });
  if (onData) onPcmData(onData); else onPcmData(subscriber);

  silentGain = audioCtx.createGain();
  silentGain.gain.value = 0; // keep graph alive without feedback

  mediaSource.connect(workletNode);
  workletNode.connect(silentGain);
  silentGain.connect(audioCtx.destination);
}

export async function stopMic(): Promise<void> {
  try {
    if (mediaSource) { mediaSource.disconnect(); }
    if (workletNode) { try { workletNode.disconnect(); } catch {} workletNode.port.onmessage = null; }
    if (silentGain) { try { silentGain.disconnect(); } catch {} }

    workletNode = null;
    mediaSource = null;
    silentGain = null;

    if (mediaStream) {
      mediaStream.getTracks().forEach(t => { try { t.stop(); } catch {} });
      mediaStream = null;
    }

    if (audioCtx && ctxOwnedByService) {
      try { await audioCtx.close(); } catch {}
      audioCtx = null;
      ctxOwnedByService = false;
      modulesLoaded = false; // will be reloaded on next start
    }
  } finally {
    // keep subscriber reference for next start unless explicitly changed
  }
}

export function isMicActive(): boolean {
  return !!(audioCtx && (audioCtx.state === 'running') && mediaStream);
}

export function getSampleRate(): number {
  try { return audioCtx?.sampleRate || 48000; } catch { return 48000; }
}
