import { useEffect, useMemo, useState } from 'react';
import { ScrollView, TextInput, View, ActivityIndicator } from 'react-native';
import { Stack } from 'expo-router';
import { Text } from '@/components/ui/text';
import { Button } from '@/components/ui/button';
import { useSettings } from '../../../hooks/useSettings';
import { checkESP32Health, getESP32Url } from '@/services/esp32';

export default function ESP32SettingsScreen() {
  const { settings, isLoading, saveSettings } = useSettings();

  const [esp32Ip, setEsp32Ip] = useState('');
  const [esp32Port, setEsp32Port] = useState('');
  const [error, setError] = useState('');
  const [statusMessage, setStatusMessage] = useState('');

  // Connection test state
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'online' | 'offline' | null>(null);

  useEffect(() => {
    setEsp32Ip(settings.esp32Ip);
    setEsp32Port(settings.esp32Port);
  }, [settings.esp32Ip, settings.esp32Port]);

  useEffect(() => {
    setStatusMessage('');
    setError('');
    setTestResult(null);
  }, [esp32Ip, esp32Port]);

  const hasChange = useMemo(() => {
    return esp32Ip.trim() !== settings.esp32Ip || esp32Port.trim() !== settings.esp32Port;
  }, [esp32Ip, esp32Port, settings.esp32Ip, settings.esp32Port]);

  const handleSave = async () => {
    const trimmedIp = esp32Ip.trim();
    const trimmedPort = esp32Port.trim();

    if (!trimmedIp) {
      setError('Enter a valid IP address (e.g. 192.168.1.100)');
      return;
    }
    const portNum = parseInt(trimmedPort, 10);
    if (!trimmedPort || isNaN(portNum) || portNum < 1 || portNum > 65535) {
      setError('Enter a valid port number (1–65535)');
      return;
    }

    await saveSettings({
      ...settings,
      esp32Ip: trimmedIp,
      esp32Port: trimmedPort,
    });
    setStatusMessage('ESP32 settings saved.');
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    const online = await checkESP32Health();
    setTestResult(online ? 'online' : 'offline');
    setTesting(false);
  };

  const statusColor =
    testResult === 'online'
      ? 'text-green-600'
      : testResult === 'offline'
        ? 'text-red-500'
        : 'text-muted-foreground';

  const statusText =
    testResult === 'online'
      ? '✅ ESP32 is ONLINE and reachable'
      : testResult === 'offline'
        ? '❌ ESP32 is OFFLINE or unreachable'
        : 'Tap "Test Connection" to check';

  return (
    <ScrollView className="flex-1 px-4 py-4" keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'ESP32 Device' }} />

      {/* Info */}
      <View className="mb-5 rounded-lg border border-border bg-muted/40 p-3">
        <Text className="mb-1 text-sm font-semibold text-foreground">How to connect</Text>
        <Text className="text-xs text-muted-foreground">
          1. Flash suraksha_esp32.ino onto your ESP32{'\n'}
          2. Your ESP32 OLED will show its IP address{'\n'}
          3. Enter that IP here (same WiFi network required){'\n'}
          4. Tap "Test Connection" to verify
        </Text>
      </View>

      {/* IP Address */}
      <View className="mb-4">
        <Text className="mb-2 text-sm font-semibold text-foreground">ESP32 IP Address</Text>
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="decimal-pad"
          editable={!isLoading}
          className="rounded-md border border-border bg-background px-3 py-2 text-base text-foreground"
          placeholder="192.168.1.100"
          value={esp32Ip}
          onChangeText={setEsp32Ip}
        />
        <Text className="mt-1 text-xs text-muted-foreground">
          Shown on OLED after ESP32 connects to WiFi
        </Text>
      </View>

      {/* Port */}
      <View className="mb-5">
        <Text className="mb-2 text-sm font-semibold text-foreground">Port</Text>
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="number-pad"
          editable={!isLoading}
          className="rounded-md border border-border bg-background px-3 py-2 text-base text-foreground"
          placeholder="80"
          value={esp32Port}
          onChangeText={setEsp32Port}
        />
      </View>

      {error ? <Text className="mb-3 text-sm text-destructive">{error}</Text> : null}

      {/* Save button */}
      <Button className="mb-3" disabled={isLoading || !hasChange} onPress={handleSave}>
        <Text>{isLoading ? 'Loading...' : 'Save Settings'}</Text>
      </Button>

      {statusMessage ? (
        <Text className="mb-4 text-sm text-green-600">{statusMessage}</Text>
      ) : null}

      {/* Divider */}
      <View className="my-4 h-px bg-border" />

      {/* Connection test */}
      <Text className="mb-2 text-sm font-semibold text-foreground">Connection Test</Text>
      <Text className="mb-1 text-xs text-muted-foreground">
        Current URL: {getESP32Url()}
      </Text>

      <Button
        className="mb-3"
        variant="outline"
        disabled={testing}
        onPress={handleTestConnection}>
        {testing ? (
          <View className="flex-row items-center gap-2">
            <ActivityIndicator size="small" />
            <Text>Testing...</Text>
          </View>
        ) : (
          <Text>Test Connection</Text>
        )}
      </Button>

      <Text className={`text-sm font-medium ${statusColor}`}>{statusText}</Text>

      {testResult === 'offline' && (
        <View className="mt-3 rounded-lg bg-red-50 p-3 dark:bg-red-900/20">
          <Text className="text-xs text-red-700 dark:text-red-400">
            Make sure:{'\n'}
            • ESP32 is powered on{'\n'}
            • ESP32 and phone are on the same WiFi{'\n'}
            • IP address matches what OLED shows{'\n'}
            • Port 80 is correct (default)
          </Text>
        </View>
      )}
    </ScrollView>
  );
}
