
import React, { useState, useEffect } from 'react';
import { WifiIcon, SignalIcon, BatteryIcon } from './Icons';

export const StatusBar: React.FC = () => {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timerId = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timerId);
  }, []);

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: false,
    });
  };

  return (
    <div className="absolute top-0 left-0 right-0 z-10 flex justify-between items-center px-6 pt-4 text-sm font-semibold text-white">
      <span>{formatTime(time)}</span>
      <div className="flex items-center space-x-1">
        <SignalIcon className="w-4 h-4" />
        <WifiIcon className="w-4 h-4" />
        <BatteryIcon className="w-5 h-5" />
      </div>
    </div>
  );
};
