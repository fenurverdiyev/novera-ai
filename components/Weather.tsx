import React, { useEffect, useRef, useState } from 'react';
import { getWeatherByCityName, getWeatherByLocationKey, searchCityAutocomplete, getTopCities, convertToAccuFormat, type AccuCitySuggestion } from '../services/accuWeatherService';
import type { WeatherData } from '../types';
import { LoadingSpinner, SearchIcon, AlertTriangleIcon, WeatherIcon as WeatherIconComponent, SunriseIcon, SunsetIcon, MoonIcon, AirQualityIcon, EyeIcon, SunMediumIcon, WindIcon, SunIcon } from './Icons';

import sunIcon from '../assets/weather/sun.png';
import cloudIcon from '../assets/weather/cloud.png';
import rainIcon from '../assets/weather/rain.png';
import snowIcon from '../assets/weather/snow.png';
import stormIcon from '../assets/weather/storm.png';
import partlyCloudyIcon from '../assets/weather/partly_cloudy.png';
import moonIcon from '../assets/weather/moon.png';
import cloudyNightIcon from '../assets/weather/cloudy_night.png';
import partlyCloudyNightIcon from '../assets/weather/partly_cloudy_night.png';
import rainyNightIcon from '../assets/weather/rainy_night.png';
import snowyNightIcon from '../assets/weather/snowy_night.png';

// 3D Icon Mapping
const get3DIconUrl = (code: number): string => {
    // AccuWeather Icon ID Mapping to local assets
    // See: https://developer.accuweather.com/weather-icons

    // Day Icons
    // Sun: 1-5, 30, 31
    if ([1, 2, 3, 4, 5, 30, 31].includes(code)) return sunIcon;

    // Partly Cloudy: 6, 20, 21
    if ([6, 20, 21].includes(code)) return partlyCloudyIcon;

    // Cloud: 7, 8, 11, 19, 32
    if ([7, 8, 11, 19, 32].includes(code)) return cloudIcon;

    // Rain: 12, 13, 14, 18, 26, 29, 39, 40
    if ([12, 13, 14, 18, 26, 29, 39, 40].includes(code)) return rainIcon;

    // Storm: 15, 16, 17, 41, 42
    if ([15, 16, 17, 41, 42].includes(code)) return stormIcon;

    // Snow: 22, 23, 24, 25, 43, 44
    if ([22, 23, 24, 25, 43, 44].includes(code)) return snowIcon;

    // Night Icons
    // Clear/Mostly Clear Night: 33, 34
    if ([33, 34].includes(code)) return moonIcon;

    // Partly Cloudy Night: 35, 36
    if ([35, 36].includes(code)) return partlyCloudyNightIcon;

    // Cloudy Night: 37, 38
    if ([37, 38].includes(code)) return cloudyNightIcon;

    // Rainy Night: 39, 40
    if ([39, 40].includes(code)) return rainyNightIcon;

    // Snowy Night: 43, 44
    if ([43, 44].includes(code)) return snowyNightIcon;

    // Default fallback
    return sunIcon;
};

export const Weather: React.FC = () => {
    const [weather, setWeather] = useState<WeatherData | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [location, setLocation] = useState('');
    const [suggestions, setSuggestions] = useState<AccuCitySuggestion[]>([]);
    const [loadingSuggestions, setLoadingSuggestions] = useState(false);
    const [showDropdown, setShowDropdown] = useState(false);
    const blurTimeout = useRef<number | null>(null);

    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!location.trim()) return;

        setLoading(true);
        setError(null);
        setWeather(null);
        try {
            const weatherData = await getWeatherByCityName(location);
            setWeather(weatherData);
        } catch (e: any) {
            setError(e.message || `"${location}" üçün hava məlumatı tapılmadı.`);
        } finally {
            setLoading(false);
        }
    };

    const handleSelectSuggestion = async (s: AccuCitySuggestion) => {
        setShowDropdown(false);
        setLocation(`${s.LocalizedName}${s.AdministrativeArea ? ', ' + s.AdministrativeArea.LocalizedName : ''}, ${s.Country.LocalizedName}`);
        setLoading(true);
        setError(null);
        setWeather(null);
        try {
            const data = await getWeatherByLocationKey(s.Key);
            setWeather(data);
        } catch (e: any) {
            setError(e.message || 'Hava məlumatı alına bilmədi.');
        } finally {
            setLoading(false);
        }
    };

    // Debounced suggestions loader
    useEffect(() => {
        let active = true;
        const t = window.setTimeout(async () => {
            try {
                setLoadingSuggestions(true);
                if (!location.trim() || location.trim().length < 2) {
                    const top = await getTopCities(12);
                    if (!active) return;
                    setSuggestions(top.map(convertToAccuFormat));
                } else {
                    const res = await searchCityAutocomplete(location.trim());
                    if (!active) return;
                    setSuggestions(res.map(convertToAccuFormat));
                }
            } catch (e) {
                if (active) setSuggestions([]);
            } finally {
                if (active) setLoadingSuggestions(false);
            }
        }, 250);
        return () => { active = false; window.clearTimeout(t); };
    }, [location]);

    const renderContent = () => {
        if (loading) {
            return <div className="flex justify-center items-center h-64"><LoadingSpinner className="w-16 h-16 text-blue-400 animate-spin" /></div>;
        }
        if (error) {
            return (
                <div className="flex flex-col justify-center items-center h-64 text-center text-white/70 animate-fade-in">
                    <AlertTriangleIcon className="w-20 h-20 text-yellow-500 mb-6 opacity-80" />
                    <p className="max-w-md text-lg font-light">{error}</p>
                </div>
            );
        }
        if (weather) {
            return (
                <div className="max-w-5xl mx-auto w-full animate-slide-up pb-10">
                    {/* Current Weather Card */}
                    <div className="relative overflow-hidden bg-white/10 backdrop-blur-md border border-white/10 p-8 md:p-12 rounded-3xl mb-8 flex flex-col md:flex-row items-center justify-between text-center md:text-left shadow-2xl group hover:bg-white/15 transition-all duration-500">
                        <div className="absolute top-0 right-0 -mt-10 -mr-10 w-64 h-64 bg-blue-500/20 rounded-full blur-3xl group-hover:bg-blue-400/30 transition-all duration-700"></div>
                        <div className="absolute bottom-0 left-0 -mb-10 -ml-10 w-64 h-64 bg-purple-500/20 rounded-full blur-3xl group-hover:bg-purple-400/30 transition-all duration-700"></div>

                        <div className="relative z-10">
                            <h2 className="text-4xl md:text-5xl font-bold text-white tracking-tight mb-2">{weather.location}</h2>
                            <div className="flex items-center justify-center md:justify-start gap-4">
                                <p className="text-8xl md:text-9xl font-thin text-white tracking-tighter">{Math.round(weather.current.temp)}&deg;</p>
                            </div>
                            <p className="text-2xl text-blue-200 font-light capitalize mt-2 tracking-wide">{weather.current.condition}</p>
                        </div>
                        <div className="relative z-10 mt-8 md:mt-0 transform transition-transform duration-500 hover:scale-110 hover:rotate-3">
                            <img
                                src={get3DIconUrl(weather.current.code)}
                                alt={weather.current.condition}
                                className="w-48 h-48 drop-shadow-[0_10px_20px_rgba(0,0,0,0.3)] filter brightness-110"
                            />
                        </div>
                    </div>

                    {/* Detailed Metrics Grid */}
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
                        <div className="bg-white/5 backdrop-blur-sm border border-white/5 p-5 rounded-2xl flex flex-col items-center justify-center hover:bg-white/10 transition-colors group">
                            <span className="text-white/50 text-xs mb-2 uppercase tracking-wider">Rütubət</span>
                            <span className="text-2xl font-medium text-white">{weather.current.humidity}%</span>
                        </div>
                        <div className="bg-white/5 backdrop-blur-sm border border-white/5 p-5 rounded-2xl flex flex-col items-center justify-center hover:bg-white/10 transition-colors group">
                            <span className="text-white/50 text-xs mb-2 uppercase tracking-wider">Külək</span>
                            <span className="text-2xl font-medium text-white flex items-baseline gap-1">
                                {weather.current.windSpeed}
                                <span className="text-xs font-normal text-white/40">km/s</span>
                            </span>
                        </div>
                        <div className="bg-white/5 backdrop-blur-sm border border-white/5 p-5 rounded-2xl flex flex-col items-center justify-center hover:bg-white/10 transition-colors group">
                            <span className="text-white/50 text-xs mb-2 uppercase tracking-wider">Hiss edilən</span>
                            <span className="text-2xl font-medium text-white">{weather.current.feelsLike}&deg;</span>
                        </div>
                        <div className="bg-white/5 backdrop-blur-sm border border-white/5 p-5 rounded-2xl flex flex-col items-center justify-center hover:bg-white/10 transition-colors group">
                            <span className="text-white/50 text-xs mb-2 uppercase tracking-wider">Təzyiq</span>
                            <span className="text-2xl font-medium text-white flex items-baseline gap-1">
                                {weather.current.pressure}
                                <span className="text-xs font-normal text-white/40">hPa</span>
                            </span>
                        </div>
                        <div className="bg-white/5 backdrop-blur-sm border border-white/5 p-5 rounded-2xl flex flex-col items-center justify-center hover:bg-white/10 transition-colors group">
                            <span className="text-white/50 text-xs mb-2 uppercase tracking-wider">UV İndeksi</span>
                            <span className="text-2xl font-medium text-white">{weather.current.uvIndex ?? '-'}</span>
                        </div>
                        <div className="bg-white/5 backdrop-blur-sm border border-white/5 p-5 rounded-2xl flex flex-col items-center justify-center hover:bg-white/10 transition-colors group">
                            <span className="text-white/50 text-xs mb-2 uppercase tracking-wider">Görünüş</span>
                            <span className="text-2xl font-medium text-white flex items-baseline gap-1">
                                {weather.current.visibility ?? '-'}
                                <span className="text-xs font-normal text-white/40">km</span>
                            </span>
                        </div>
                    </div>

                    {/* Hourly Forecast */}
                    <div className="mb-10">
                        <h3 className="text-xl font-semibold text-white/90 mb-6 pl-3 border-l-4 border-blue-500">Saatlıq Proqnoz</h3>
                        <div className="flex gap-4 overflow-x-auto pb-4 custom-scrollbar snap-x">
                            {weather.hourly.map((h, i) => (
                                <div key={i} className="min-w-[100px] bg-white/5 backdrop-blur-md border border-white/10 p-5 rounded-2xl flex flex-col items-center snap-start hover:bg-white/10 transition-all duration-300 group">
                                    <span className="text-sm text-white/60 mb-3">{h.time}</span>
                                    <img src={get3DIconUrl(h.code)} alt={h.condition} className="w-12 h-12 mb-3 drop-shadow-md group-hover:scale-110 transition-transform" />
                                    <span className="text-xl font-light text-white">{h.temp}&deg;</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-10">
                        {/* Sun & Moon Card */}
                        {weather.sunMoon && (
                            <div className="bg-white/5 backdrop-blur-md border border-white/10 p-8 rounded-3xl shadow-xl">
                                <h3 className="text-xl font-semibold text-white/90 mb-8 flex items-center gap-3">
                                    <SunIcon className="w-6 h-6 text-yellow-400" /> Günəş və Ay
                                </h3>
                                <div className="grid grid-cols-2 gap-8">
                                    <div className="space-y-6">
                                        <div className="flex items-center gap-4 group">
                                            <div className="p-3 bg-orange-500/20 rounded-xl group-hover:bg-orange-500/30 transition-colors">
                                                <SunriseIcon className="w-6 h-6 text-orange-400" />
                                            </div>
                                            <div>
                                                <p className="text-xs text-white/40 uppercase tracking-tighter">Günəş Doğur</p>
                                                <p className="text-lg font-medium text-white">{weather.sunMoon.sunrise}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-4 group">
                                            <div className="p-3 bg-blue-500/20 rounded-xl group-hover:bg-blue-500/30 transition-colors">
                                                <SunsetIcon className="w-6 h-6 text-blue-400" />
                                            </div>
                                            <div>
                                                <p className="text-xs text-white/40 uppercase tracking-tighter">Günəş Batır</p>
                                                <p className="text-lg font-medium text-white">{weather.sunMoon.sunset}</p>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="space-y-6">
                                        <div className="flex items-center gap-4 group">
                                            <div className="p-3 bg-purple-500/20 rounded-xl group-hover:bg-purple-500/30 transition-colors">
                                                <MoonIcon className="w-6 h-6 text-purple-400" />
                                            </div>
                                            <div>
                                                <p className="text-xs text-white/40 uppercase tracking-tighter">Ay Doğur</p>
                                                <p className="text-lg font-medium text-white">{weather.sunMoon.moonrise}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-4 group">
                                            <div className="p-3 bg-indigo-500/20 rounded-xl group-hover:bg-indigo-500/30 transition-colors">
                                                <MoonIcon className="w-6 h-6 text-indigo-400 rotate-180" />
                                            </div>
                                            <div>
                                                <p className="text-xs text-white/40 uppercase tracking-tighter">Ay Batır</p>
                                                <p className="text-lg font-medium text-white">{weather.sunMoon.moonset}</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div className="mt-8 pt-6 border-t border-white/5 flex items-center justify-between">
                                    <span className="text-sm text-white/50 italic">Ayın Fazası:</span>
                                    <span className="text-sm font-medium text-blue-300">{weather.sunMoon.moonPhase}</span>
                                </div>
                            </div>
                        )}

                        {/* Air Quality Card */}
                        {weather.airQuality && (
                            <div className="bg-white/5 backdrop-blur-md border border-white/10 p-8 rounded-3xl shadow-xl">
                                <h3 className="text-xl font-semibold text-white/90 mb-8 flex items-center gap-3">
                                    <AirQualityIcon className="w-6 h-6 text-green-400" /> Hava Keyfiyyəti
                                </h3>
                                <div className="flex flex-col items-center justify-center h-full -mt-4">
                                    <div className="relative w-32 h-32 flex items-center justify-center mb-6">
                                        <svg className="w-full h-full -rotate-90">
                                            <circle cx="64" cy="64" r="58" fill="none" stroke="currentColor" strokeWidth="8" className="text-white/5" />
                                            <circle cx="64" cy="64" r="58" fill="none" stroke="currentColor" strokeWidth="8" strokeDasharray="364" strokeDashoffset={364 - (364 * Math.min(weather.airQuality.value, 100)) / 100} className="text-green-500" strokeLinecap="round" />
                                        </svg>
                                        <div className="absolute flex flex-col items-center">
                                            <span className="text-3xl font-bold text-white">{weather.airQuality.value}</span>
                                            <span className="text-[10px] text-white/40 uppercase">AQI</span>
                                        </div>
                                    </div>
                                    <div className="text-center">
                                        <p className="text-2xl font-medium text-white mb-2">{weather.airQuality.category}</p>
                                        <p className="text-sm text-white/50 max-w-[200px] leading-relaxed">
                                            {weather.airQuality.description || 'Hava keyfiyyəti hazırda normaldır.'}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Forecast Section */}
                    <div>
                        <h3 className="text-xl font-semibold text-white/90 mb-6 pl-3 border-l-4 border-blue-500">10 Günlük Proqnoz</h3>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
                            {weather.forecast.map((day, index) => (
                                <div key={index}
                                    className="bg-white/5 backdrop-blur-sm border border-white/5 p-6 rounded-2xl flex flex-col items-center hover:bg-white/10 hover:-translate-y-1 transition-all duration-300 group cursor-default shadow-lg">
                                    <p className="font-medium text-lg text-white/80 mb-2">{day.day}</p>
                                    <div className="my-2 transform group-hover:scale-110 transition-transform duration-300">
                                        <img
                                            src={get3DIconUrl(day.code)}
                                            alt={day.condition}
                                            className="w-16 h-16 drop-shadow-md"
                                        />
                                    </div>
                                    <p className="text-3xl font-light text-white mb-1">{Math.round(day.temp)}&deg;</p>
                                    <p className="text-xs text-white/60 capitalize text-center line-clamp-2 h-8 flex items-center">{day.condition}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            );
        }
        return (
            <div className="flex flex-col items-center justify-center h-[50vh] text-white/40 animate-pulse-slow">
                <WeatherIconComponent className="w-32 h-32 mb-6 opacity-50" />
                <p className="text-xl font-light tracking-wide">Hava proqnozu üçün şəhər axtarın</p>
            </div>
        );
    };

    return (
        <div className="flex-grow overflow-y-auto h-full relative bg-transparent">
            {/* Background Ambient Effects */}
            <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-600/10 rounded-full blur-[100px] pointer-events-none"></div>
            <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-purple-600/10 rounded-full blur-[100px] pointer-events-none"></div>

            <div className="relative z-10 p-6 md:p-10 min-h-full flex flex-col">
                <style>{`
                    @keyframes fade-in {
                        from { opacity: 0; }
                        to { opacity: 1; }
                    }
                    @keyframes slide-up {
                        from { opacity: 0; transform: translateY(20px); }
                        to { opacity: 1; transform: translateY(0); }
                    }
                    @keyframes pulse-slow {
                        0%, 100% { opacity: 0.4; }
                        50% { opacity: 0.7; }
                    }
                    .animate-fade-in { animation: fade-in 0.6s ease-out forwards; }
                    .animate-slide-up { animation: slide-up 0.7s cubic-bezier(0.2, 0.8, 0.2, 1) forwards; }
                    .animate-pulse-slow { animation: pulse-slow 4s infinite ease-in-out; }
                    
                    /* Custom Scrollbar for dropdown */
                    .custom-scrollbar::-webkit-scrollbar {
                        width: 6px;
                    }
                    .custom-scrollbar::-webkit-scrollbar-track {
                        background: rgba(255, 255, 255, 0.05);
                    }
                    .custom-scrollbar::-webkit-scrollbar-thumb {
                        background: rgba(255, 255, 255, 0.2);
                        border-radius: 3px;
                    }
                    .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                        background: rgba(255, 255, 255, 0.3);
                    }
                    
                    /* Hide scrollbar for Chrome, Safari and Opera */
                    .no-scrollbar::-webkit-scrollbar {
                        display: none;
                    }
                    /* Hide scrollbar for IE, Edge and Firefox */
                    .no-scrollbar {
                        -ms-overflow-style: none;  /* IE and Edge */
                        scrollbar-width: none;  /* Firefox */
                    }
                `}</style>

                <div className="max-w-xl mx-auto w-full mb-12 animate-slide-up" style={{ animationDelay: '0.1s' }}>
                    <h1 className="text-4xl md:text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-200 to-white mb-8 text-center tracking-tight">Hava</h1>
                    <form onSubmit={handleSearch} className="relative group">
                        <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-purple-500 rounded-2xl blur opacity-20 group-hover:opacity-40 transition-opacity duration-500"></div>
                        <div className="relative">
                            <input
                                type="text"
                                value={location}
                                onChange={(e) => { setLocation(e.target.value); setShowDropdown(true); }}
                                onFocus={() => setShowDropdown(true)}
                                onBlur={() => { blurTimeout.current = window.setTimeout(() => setShowDropdown(false), 200); }}
                                placeholder="Şəhər axtar..."
                                className="w-full bg-white/5 backdrop-blur-xl border border-white/10 p-5 pl-6 pr-16 rounded-2xl text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:bg-white/10 transition-all shadow-lg text-lg"
                                aria-label="Məkan axtarışı"
                            />
                            <button type="submit" disabled={loading} className="absolute right-3 top-1/2 -translate-y-1/2 bg-white/10 hover:bg-white/20 text-white p-3 rounded-xl transition-all disabled:opacity-50 hover:scale-105 active:scale-95" aria-label="Axtar">
                                {loading ? <LoadingSpinner className="w-5 h-5 animate-spin" /> : <SearchIcon className="w-5 h-5" />}
                            </button>
                        </div>

                        {/* Suggestions dropdown */}
                        {showDropdown && (
                            <div className="absolute z-50 left-0 right-0 mt-3 bg-[#1a1f2e]/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl max-h-80 overflow-auto animate-fade-in custom-scrollbar" onMouseDown={(e) => e.preventDefault()}>
                                <div className="flex items-center justify-between px-5 py-3 text-xs font-medium text-blue-300/70 uppercase tracking-wider border-b border-white/5">
                                    <span>{location.trim().length < 2 ? 'Təklif olunan şəhərlər' : 'Nəticələr'}</span>
                                    {loadingSuggestions && <LoadingSpinner className="w-3 h-3 animate-spin" />}
                                </div>
                                {suggestions.length === 0 && !loadingSuggestions ? (
                                    <div className="px-5 py-4 text-sm text-white/50 text-center italic">Nəticə tapılmadı</div>
                                ) : (
                                    <ul className="py-2">
                                        {suggestions.map((s) => (
                                            <li key={s.Key}>
                                                <button
                                                    type="button"
                                                    onMouseDown={(e) => e.preventDefault()}
                                                    onClick={() => handleSelectSuggestion(s)}
                                                    className="w-full text-left px-5 py-3 hover:bg-white/5 transition-colors flex flex-col gap-0.5 group"
                                                >
                                                    <span className="text-white text-base font-medium group-hover:text-blue-200 transition-colors">{s.LocalizedName}{s.AdministrativeArea ? `, ${s.AdministrativeArea.LocalizedName}` : ''}</span>
                                                    <span className="text-white/40 text-xs">{s.Country.LocalizedName}</span>
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        )}
                    </form>
                </div>

                {renderContent()}
            </div>
        </div>
    );
}