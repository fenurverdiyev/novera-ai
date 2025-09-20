import React from 'react';
import { SpaceAnimation } from './SpaceAnimation';
import { NatureAnimation } from './NatureAnimation';
import { NebulaAnimation } from './NebulaAnimation';
import { AutumnLeavesAnimation } from './AutumnLeavesAnimation';
import { DigitalRainAnimation } from './DigitalRainAnimation';
import { CampfireAnimation } from './CampfireAnimation';
import { AudioOrbitalsAnimation } from './AudioOrbitalsAnimation';
import { WarpSpeedAnimation } from './WarpSpeedAnimation';
import { SnowStormAnimation } from './SnowStormAnimation';
import { SummerAnimation } from './SummerAnimation';
import { ElectricCurrentAnimation } from './ElectricCurrentAnimation';
import { SimpleBlackAnimation } from './SimpleBlackAnimation';
import { RainyWindowAnimation } from './RainyWindowAnimation';

export interface ThemeAnimationProps {
    scrollOffset?: number;
    analyserNode?: AnalyserNode | null;
}

interface Theme {
    id: string;
    name: string;
    description: string;
    colors: string[];
    animation: React.FC<ThemeAnimationProps>;
}

export const THEMES: Theme[] = [
    { 
        id: 'novera', 
        name: 'NovEra',
        description: 'Sadə qara fon ilə minimal və təmiz görünüş.',
        colors: ['#0d0f19', '#1b2026', '#2196f3'],
        animation: SimpleBlackAnimation,
    },
    { 
        id: 'terra', 
        name: 'Terra', 
        description: 'Ekranın kənarları boyunca zərif şəkildə böyüyən və kursorunuza reaksiya verən canlı sarmaşıqlarla təbiəti hiss edin.',
        colors: ['#0d0f19', '#1b2026', '#6ee7b7'],
        animation: NatureAnimation,
    },
    { 
        id: 'nebula', 
        name: 'Nebula', 
        description: 'Səslə canlanan, musiqiyə və səsə reaksiya verən interaktiv bir dumanlığa qərq olun. Ulduz tozuna çevirmək üçün kürələrə toxunun.',
        colors: ['#0d0f19', '#1b2026', '#c084fc'],
        animation: NebulaAnimation,
    },
    {
        id: 'rainstorm',
        name: 'İldırımlı Yağış',
        description: 'Şimşək çaxması və yağış damcıları ilə dinamik fırtına səhnəsi.',
        colors: ['#0d0f19', '#1b2026', '#60a5fa'],
        animation: RainyWindowAnimation,
    },
    {
        id: 'matrix',
        name: 'Rəqəmsal Yağış',
        description: 'Səsə və siçan hərəkətinə reaksiya verən klassik rəqəmsal yağışla kiber aləmə daxil olun.',
        colors: ['#0d0f19', '#1b2026', '#34d399'],
        animation: DigitalRainAnimation,
    },
    {
        id: 'fireflies',
        name: 'Atəşböcəyi Çəmənliyi',
        description: 'Səsə və siçan hərəkətinə reaksiya verən parıldayan atəşböcəkləri ilə dolu sehrli bir çəmənlik.',
        colors: ['#0d0f19', '#1b2026', '#b0c853'],
        animation: AutumnLeavesAnimation,
    },
    {
        id: 'campfire',
        name: 'Tonqal',
        description: 'Səsə reaksiya verən qığılcımlar və parlayan atəşböcəkləri ilə rahat bir tonqal səhnəsi.',
        colors: ['#0d0f19', '#1b2026', '#FDB813'],
        animation: CampfireAnimation,
    },
    {
        id: 'orbitals',
        name: 'Səs Orbitləri',
        description: 'Sürəti, rəngi və məsafəsi səsin təsiri ilə dəyişən, mərkəz ətrafında fırlanan kürələr.',
        colors: ['#0d0f19', '#1b2026', '#4dd0e1'],
        animation: AudioOrbitalsAnimation,
    },
    {
        id: 'warpspeed',
        name: 'Varp Sürəti',
        description: 'Səsə və siçan hərəkətinə reaksiya verən ulduz zolaqları ilə kosmosda sürətli səyahət.',
        colors: ['#0d0f19', '#1b2026', '#818cf8'],
        animation: WarpSpeedAnimation,
    },
    {
        id: 'snowstorm',
        name: 'Qar Fırtınası',
        description: 'Səsə reaksiya verən qar dənələri və küləklə soyuq qış mənzərəsi.',
        colors: ['#0d0f19', '#1b2026', '#e2e8f0'],
        animation: SnowStormAnimation,
    },
    {
        id: 'summer',
        name: 'Yay',
        description: 'Səsə reaksiya verən günəş şüaları və isti yay mənzərəsi.',
        colors: ['#0d0f19', '#1b2026', '#f59e0b'],
        animation: SummerAnimation,
    },
    {
        id: 'electric',
        name: 'Elektrik Cərəyanı',
        description: 'Səsə reaksiya verən elektrik şimşəkləri və enerji dalğaları.',
        colors: ['#0d0f19', '#1b2026', '#fbbf24'],
        animation: ElectricCurrentAnimation,
    },
    {
        id: 'space',
        name: 'Kosmos',
        description: 'Dərin, çoxqatlı parallaks effekti ilə kosmosda səyahət edin. Fəaliyyətsiz qaldıqda gizli bürcləri kəşf edin.',
        colors: ['#0d0f19', '#1b2026', '#2196f3'],
        animation: SpaceAnimation,
    },
];
