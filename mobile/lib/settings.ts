import AsyncStorage from '@react-native-async-storage/async-storage';

export type Settings = {
  apiBaseUrl: string;
  wsBaseUrl: string;

  esp32Ip: string;
  esp32Port: string;

  enableSpeechAlerts: boolean;
  enableHapticAlerts: boolean;
  enableSessionLogging: boolean;
  enableAutoCoordination: boolean;
};

const SETTINGS_KEY = 'app-settings';

const DEFAULT_API_BASE = 'http://13.232.35.54:8000';
const DEFAULT_WS_BASE = 'ws://13.232.35.54:8000';

export const defaultSettings: Settings = {
  apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE ?? DEFAULT_API_BASE,
  wsBaseUrl: process.env.EXPO_PUBLIC_WS_BASE ?? DEFAULT_WS_BASE,

  esp32Ip: process.env.EXPO_PUBLIC_ESP32_IP ?? '192.168.1.100',
  esp32Port: process.env.EXPO_PUBLIC_ESP32_PORT ?? '80',

  enableSpeechAlerts: true,
  enableHapticAlerts: true,
  enableSessionLogging: true,
  enableAutoCoordination: false,
};

const mergeSettings = (stored?: Partial<Settings>): Settings => {
  const api = stored?.apiBaseUrl?.trim();
  const ws = stored?.wsBaseUrl?.trim();

  return {
    ...defaultSettings,
    ...(api ? { apiBaseUrl: api } : {}),
    ...(ws ? { wsBaseUrl: ws } : {}),
    ...(stored?.esp32Ip?.trim() ? { esp32Ip: stored.esp32Ip.trim() } : {}),
    ...(stored?.esp32Port?.trim() ? { esp32Port: stored.esp32Port.trim() } : {}),
    ...(typeof stored?.enableSpeechAlerts === 'boolean'
      ? { enableSpeechAlerts: stored.enableSpeechAlerts }
      : {}),
    ...(typeof stored?.enableHapticAlerts === 'boolean'
      ? { enableHapticAlerts: stored.enableHapticAlerts }
      : {}),
    ...(typeof stored?.enableSessionLogging === 'boolean'
      ? { enableSessionLogging: stored.enableSessionLogging }
      : {}),
    ...(typeof stored?.enableAutoCoordination === 'boolean'
      ? { enableAutoCoordination: stored.enableAutoCoordination }
      : {}),
  };
};

const validateUrl = (value: string, allowedProtocols: string[]) => {
  const trimmed = value.trim();
  if (!trimmed) return false;

  try {
    const url = new URL(trimmed);
    return allowedProtocols.includes(url.protocol);
  } catch {
    return false;
  }
};

export const validateApiBaseUrl = (value: string) => validateUrl(value, ['http:', 'https:']);

export const validateWsBaseUrl = (value: string) => validateUrl(value, ['ws:', 'wss:']);

export const loadSettings = async (): Promise<Settings> => {
  try {
    const stored = await AsyncStorage.getItem(SETTINGS_KEY);
    if (!stored) return mergeSettings();

    const parsed = JSON.parse(stored) as Partial<Settings>;
    return mergeSettings(parsed);
  } catch {
    return mergeSettings();
  }
};

export const saveSettings = async (settings: Settings): Promise<void> => {
  const value = JSON.stringify(settings);
  await AsyncStorage.setItem(SETTINGS_KEY, value);
};

export const clearSettings = async (): Promise<void> => {
  await AsyncStorage.removeItem(SETTINGS_KEY);
};
