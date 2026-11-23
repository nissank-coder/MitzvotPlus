export type CityOption = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  elevation: number;
  tzid: string;
  il: boolean;
  /** Minutes before sunset for Shabbat candle lighting (local custom). */
  candleMins: number;
};

export const cities: CityOption[] = [
  { id: 'jerusalem', name: 'ירושלים', latitude: 31.7683, longitude: 35.2137, elevation: 754, tzid: 'Asia/Jerusalem', il: true, candleMins: 40 },
  { id: 'tel-aviv', name: 'תל אביב', latitude: 32.0853, longitude: 34.7818, elevation: 5, tzid: 'Asia/Jerusalem', il: true, candleMins: 18 },
  { id: 'haifa', name: 'חיפה', latitude: 32.794, longitude: 34.9896, elevation: 0, tzid: 'Asia/Jerusalem', il: true, candleMins: 30 },
  { id: 'bnei-brak', name: 'בני ברק', latitude: 32.0807, longitude: 34.8338, elevation: 30, tzid: 'Asia/Jerusalem', il: true, candleMins: 22 },
  { id: 'petah-tikva', name: 'פתח תקווה', latitude: 32.0871, longitude: 34.8875, elevation: 40, tzid: 'Asia/Jerusalem', il: true, candleMins: 22 },
  { id: 'beit-shemesh', name: 'בית שמש', latitude: 31.7469, longitude: 34.9881, elevation: 250, tzid: 'Asia/Jerusalem', il: true, candleMins: 30 },
  { id: 'modiin', name: 'מודיעין', latitude: 31.8969, longitude: 35.0095, elevation: 250, tzid: 'Asia/Jerusalem', il: true, candleMins: 20 },
  { id: 'ashdod', name: 'אשדוד', latitude: 31.8044, longitude: 34.6553, elevation: 20, tzid: 'Asia/Jerusalem', il: true, candleMins: 20 },
  { id: 'netanya', name: 'נתניה', latitude: 32.3215, longitude: 34.8532, elevation: 30, tzid: 'Asia/Jerusalem', il: true, candleMins: 20 },
  { id: 'beer-sheva', name: 'באר שבע', latitude: 31.2518, longitude: 34.7913, elevation: 260, tzid: 'Asia/Jerusalem', il: true, candleMins: 20 },
  { id: 'safed', name: 'צפת', latitude: 32.9646, longitude: 35.496, elevation: 900, tzid: 'Asia/Jerusalem', il: true, candleMins: 30 },
  { id: 'tiberias', name: 'טבריה', latitude: 32.7959, longitude: 35.531, elevation: -200, tzid: 'Asia/Jerusalem', il: true, candleMins: 20 },
  { id: 'eilat', name: 'אילת', latitude: 29.5577, longitude: 34.9519, elevation: 0, tzid: 'Asia/Jerusalem', il: true, candleMins: 20 },
  { id: 'new-york', name: 'ניו יורק', latitude: 40.7128, longitude: -74.006, elevation: 10, tzid: 'America/New_York', il: false, candleMins: 18 },
  { id: 'los-angeles', name: 'לוס אנג׳לס', latitude: 34.0522, longitude: -118.2437, elevation: 90, tzid: 'America/Los_Angeles', il: false, candleMins: 18 },
  { id: 'miami', name: 'מיאמי', latitude: 25.7617, longitude: -80.1918, elevation: 2, tzid: 'America/New_York', il: false, candleMins: 18 },
  { id: 'toronto', name: 'טורונטו', latitude: 43.6532, longitude: -79.3832, elevation: 76, tzid: 'America/Toronto', il: false, candleMins: 18 },
  { id: 'london', name: 'לונדון', latitude: 51.5074, longitude: -0.1278, elevation: 11, tzid: 'Europe/London', il: false, candleMins: 18 },
  { id: 'paris', name: 'פריז', latitude: 48.8566, longitude: 2.3522, elevation: 35, tzid: 'Europe/Paris', il: false, candleMins: 18 },
  { id: 'antwerp', name: 'אנטוורפן', latitude: 51.2194, longitude: 4.4025, elevation: 10, tzid: 'Europe/Brussels', il: false, candleMins: 18 },
  { id: 'johannesburg', name: 'יוהנסבורג', latitude: -26.2041, longitude: 28.0473, elevation: 1750, tzid: 'Africa/Johannesburg', il: false, candleMins: 18 },
  { id: 'buenos-aires', name: 'בואנוס איירס', latitude: -34.6037, longitude: -58.3816, elevation: 25, tzid: 'America/Argentina/Buenos_Aires', il: false, candleMins: 18 },
  { id: 'melbourne', name: 'מלבורן', latitude: -37.8136, longitude: 144.9631, elevation: 30, tzid: 'Australia/Melbourne', il: false, candleMins: 18 },
];

export const DEFAULT_CITY_ID = 'jerusalem';

export function cityById(id: string | undefined): CityOption {
  return cities.find((c) => c.id === id) ?? cities[0]!;
}
