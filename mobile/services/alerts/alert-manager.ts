import { MetricsOutput } from '@/types/metrics';
import { AlertConfig, AlertPriority, AlertState } from '@/types/alerts';
import { ALERT_CONFIGS } from './alert-config';
import { evaluateAlertConditions } from './alert-evaluator';
import { speak, stopSpeaking } from '../speech';
import { triggerHaptic } from '../hapticts';
import { sendESP32Alert, priorityToESP32Type, notifyESP32SessionStart, notifyESP32SessionStop } from '../esp32';

export const DEFAULT_STARTUP_DELAY_MS = 4_000;

/**
 * Manages audio alerts for driver monitoring metrics.
 *
 * Responsibilities:
 * - Play a one-time welcome message at session start
 * - Enforce a startup grace period before alerts begin
 * - Orchestrate alert selection
 * - Coordinate alert playback and interruption
 */
export class AlertManager {
  constructor(
    private enableSpeechAlerts: boolean,
    private enableHapticAlerts: boolean
  ) {}

  private alertStates = new Map<string, AlertState>();
  private currentAlert: AlertConfig | null = null;

  // Global speaking lock
  private isSpeaking = false;

  // Session / startup state
  private sessionStartedAt: number | null = null;
  private hasPlayedWelcome = false;
  private readonly startupDelayMs = DEFAULT_STARTUP_DELAY_MS;

  /**
   * Process new metrics and trigger alerts if conditions are met.
   * Safe to call on every inference update.
   */
  processMetrics(metrics: MetricsOutput | null): void {
    if (!metrics) return;

    const now = Date.now();

    // Enforce startup grace period
    if (!this.sessionStartedAt || now - this.sessionStartedAt < this.startupDelayMs) {
      return;
    }

    const triggeredAlerts = evaluateAlertConditions(metrics, ALERT_CONFIGS);
    const alertToTrigger = this.selectAlert(triggeredAlerts);

    if (alertToTrigger) {
      this.triggerAlert(alertToTrigger);
    }
  }

  /**
   * Play a one-time welcome message at session start.
   */
  private playWelcomeMessage(): void {
    if (this.hasPlayedWelcome || !this.enableSpeechAlerts) return;

    this.hasPlayedWelcome = true;
    speak('Driver monitoring active. Drive safely.');
  }

  /**
   * Select the highest priority alert that is not in cooldown.
   * Higher-priority alerts may interrupt lower-priority ones.
   */
  private selectAlert(triggered: AlertConfig[]): AlertConfig | null {
    if (triggered.length === 0) return null;

    const sorted = [...triggered].sort((a, b) => b.priority - a.priority);
    const now = Date.now();

    for (const config of sorted) {
      const state = this.getAlertState(config.id);

      // Cooldown check
      if (now - state.lastTriggeredAt < config.cooldownMs) {
        continue;
      }

      // Priority interruption check
      if (this.currentAlert && config.priority <= this.currentAlert.priority) {
        continue;
      }

      return config;
    }

    return null;
  }

  /**
   * Trigger an alert.
   * Ensures only one alert speaks at a time.
   */
  private async triggerAlert(config: AlertConfig): Promise<void> {
    const state = this.getAlertState(config.id);

    // Avoid re-speaking the same alert concurrently
    if (state.isSpeaking) return;

    // If any alert is speaking, only interrupt if higher priority
    if (this.isSpeaking && this.currentAlert) {
      if (config.priority > this.currentAlert.priority) {
        await stopSpeaking();
      } else {
        return;
      }
    }

    state.lastTriggeredAt = Date.now();
    state.isSpeaking = true;
    this.isSpeaking = true;
    this.currentAlert = config;

    if (this.enableHapticAlerts) {
      if (config.priority === AlertPriority.CRITICAL || config.priority === AlertPriority.HIGH) {
        triggerHaptic({ type: 'warning' });
      } else {
        triggerHaptic({ type: 'impact' });
      }
    }

    // Send alert to ESP32 (OLED display + buzzer)
    const esp32Payload = priorityToESP32Type(config.priority);
    sendESP32Alert({
      message: config.message,
      type: esp32Payload.type,
      buzzer: esp32Payload.buzzer,
    }).catch(() => {/* ESP32 errors are non-fatal */});

    if (this.enableSpeechAlerts) {
      speak(config.message, {
        onDone: () => this.clearAlertState(config, state),
        onStopped: () => this.clearAlertState(config, state),
        onError: () => this.clearAlertState(config, state),
      });
    } else {
      // If speech is disabled, still clear the state immediately
      setTimeout(() => this.clearAlertState(config, state), 500);
    }
  }

  /**
   * Clear alert state after speech completion.
   */
  private clearAlertState(config: AlertConfig, state: AlertState): void {
    state.isSpeaking = false;
    this.isSpeaking = false;

    if (this.currentAlert?.id === config.id) {
      this.currentAlert = null;
    }
  }

  /**
   * Get or initialize alert state.
   */
  private getAlertState(alertId: string): AlertState {
    let state = this.alertStates.get(alertId);

    if (!state) {
      state = { lastTriggeredAt: 0, isSpeaking: false };
      this.alertStates.set(alertId, state);
    }

    return state;
  }

  setPreferences(speech: boolean, haptic: boolean) {
    this.enableSpeechAlerts = speech;
    this.enableHapticAlerts = haptic;

    if (!speech) {
      stopSpeaking();
    }
  }

  /**
   * Start session and play welcome message.
   */
  start() {
    this.currentAlert = null;
    this.sessionStartedAt = Date.now();
    this.playWelcomeMessage();
    // Notify ESP32 that monitoring has started
    notifyESP32SessionStart().catch(() => {/* non-fatal */});
  }

  /**
   * Stop all alerts and reset session state.
   * Safe to call multiple times.
   */
  async stop(): Promise<void> {
    await stopSpeaking();
    this.currentAlert = null;
    this.alertStates.clear();
    this.sessionStartedAt = null;
    this.hasPlayedWelcome = false;
    this.isSpeaking = false;
    // Notify ESP32 that monitoring has stopped
    notifyESP32SessionStop().catch(() => {/* non-fatal */});
  }
}
