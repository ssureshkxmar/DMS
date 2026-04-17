/**
 * ESP32 Communication Service for Suraksha
 *
 * Sends alert data to the ESP32 device over WiFi (HTTP).
 * The ESP32 should expose a simple HTTP server at the configured IP.
 *
 * ESP32 Arduino firmware endpoint expected:
 *   POST http://<ESP32_IP>/alert
 *   Body (JSON): { "message": "...", "type": "CRITICAL"|"HIGH"|"MEDIUM"|"LOW", "buzzer": true|false }
 *
 * The ESP32 firmware should:
 *   - Display the message on the OLED screen
 *   - Trigger the buzzer if buzzer=true
 *   - Clear the OLED after ~5 seconds
 */

import { AlertPriority } from '@/types/alerts';

/** Default ESP32 IP — override via EXPO_PUBLIC_ESP32_IP env var */
const DEFAULT_ESP32_IP = process.env.EXPO_PUBLIC_ESP32_IP ?? '192.168.1.100';
const DEFAULT_ESP32_PORT = process.env.EXPO_PUBLIC_ESP32_PORT ?? '80';
const REQUEST_TIMEOUT_MS = 3000;

let esp32BaseUrl = `http://${DEFAULT_ESP32_IP}:${DEFAULT_ESP32_PORT}`;

/** Update the ESP32 base URL at runtime (e.g. from settings) */
export function setESP32Url(ip: string, port: string = '80') {
  esp32BaseUrl = `http://${ip}:${port}`;
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
 * Notify ESP32 that a monitoring SESSION started.
 * Shows a welcome message on OLED.
 */
export async function notifyESP32SessionStart(): Promise<void> {
  await sendESP32Alert({
    message: 'Suraksha Active',
    type: 'INFO',
    buzzer: false,
  });
}

/**
 * Notify ESP32 that a monitoring SESSION stopped.
 * Clears/updates OLED display.
 */
export async function notifyESP32SessionStop(): Promise<void> {
  await sendESP32Alert({
    message: 'Monitoring Stopped',
    type: 'INFO',
    buzzer: false,
  });
}
