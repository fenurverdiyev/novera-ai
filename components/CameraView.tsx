import React, { useRef, useEffect, useCallback } from 'react';

interface CameraViewProps {
  onFrame: (blob: Blob | null) => void;
  facingMode: 'user' | 'environment';
}

const FRAME_RATE = 2; // Send 2 frames per second
const JPEG_QUALITY = 0.7;

export const CameraView: React.FC<CameraViewProps> = ({ onFrame, facingMode }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameIntervalRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const captureFrame = useCallback(() => {
    if (videoRef.current && canvasRef.current && videoRef.current.readyState >= 2) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');
      if (context) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        context.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);
        canvas.toBlob((blob) => {
          onFrame(blob);
        }, 'image/jpeg', JPEG_QUALITY);
      }
    }
  }, [onFrame]);

  useEffect(() => {
    // Function to stop existing stream and interval
    const cleanupCamera = () => {
      if (frameIntervalRef.current) {
        clearInterval(frameIntervalRef.current);
        frameIntervalRef.current = null;
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    };

    async function setupCamera() {
      // Clean up previous camera before setting up new one
      cleanupCamera();

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode },
          audio: false,
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => {
            try { videoRef.current?.play().catch(() => {}); } catch {}
            frameIntervalRef.current = window.setInterval(captureFrame, 1000 / FRAME_RATE);
          };
        }
      } catch (err) {
        console.error('Error accessing camera: ', err);
        try { alert(`Could not access the ${facingMode} camera. Please check permissions.`); } catch {}
        onFrame(null);
      }
    }

    setupCamera();

    // Return a cleanup function that runs when component unmounts or facingMode changes
    return cleanupCamera;
  }, [captureFrame, facingMode, onFrame]);

  return (
    <div className="absolute inset-0 w-full h-full flex items-center justify-center p-1">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="w-full h-full object-cover rounded-[2.25rem] transition-all duration-500 ease-in-out"
        style={{ transform: facingMode === 'user' ? 'scaleX(-1)' : 'scaleX(1)' }}
      ></video>
      <canvas ref={canvasRef} className="hidden"></canvas>
    </div>
  );
};
