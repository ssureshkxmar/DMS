import { useEffect, useMemo, useState } from 'react';
import { ScrollView, TextInput, View } from 'react-native';
import { Stack } from 'expo-router';
import { Text } from '@/components/ui/text';
import { Button } from '@/components/ui/button';
import { useSettings } from '../../../hooks/useSettings';

export default function ESP32SettingsScreen() {
  const { settings, isLoading, saveSettings } = useSettings();

  const [esp32Ip, setEsp32Ip] = useState('');
  const [esp32Port, setEsp32Port] = useState('');
  const [error, setError] = useState('');
  const [statusMessage, setStatusMessage] = useState('');

  useEffect(() => {
    setEsp32Ip(settings.esp32Ip);
    setEsp32Port(settings.esp32Port);
  }, [settings.esp32Ip, settings.esp32Port]);

  useEffect(() => {
    setStatusMessage('');
    setError('');
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

  return (
    <ScrollView className="flex-1 px-4 py-4" keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'ESP32 Device' }} />

      <Text className="mb-4 text-sm text-muted-foreground">
        Configure the IP address and port of your Suraksha ESP32 device. Make sure the phone and
        ESP32 are on the same WiFi network.
      </Text>

      <View className="mb-6">
        <Text className="mb-2 text-base font-semibold">ESP32 IP Address</Text>
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
      </View>

      <View className="mb-6">
        <Text className="mb-2 text-base font-semibold">ESP32 Port</Text>
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

      <Button className="mb-3" disabled={isLoading || !hasChange} onPress={handleSave}>
        <Text>{isLoading ? 'Loading...' : 'Save ESP32 Settings'}</Text>
      </Button>

      {statusMessage ? <Text className="text-sm text-foreground">{statusMessage}</Text> : null}
    </ScrollView>
  );
}
