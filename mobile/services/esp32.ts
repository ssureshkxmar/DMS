/**
 * ESP32 Communication Service for Suraksha
 *
 * Sends real-time driver alert data to the ESP32 device over local WiFi (HTTP).
 *
 * Endpoints on ESP32:
 *   POST /alert   — send an alert (OLED display + optional buzzer)
 *   POST /session — notify session start/stop
 *   GET  /health  — check if ESP32 is reachable
 *
 * Payload for /alert:
 *   { "message": "...", "type": "CRITICAL|HIGH|MEDIUM|LOW|INFO", "buzzer": true|false }
 *
 * Payload for /session:
 *   { "action": "start" | "stop" }
 */

import { AlertPriority } from '@/types/alerts';

/** Default ESP32 IP — override via EXPO_PUBLIC_ESP32_IP env var or app settings */
const DEFAULT_ESP32_IP = process.env.EXPO_PUBLIC_ESP32_IP ?? '192.168.1.100';
const DEFAULT_ESP32_PORT = process.env.EXPO_PUBLIC_ESP32_PORT ?? '80';
const REQUEST_TIMEOUT_MS = 3000;

let esp32BaseUrl = `http://${DEFAULT_ESP32_IP}:${DEFAULT_ESP32_PORT}`;

/** Update the ESP32 base URL at runtime (e.g. from settings) */
export function setESP32Url(ip: string, port: string = '80') {
  esp32BaseUrl = `http://${ip}:${port}`;
}

/** Get current ESP32 base URL (for debugging) */
export function getESP32Url(): string {
  return esp32BaseUrl;
}

export interface ESP32AlertPayload {
  message: string;
  type: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
  buzzer: boolean;
}

/**
 * Send an alert to the ESP32 device.
 * Fires-and-forgets — errors are logged but never thrown.
 */
export async function sendESP32Alert(payload: ESP32AlertPayload): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    await fetch(`${esp32BaseUrl}/alert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      console.warn('[ESP32] Request timed out — device may be unreachable.');
    } else {
      console.warn('[ESP32] Failed to send alert:', err?.message ?? err);
    }
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Map AlertPriority to an ESP32AlertPayload type string and buzzer flag.
 */
export function priorityToESP32Type(priority: AlertPriority): {
  type: ESP32AlertPayload['type'];
  buzzer: boolean;
} {
  switch (priority) {
    case AlertPriority.CRITICAL:
      return { type: 'CRITICAL', buzzer: true };
    case AlertPriority.HIGH:
      return { type: 'HIGH', buzzer: true };
    case AlertPriority.MEDIUM:
      return { type: 'MEDIUM', buzzer: false };
    case AlertPriority.LOW:
    default:
      return { type: 'LOW', buzzer: false };
  }
}

/**
 * Send a session event to the ESP32.
 * Uses the dedicated /session endpoint for cleaner state tracking on device.
 */
async function sendESP32Session(action: 'start' | 'stop'): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    await fetch(`${esp32BaseUrl}/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
      signal: controller.signal,
    });
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      console.warn('[ESP32] Session notify timed out.');
    } else {
      console.warn('[ESP32] Failed to send session event:', err?.message ?? err);
    }
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Notify ESP32 that a monitoring SESSION started.
 * ESP32 will show "Suraksha Active" on OLED and beep once.
 */
export async function notifyESP32SessionStart(): Promise<void> {
  await sendESP32Session('start');
}

/**
 * Notify ESP32 that a monitoring SESSION stopped.
 * ESP32 will return to idle screen.
 */
export async function notifyESP32SessionStop(): Promise<void> {
  await sendESP32Session('stop');
}

/**
 * Check if the ESP32 device is reachable on the network.
 * Returns true if /health responds successfully.
 */
export async function checkESP32Health(): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2000);
  try {
    const res = await fetch(`${esp32BaseUrl}/health`, { signal: controller.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}
