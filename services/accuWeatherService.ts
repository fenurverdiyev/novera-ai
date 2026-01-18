import type { WeatherData } from '../types';

const GEO_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const AQ_URL = 'https://air-quality-api.open-meteo.com/v1/air-quality';
const MOON_URL = 'https://api.met.no/weatherapi/sunrise/3.0/moon';

export interface AccuCitySuggestion {
  Key: string; // Used as "lat,lon" for Open-Meteo
  LocalizedName: string;
  Country: { LocalizedName: string };
  AdministrativeArea?: { LocalizedName: string };
}

// Fetch helper with timeout
const DEFAULT_TIMEOUT = 10000; // 10s
async function fetchWithTimeout(url: string, timeoutMs: number = DEFAULT_TIMEOUT, options?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      throw new Error('Xidmət cavab vermədi (timeout). Bir qədər sonra yenidən cəhd edin.');
    }
    throw err;
  } finally {
    clearTimeout(id);
  }
}

// WMO Weather Code to AccuWeather Icon Mapping
const wmoToAccuCode = (wmo: number, isDay: boolean = true): number => {
  switch (wmo) {
    case 0: return isDay ? 1 : 33; // Clear sky
    case 1: return isDay ? 2 : 34; // Mainly clear
    case 2: return isDay ? 3 : 35; // Partly cloudy
    case 3: return isDay ? 6 : 38; // Overcast
    case 45:
    case 48: return 11; // Fog
    case 51:
    case 53:
    case 55: return 12; // Drizzle
    case 56:
    case 57: return 12; // Freezing Drizzle
    case 61: return 13; // Slight rain
    case 63: return 14; // Moderate rain
    case 65: return 18; // Heavy rain
    case 66:
    case 67: return 18; // Freezing rain
    case 71: return 22; // Slight snow
    case 73: return 22; // Moderate snow
    case 75: return 22; // Heavy snow
    case 77: return 22; // Snow grains
    case 80: return 12; // Slight rain showers
    case 81: return 12; // Moderate rain showers
    case 82: return 18; // Violent rain showers
    case 85: return 22; // Slight snow showers
    case 86: return 22; // Heavy snow showers
    case 95: return 15; // Thunderstorm
    case 96:
    case 99: return 15; // Thunderstorm with hail
    default: return 1;
  }
};

const getWmoDescription = (wmo: number): string => {
  const map: Record<number, string> = {
    0: 'Açıq səma', 1: 'Əsasən açıq', 2: 'Parçalı buludlu', 3: 'Buludlu',
    45: 'Duman', 48: 'Duman', 51: 'Yüngül çiskin', 53: 'Çiskin', 55: 'Sıx çiskin',
    56: 'Dondurucu çiskin', 57: 'Dondurucu çiskin', 61: 'Yüngül yağış', 63: 'Yağış', 65: 'Güclü yağış',
    66: 'Dondurucu yağış', 67: 'Dondurucu yağış', 71: 'Yüngül qar', 73: 'Qar', 75: 'Güclü qar',
    77: 'Qar dənəcikləri', 80: 'Yüngül leysan', 81: 'Leysan', 82: 'Güclü leysan',
    85: 'Yüngül qar leysanı', 86: 'Güclü qar leysanı', 95: 'Göy gurultusu', 96: 'Dolu ilə göy gurultusu', 99: 'Dolu ilə göy gurultusu'
  };
  return map[wmo] || 'Naməlum';
};

const getAqiCategory = (aqi: number): { category: string; description: string } => {
  if (aqi <= 50) return { category: 'Əla', description: 'Hava keyfiyyəti qənaətbəxşdir.' };
  if (aqi <= 100) return { category: 'Normal', description: 'Hava keyfiyyəti məqbuldur.' };
  if (aqi <= 150) return { category: 'Həssas qruplar üçün zərərli', description: 'Həssas insanlar təsir hiss edə bilər.' };
  if (aqi <= 200) return { category: 'Zərərli', description: 'Hər kəs sağlamlıq təsirləri hiss edə bilər.' };
  if (aqi <= 300) return { category: 'Çox zərərli', description: 'Sağlamlıq xəbərdarlığı: fövqəladə vəziyyət.' };
  return { category: 'Təhlükəli', description: 'Sağlamlıq üçün ciddi təhlükə.' };
};

const getMoonPhaseDescription = (phase: number): string => {
  if (phase < 11.25 || phase > 348.75) return 'Yeni Ay';
  if (phase < 78.75) return 'Artan Ay Para';
  if (phase < 101.25) return 'İlk Rüb';
  if (phase < 168.75) return 'Şişkin Ay';
  if (phase < 191.25) return 'Bütöv Ay';
  if (phase < 258.75) return 'Azalan Şişkin Ay';
  if (phase < 281.25) return 'Son Rüb';
  return 'Azalan Ay Para';
};

export async function searchCityAutocomplete(query: string, lang: string = 'az'): Promise<AccuCitySuggestion[]> {
  if (!query.trim() || query.length < 2) return [];

  const url = `${GEO_URL}?name=${encodeURIComponent(query)}&count=10&language=${lang === 'az' ? 'en' : lang}`;

  try {
    const res = await fetchWithTimeout(url);
    if (!res.ok) return [];
    const data = await res.json();

    if (!data.results) return [];

    return data.results.map((item: any) => ({
      Key: `${item.latitude},${item.longitude}`,
      LocalizedName: item.name,
      Country: { LocalizedName: item.country || '' },
      AdministrativeArea: item.admin1 ? { LocalizedName: item.admin1 } : undefined,
    }));
  } catch (error) {
    console.error('Open-Meteo Geocoding error:', error);
    return [];
  }
}

export async function getTopCities(limit: number = 12, lang: string = 'az'): Promise<AccuCitySuggestion[]> {
  const topCities = [
    { name: 'Bakı', country: 'Azərbaycan', lat: 40.3777, lon: 49.8920 },
    { name: 'Gəncə', country: 'Azərbaycan', lat: 40.6828, lon: 46.3606 },
    { name: 'Sumqayıt', country: 'Azərbaycan', lat: 40.5897, lon: 49.6686 },
    { name: 'London', country: 'UK', lat: 51.5074, lon: -0.1278 },
    { name: 'New York', country: 'USA', lat: 40.7128, lon: -74.0060 },
    { name: 'Istanbul', country: 'Turkey', lat: 41.0082, lon: 28.9784 },
    { name: 'Paris', country: 'France', lat: 48.8566, lon: 2.3522 },
    { name: 'Dubai', country: 'UAE', lat: 25.2048, lon: 55.2708 },
    { name: 'Tokyo', country: 'Japan', lat: 35.6762, lon: 139.6503 },
    { name: 'Berlin', country: 'Germany', lat: 52.5200, lon: 13.4050 },
  ];

  return topCities.slice(0, limit).map(c => ({
    Key: `${c.lat},${c.lon}`,
    LocalizedName: c.name,
    Country: { LocalizedName: c.country },
  }));
}

export async function getWeatherByCityName(city: string, lang: string = 'az'): Promise<WeatherData> {
  const locations = await searchCityAutocomplete(city, lang);
  if (!locations.length) {
    throw new Error('Məkan tapılmadı');
  }

  const location = locations[0];
  return getWeatherByLocationKey(location.Key, lang, location);
}

export async function getWeatherByLocationKey(locationKey: string, lang: string = 'az', locationDetails?: AccuCitySuggestion): Promise<WeatherData> {
  const [lat, lon] = locationKey.split(',');

  const forecastUrl = `${FORECAST_URL}?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,pressure_msl,wind_speed_10m,visibility&hourly=temperature_2m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max&timezone=auto&forecast_days=10`;

  const aqUrl = `${AQ_URL}?latitude=${lat}&longitude=${lon}&current=us_aqi&timezone=auto`;

  const today = new Date().toISOString().split('T')[0];
  const moonUrl = `${MOON_URL}?lat=${lat}&lon=${lon}&date=${today}&offset=%2B04:00`;

  try {
    const [weatherRes, aqRes, moonRes] = await Promise.all([
      fetchWithTimeout(forecastUrl),
      fetchWithTimeout(aqUrl),
      fetchWithTimeout(moonUrl, 10000, { headers: { 'User-Agent': 'NovEra/0.1' } })
    ]);

    const weatherData = await weatherRes.json();
    const aqData = aqRes.ok ? await aqRes.json() : null;
    const moonData = moonRes.ok ? await moonRes.json() : null;

    const current = weatherData.current;
    const hourly = weatherData.hourly;
    const daily = weatherData.daily;

    const locationName = locationDetails
      ? `${locationDetails.LocalizedName}${locationDetails.AdministrativeArea ? ', ' + locationDetails.AdministrativeArea.LocalizedName : ''}, ${locationDetails.Country.LocalizedName}`
      : 'Seçilmiş məkan';

    // Map Hourly
    const hourlyData = [];
    for (let i = 0; i < 24; i++) {
      hourlyData.push({
        time: new Date(hourly.time[i]).toLocaleTimeString('az-AZ', { hour: '2-digit', minute: '2-digit' }),
        temp: Math.round(hourly.temperature_2m[i]),
        condition: getWmoDescription(hourly.weather_code[i]),
        code: wmoToAccuCode(hourly.weather_code[i], true),
      });
    }

    // Map Forecast
    const forecastData = daily.time.map((time: string, i: number) => ({
      day: new Date(time).toLocaleDateString('az-AZ', { weekday: 'short' }),
      temp: Math.round((daily.temperature_2m_max[i] + daily.temperature_2m_min[i]) / 2),
      condition: getWmoDescription(daily.weather_code[i]),
      code: wmoToAccuCode(daily.weather_code[i], true),
      sunrise: new Date(daily.sunrise[i]).toLocaleTimeString('az-AZ', { hour: '2-digit', minute: '2-digit' }),
      sunset: new Date(daily.sunset[i]).toLocaleTimeString('az-AZ', { hour: '2-digit', minute: '2-digit' }),
    }));

    const aqiValue = aqData?.current?.us_aqi || 0;
    const aqiInfo = getAqiCategory(aqiValue);

    const mRise = moonData?.properties?.rise?.time;
    const mSet = moonData?.properties?.set?.time;
    const mPhase = moonData?.properties?.moonphase || 0;

    return {
      location: locationName,
      current: {
        temp: Math.round(current.temperature_2m),
        condition: getWmoDescription(current.weather_code),
        humidity: current.relative_humidity_2m,
        windSpeed: Math.round(current.wind_speed_10m),
        feelsLike: Math.round(current.apparent_temperature),
        pressure: Math.round(current.pressure_msl),
        code: wmoToAccuCode(current.weather_code, true),
        uvIndex: daily.uv_index_max[0],
        visibility: Math.round((current.visibility || 15000) / 1000),
      },
      hourly: hourlyData,
      forecast: forecastData,
      sunMoon: {
        sunrise: new Date(daily.sunrise[0]).toLocaleTimeString('az-AZ', { hour: '2-digit', minute: '2-digit' }),
        sunset: new Date(daily.sunset[0]).toLocaleTimeString('az-AZ', { hour: '2-digit', minute: '2-digit' }),
        moonrise: mRise ? new Date(mRise).toLocaleTimeString('az-AZ', { hour: '2-digit', minute: '2-digit' }) : '--:--',
        moonset: mSet ? new Date(mSet).toLocaleTimeString('az-AZ', { hour: '2-digit', minute: '2-digit' }) : '--:--',
        moonPhase: getMoonPhaseDescription(mPhase),
      },
      airQuality: {
        value: Math.round(aqiValue),
        category: aqiInfo.category,
        description: aqiInfo.description
      }
    };
  } catch (error) {
    console.error('Weather fetch error:', error);
    throw error;
  }
}

export function convertToAccuFormat(item: any): AccuCitySuggestion {
  return item;
}