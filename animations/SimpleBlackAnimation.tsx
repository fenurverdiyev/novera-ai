import React from 'react';
import type { ThemeAnimationProps } from './themes';

export const SimpleBlackAnimation: React.FC<ThemeAnimationProps> = ({ customColor }) => {
    return <div className="fixed top-0 left-0 w-full h-full -z-10" style={{ backgroundColor: customColor || '#0d0f19' }} />;
};
