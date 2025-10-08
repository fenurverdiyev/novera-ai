import React from 'react';

interface OrbProps {
  status: 'idle' | 'connecting' | 'listening' | 'processing' | 'speaking';
  isCameraOn: boolean;
}

export const Orb: React.FC<OrbProps> = ({ status, isCameraOn }) => {
  const getStatusClasses = () => {
    switch (status) {
      case 'listening':
        return 'from-red-500/80 to-orange-400/80 shadow-red-500/50';
      case 'processing':
      case 'connecting':
        return 'from-cyan-400/80 to-purple-500/80 shadow-purple-500/50';
      case 'speaking':
        return 'from-green-400/80 to-cyan-400/80 shadow-green-400/50';
      case 'idle':
      default:
        return 'from-purple-600/80 to-indigo-500/80 shadow-indigo-500/40';
    }
  };

  const statusGlow = getStatusClasses();
  const shapeClasses = isCameraOn ? 'rounded-[2.5rem]' : 'rounded-full';

  return (
    <div className="absolute inset-0 w-full h-full pointer-events-none">
      <style>{`
        @keyframes pulse-gentle {
          0%, 100% { transform: scale(1); opacity: 0.8; }
          50% { transform: scale(1.03); opacity: 1; }
        }
        @keyframes pulse-strong {
          0%, 100% { transform: scale(1); opacity: 0.9; }
          50% { transform: scale(1.08); opacity: 1; }
        }
        @keyframes spin-slow {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes spin-reverse {
          from { transform: rotate(360deg); }
          to { transform: rotate(0deg); }
        }
      `}</style>

      {/* Background Glow */}
      <div className={`absolute inset-0 bg-gradient-radial ${statusGlow} ${shapeClasses} opacity-90 transition-all duration-500 ease-in-out shadow-[0_0_60px_rgba(0,0,0,0.6)] blur-xl animate-[pulse-gentle_8s_infinite]`} />

      {/* Main Orb / Camera Frame */}
      <div className={`absolute inset-0 border-2 border-white/10 ${shapeClasses} transition-all duration-500 ease-in-out ${isCameraOn ? 'bg-transparent' : 'bg-black/30' }`} />

      {/* Animated Rings */}
      <div 
        className={`absolute inset-[-8px] ${shapeClasses} border-t-2 border-cyan-300/90 border-l-2 border-cyan-300/90 border-b-2 border-cyan-300/30 border-r-2 border-cyan-300/30 animate-[spin-slow_20s_linear_infinite] ${status === 'processing' || status === 'connecting' ? 'opacity-100' : 'opacity-60' } transition-all duration-500`}
      />
      <div 
        className={`absolute inset-[-16px] ${shapeClasses} border-b-2 border-purple-400/90 border-r-2 border-purple-400/90 border-t-2 border-purple-400/30 border-l-2 border-purple-400/30 animate-[spin-reverse_15s_linear_infinite] ${status === 'processing' || status === 'connecting' ? 'opacity-100' : 'opacity-60' } transition-all duration-500`}
      />
      <div 
        className={`absolute inset-0 ${shapeClasses} transition-all duration-300 ease-in-out ${status === 'listening' ? 'animate-[pulse-strong_1.5s_infinite] shadow-[0_0_40px] shadow-red-500/80 border-2 border-red-400' : 'border-transparent'}`}
      />
      <div 
        className={`absolute inset-0 ${shapeClasses} transition-all duration-300 ease-in-out ${status === 'speaking' ? 'animate-[pulse_2s_infinite] shadow-[0_0_50px] shadow-cyan-400/80 border-2 border-cyan-300' : 'border-transparent'}`}
      />
    </div>
  );
};
