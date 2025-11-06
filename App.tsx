import React, { useState, useCallback, useEffect, useRef } from 'react';
import Button from './components/Button';
import Card from './components/Card';
import Slider from './components/Slider';
import Switch from './components/Switch';
import Badge from './components/Badge';
import ConnectionStatus from './components/ConnectionStatus';
import PresetButton from './components/PresetButton';
import { ToastProvider, useToast } from './components/Toast';
import Dialog from './components/Dialog';
import ScheduleDialog from './components/ScheduleDialog';
import SpectrumPresetButton from './components/SpectrumPresetButton';
import {
  FishIcon,
  CalendarIcon,
  PowerIcon,
  Loader2Icon,
  CloudIcon,
  PaintbrushIcon,
  SunriseIcon,
  SunsetIcon,
} from './components/icons';
import { PRESETS, SPECTRUM_PRESETS, DEVICE_NAME, SERVICE_UUID, CHARACTERISTIC_UUID } from './constants';
import { MockBluetoothDevice, MockBluetoothRemoteGATTCharacteristic, Preset, Schedule, SpectrumPreset } from './types';
import { hslToRgb, rgbToHex, hexToRgb, rgbToHsl, calculateSpectrumColor } from './utils';
import { formatCommand } from './commandFormatter';

const LAST_DEVICE_ID_KEY = 'lastConnectedAquariumDeviceId';
const BRIDGE_CONFIG_KEY = 'aquariumBridgeConfig';
const DEVICE_ALIASES_KEY = 'aquariumDeviceAliases';
const SCHEDULES_KEY = 'aquariumSchedules';

const ColorPicker: React.FC<{ color: string; onChange: (color: string) => void; disabled?: boolean; }> = ({ color, onChange, disabled }) => {
  const [hsl, setHsl] = useState([0, 1, 0.5]);
  const saturationRef = useRef<HTMLDivElement>(null);
  const hueRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const rgb = hexToRgb(color);
    if (rgb) {
      setHsl(rgbToHsl(rgb.r, rgb.g, rgb.b));
    }
  }, [color]);

  const handleSaturationChange = useCallback((e: React.MouseEvent | MouseEvent) => {
    if (disabled || !saturationRef.current) return;
    const { width, height, left, top } = saturationRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(width, e.clientX - left));
    const y = Math.max(0, Math.min(height, e.clientY - top));
    const newS = x / width;
    const newL = 1 - y / height;
    const newHsl: [number, number, number] = [hsl[0], newS, newL];
    setHsl(newHsl);
    const [r, g, b] = hslToRgb(newHsl[0], newHsl[1], newHsl[2]);
    onChange(rgbToHex(r, g, b));
  }, [hsl, onChange, disabled]);
  
  const handleHueChange = useCallback((e: React.MouseEvent | MouseEvent) => {
    if (disabled || !hueRef.current) return;
    const { width, left } = hueRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(width, e.clientX - left));
    const newH = x / width;
    const newHsl: [number, number, number] = [newH, hsl[1], hsl[2]];
    setHsl(newHsl);
    const [r, g, b] = hslToRgb(newHsl[0], newHsl[1], newHsl[2]);
    onChange(rgbToHex(r, g, b));
  }, [hsl, onChange, disabled]);
  
  const createDragHandler = (handler: (e: MouseEvent) => void) => (e: React.MouseEvent) => {
    if(disabled) return;
    e.preventDefault();
    handler(e.nativeEvent);
    const onMouseMove = (moveEvent: MouseEvent) => handler(moveEvent);
    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const [h, s, l] = hsl;
  const saturationBg = `hsl(${h * 360}, 100%, 50%)`;
  const pickerX = s * 100;
  const pickerY = (1 - l) * 100;
  const huePickerX = h * 100;

  return (
    <div className={`space-y-4 ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}>
      <div
        ref={saturationRef}
        className="relative w-full h-40 rounded-lg cursor-pointer border border-white/10"
        style={{ backgroundColor: saturationBg }}
        onMouseDown={createDragHandler(handleSaturationChange)}
      >
        <div className="absolute inset-0" style={{ background: 'linear-gradient(to right, white, transparent)' }} />
        <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, black, transparent)' }} />
        <div
          className="absolute w-5 h-5 rounded-full border-2 border-white shadow-md transform -translate-x-1/2 -translate-y-1/2"
          style={{ left: `${pickerX}%`, top: `${pickerY}%` }}
        />
      </div>
      <div
        ref={hueRef}
        className="relative w-full h-5 rounded-full cursor-pointer border border-white/10"
        onMouseDown={createDragHandler(handleHueChange)}
        style={{ background: 'linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)'}}
      >
        <div
          className="absolute w-5 h-5 rounded-full border-2 border-white bg-white/30 shadow-md transform -translate-x-1/2 -translate-y-0"
          style={{ left: `${huePickerX}%`, top: `50%`, transform: `translate(-50%, -50%)` }}
        />
      </div>
    </div>
  );
};


const AquariumControlPage: React.FC = () => {
  const [device, setDevice] = useState<MockBluetoothDevice | null>(null);
  const [characteristic, setCharacteristic] = useState<MockBluetoothRemoteGATTCharacteristic | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isPowerOn, setIsPowerOn] = useState(false);
  const [brightness, setBrightness] = useState([75]);
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const [isScanModalOpen, setIsScanModalOpen] = useState(false);
  const [scannedDevices, setScannedDevices] = useState<MockBluetoothDevice[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [isDisconnectConfirmOpen, setIsDisconnectConfirmOpen] = useState(false);
  const { addToast } = useToast();

  const [isBridgeModeEnabled, setIsBridgeModeEnabled] = useState(false);
  const [bridgeServerUrl, setBridgeServerUrl] = useState('');
  const [bridgeApiKey, setBridgeApiKey] = useState('');
  const [bridgeStatus, setBridgeStatus] = useState<'inactive' | 'connecting' | 'active' | 'error'>('inactive');

  const [customColorMode, setCustomColorMode] = useState<'solid' | 'gradient' | 'spectrum'>('solid');
  const [solidColor, setSolidColor] = useState('#3b82f6');
  const [gradientStart, setGradientStart] = useState('#fb923c');
  const [gradientEnd, setGradientEnd] = useState('#f472b6');
  const [spectrumValues, setSpectrumValues] = useState({
    red: 100,
    green: 80,
    blue: 90,
    white: 50,
    uv: 25,
  });
  
  const [hexInputValue, setHexInputValue] = useState(solidColor);

  const [isDeviceSettingsModalOpen, setIsDeviceSettingsModalOpen] = useState(false);
  const [deviceAliases, setDeviceAliases] = useState<{ [key: string]: string }>({});
  const [currentDeviceAlias, setCurrentDeviceAlias] = useState('');

  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('controls');
  const [gradientDuration, setGradientDuration] = useState(30);

  const scanRef = useRef<any>(null);
  const socketRef = useRef<WebSocket | null>(null);
  
  const tabs = [
    { id: 'controls', label: 'Controls' },
    { id: 'custom', label: 'Custom Color' },
    { id: 'schedules', label: 'Schedules' },
    { id: 'bridge', label: 'Bridge' },
  ];

  useEffect(() => {
    setHexInputValue(solidColor);
  }, [solidColor]);

  const handleHexInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setHexInputValue(e.target.value);
  };

  const handleHexInputBlur = () => {
    const newColor = hexInputValue.startsWith('#') ? hexInputValue : `#${hexInputValue}`;
    if (/^#([a-f\d]{6})$/i.test(newColor)) {
      setSolidColor(newColor.toLowerCase());
    } else {
      setHexInputValue(solidColor);
      addToast('Invalid HEX code. Must be #RRGGBB format.', 'error');
    }
  };

  useEffect(() => {
    try {
      const savedConfig = localStorage.getItem(BRIDGE_CONFIG_KEY);
      if (savedConfig) {
        const { isEnabled, serverUrl, apiKey } = JSON.parse(savedConfig);
        setIsBridgeModeEnabled(isEnabled ?? false);
        setBridgeServerUrl(serverUrl ?? '');
        setBridgeApiKey(apiKey ?? '');
      }
      const savedAliases = localStorage.getItem(DEVICE_ALIASES_KEY);
      if (savedAliases) {
        setDeviceAliases(JSON.parse(savedAliases));
      }
      const savedSchedules = localStorage.getItem(SCHEDULES_KEY);
      if (savedSchedules) {
        setSchedules(JSON.parse(savedSchedules));
      }
    } catch (error) {
      console.error("Failed to load config from localStorage", error);
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(SCHEDULES_KEY, JSON.stringify(schedules));
    } catch (error) {
      console.error("Failed to save schedules to localStorage", error);
    }
  }, [schedules]);

  const handleDisconnect = useCallback(() => {
    setIsConnected(false);
    setDevice(null);
    setCharacteristic(null);
    addToast('Disconnected from device', 'info');
  }, [addToast]);
  
  const connectToSelectedDevice = useCallback(async (selectedDevice: MockBluetoothDevice) => {
      if (!selectedDevice) return;

      setIsConnecting(true);
      addToast(`Connecting to ${selectedDevice.name || 'device'}...`, 'info');

      try {
        if (!selectedDevice.gatt) {
          throw new Error('GATT server not available on this device.');
        }

        const server = await selectedDevice.gatt.connect();
        const service = await server.getPrimaryService(SERVICE_UUID.toLowerCase());
        const char = await service.getCharacteristic(CHARACTERISTIC_UUID.toLowerCase());

        setDevice(selectedDevice);
        setCharacteristic(char);
        setIsConnected(true);
        localStorage.setItem(LAST_DEVICE_ID_KEY, selectedDevice.id);
        addToast(`Connected to ${selectedDevice.name || 'device'}`, 'success');

        selectedDevice.addEventListener('gattserverdisconnected', handleDisconnect);
      } catch (error) {
        let errorMessage = 'Failed to connect. Please try again.';
        if (error instanceof Error) {
            errorMessage = error.message;
        }
        addToast(errorMessage, 'error');
      } finally {
        setIsConnecting(false);
        setIsScanModalOpen(false);
      }
  }, [addToast, handleDisconnect]);

  const attemptReconnect = useCallback(async () => {
    const lastDeviceId = localStorage.getItem(LAST_DEVICE_ID_KEY);
    if (!lastDeviceId || !navigator.bluetooth?.getDevices) {
      return;
    }

    addToast('Searching for last device...', 'info');
    setIsConnecting(true);

    try {
      const permittedDevices = await navigator.bluetooth.getDevices();
      const lastDevice = permittedDevices.find(d => d.id === lastDeviceId);

      if (!lastDevice) {
        addToast('Last device not found in permitted list.', 'info');
        return;
      }
      
      await connectToSelectedDevice(lastDevice);

    } catch (error) {
      addToast('Could not reconnect to the last device.', 'error');
    } finally {
      setIsConnecting(false);
    }
  }, [addToast, connectToSelectedDevice]);

  useEffect(() => {
    attemptReconnect();
  }, [attemptReconnect]);
  
  const handleAdvertisement = (event: { device: MockBluetoothDevice }) => {
    setScannedDevices(prevDevices => {
      const deviceExists = prevDevices.some(d => d.id === event.device.id);
      if (!deviceExists) {
        return [...prevDevices, event.device];
      }
      return prevDevices;
    });
  };

  const stopScan = useCallback(() => {
    if (scanRef.current) {
      scanRef.current.stop();
      scanRef.current = null;
    }
    if (navigator.bluetooth?.removeEventListener) {
      navigator.bluetooth.removeEventListener('advertisementreceived', handleAdvertisement);
    }
    setIsScanning(false);
  }, []);

  const manualConnect = async () => {
    try {
      const DFU_SERVICE_UUID = '4169726f-6861-4446-5553-657276696365';
      const bluetoothDevice = await navigator.bluetooth.requestDevice({
        filters: [
          { services: [SERVICE_UUID.toLowerCase()] },
          { name: DEVICE_NAME }
        ],
        optionalServices: [SERVICE_UUID.toLowerCase(), DFU_SERVICE_UUID]
      });
      await connectToSelectedDevice(bluetoothDevice);
    } catch (error) {
       let errorMessage = 'Failed to connect. Please try again.';
      if (error instanceof Error) {
        if (error.name === 'NotFoundError') {
          errorMessage = 'No device selected or found. Please try again.';
        } else if (error.name === 'SecurityError') {
          errorMessage = 'Bluetooth permission denied. Please allow access.';
        } else {
            errorMessage = error.message;
        }
      }
      addToast(errorMessage, 'error');
      setIsConnecting(false);
    }
  };

  const startScan = async () => {
    if (!navigator.bluetooth) {
      addToast('Bluetooth not supported. Please use a compatible browser.', 'error');
      return;
    }

    if (!navigator.bluetooth.requestLEScan) {
      addToast('Device scanning not supported. Using default chooser.', 'info');
      await manualConnect();
      return;
    }

    setIsScanModalOpen(true);
    setIsScanning(true);
    setScannedDevices([]);

    try {
      const scan = await navigator.bluetooth.requestLEScan({
        filters: [
          { services: [SERVICE_UUID.toLowerCase()] },
          { name: DEVICE_NAME }
        ],
      });
      scanRef.current = scan;
      navigator.bluetooth.addEventListener('advertisementreceived', handleAdvertisement);
      
      setTimeout(() => {
        if(scanRef.current){
           stopScan();
           addToast('Scan finished.', 'info');
        }
      }, 15000); 

    } catch (error) {
       addToast('Could not start device scan.', 'error');
       setIsScanning(false);
    }
  };
  
  const onSelectDevice = (selectedDevice: MockBluetoothDevice) => {
    stopScan();
    connectToSelectedDevice(selectedDevice);
  };
  
  const sendCommand = useCallback(async (command: string) => {
    if (!characteristic || !isConnected) {
      addToast('Not connected to device', 'error');
      return;
    }
  
    const dataBuffer = formatCommand(command);
  
    if (dataBuffer.byteLength === 0) {
      console.warn('Skipping empty command buffer');
      return;
    }
  
    try {
      await characteristic.writeValueWithoutResponse(dataBuffer);
      console.log('Command sent:', command, dataBuffer);
    } catch (error) {
      console.error('Command error:', error);
      addToast('Failed to send command', 'error');
    }
  }, [characteristic, isConnected, addToast]);
  
  useEffect(() => {
    if (isBridgeModeEnabled && isConnected && bridgeServerUrl) {
        setBridgeStatus('connecting');
        addToast('Bridge connecting...', 'info');

        const socket = new WebSocket(bridgeServerUrl);
        socketRef.current = socket;

        socket.onopen = () => {
            setBridgeStatus('active');
            addToast('Bridge connection active', 'success');
            if (bridgeApiKey) {
                socket.send(JSON.stringify({ type: 'auth', apiKey: bridgeApiKey, deviceId: device?.id }));
            }
        };

        socket.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.command) {
                    console.log('Received command from bridge:', data.command);
                    addToast(`Command received: ${data.command}`, 'info');
                    sendCommand(data.command);
                }
            } catch (error) {
                console.error('Error parsing bridge message:', error);
            }
        };

        socket.onerror = (error) => {
            console.error('Bridge WebSocket error:', error);
            setBridgeStatus('error');
            addToast('Bridge connection error', 'error');
        };

        socket.onclose = () => {
            setBridgeStatus('inactive');
            if (socketRef.current) {
               addToast('Bridge connection closed', 'info');
            }
            socketRef.current = null;
        };

    } else {
        if (socketRef.current) {
            socketRef.current.close();
            socketRef.current = null;
            setBridgeStatus('inactive');
        }
    }

    return () => {
        if (socketRef.current) {
            socketRef.current.close();
            socketRef.current = null;
        }
    };
  }, [isBridgeModeEnabled, isConnected, bridgeServerUrl, bridgeApiKey, addToast, sendCommand, device?.id]);

  const handlePowerToggle = useCallback(async (checked: boolean) => {
    setIsPowerOn(checked);
    await sendCommand(checked ? 'POWER_ON' : 'POWER_OFF');
    addToast(checked ? 'Light turned on' : 'Light turned off', 'success');
  }, [sendCommand, addToast]);

  const handleBrightnessChange = useCallback(async (value: number[]) => {
    setBrightness(value);
    await sendCommand(`BRIGHTNESS:${value[0]}`);
  }, [sendCommand]);

  const handlePresetSelect = useCallback(async (preset: Preset) => {
    setActivePreset(preset.id);
    await sendCommand(`PRESET:${preset.id.toUpperCase()}`);
    addToast(`${preset.name} preset activated`, 'success');
  }, [sendCommand, addToast]);
  
  const handleSpectrumChange = useCallback((channel: keyof typeof spectrumValues, value: number) => {
    setSpectrumValues(prev => ({ ...prev, [channel]: value }));
  }, []);

  const handleSelectSpectrumPreset = useCallback((preset: SpectrumPreset) => {
    setSpectrumValues(preset.values);
    addToast(`${preset.name} spectrum preset selected.`, 'info');
  }, [addToast]);

  const handleApplyCustomColor = useCallback(async () => {
    let command = '';
    let toastMessage = 'Custom lighting applied';
    if (customColorMode === 'solid') {
      command = `COLOR_HEX:${solidColor.substring(1)}`;
    } else if (customColorMode === 'gradient') {
      command = `GRADIENT_HEX:${gradientStart.substring(1)}:${gradientEnd.substring(1)}`;
    } else if (customColorMode === 'spectrum') {
      const { red, green, blue, white, uv } = spectrumValues;
      command = `SPECTRUM:${red}:${green}:${blue}:${white}:${uv}`;
      toastMessage = 'Spectrum settings applied';
    }

    if (command) {
      setActivePreset(null);
      await sendCommand(command);
      addToast(toastMessage, 'success');
    }
  }, [customColorMode, solidColor, gradientStart, gradientEnd, spectrumValues, sendCommand, addToast]);

  const handleStartSunrise = useCallback(async () => {
    setActivePreset(null);
    await sendCommand(`SUNRISE:${gradientDuration}`);
    addToast(`Sunrise effect started (${gradientDuration} min)`, 'success');
  }, [sendCommand, addToast, gradientDuration]);

  const handleStartSunset = useCallback(async () => {
    setActivePreset(null);
    await sendCommand(`SUNSET:${gradientDuration}`);
    addToast(`Sunset effect started (${gradientDuration} min)`, 'success');
  }, [sendCommand, addToast, gradientDuration]);

  const requestDisconnect = () => {
    setIsDisconnectConfirmOpen(true);
  };

  const confirmDisconnect = () => {
    setIsDisconnectConfirmOpen(false);
    if (device?.gatt?.connected) {
      localStorage.removeItem(LAST_DEVICE_ID_KEY);
      device.gatt.disconnect();
    }
  };

  const handleSaveBridgeConfig = () => {
    try {
      const config = {
        isEnabled: isBridgeModeEnabled,
        serverUrl: bridgeServerUrl,
        apiKey: bridgeApiKey,
      };
      localStorage.setItem(BRIDGE_CONFIG_KEY, JSON.stringify(config));
      addToast('Bridge configuration saved!', 'success');
    } catch (error) {
      addToast('Failed to save bridge configuration.', 'error');
    }
  };

  const handleBridgeToggle = (enabled: boolean) => {
    setIsBridgeModeEnabled(enabled);
    try {
      const config = {
        isEnabled: enabled,
        serverUrl: bridgeServerUrl,
        apiKey: bridgeApiKey,
      };
      localStorage.setItem(BRIDGE_CONFIG_KEY, JSON.stringify(config));
    } catch (error) {
      console.error("Failed to save bridge enabled state", error);
    }
  };

  const handleOpenDeviceSettings = () => {
    if (!device) return;
    setCurrentDeviceAlias(deviceAliases[device.id] || device.name || '');
    setIsDeviceSettingsModalOpen(true);
  };

  const handleSaveDeviceSettings = () => {
    if (!device) return;
    const newAliases = { ...deviceAliases, [device.id]: currentDeviceAlias };
    setDeviceAliases(newAliases);
    try {
      localStorage.setItem(DEVICE_ALIASES_KEY, JSON.stringify(newAliases));
      addToast('Device settings saved', 'success');
    } catch (error) {
      addToast('Failed to save settings', 'error');
    }
    setIsDeviceSettingsModalOpen(false);
  };

  const handleSyncSchedules = useCallback(async () => {
    addToast('Syncing schedules with device...', 'info');
    await sendCommand('SCHEDULE_CLEAR');
    await new Promise(resolve => setTimeout(resolve, 100)); // Wait for device to process clear

    for (const [index, schedule] of schedules.entries()) {
        const { enabled, startTime, endTime, days, action } = schedule;
        const daysStr = days.map(d => d ? '1' : '0').join('');
        const command = `SCHEDULE_ADD:${index}:${enabled ? 1 : 0}:${startTime}:${endTime}:${daysStr}:${action.type}:${action.value}`;
        await sendCommand(command);
        await new Promise(resolve => setTimeout(resolve, 50)); // Small delay between commands
    }
    addToast('Schedules synced successfully!', 'success');
    setIsScheduleModalOpen(false);
  }, [schedules, sendCommand, addToast]);

  const displayedDeviceName = (device && deviceAliases[device.id]) || device?.name;

  const isSpectrumPresetActive = (preset: SpectrumPreset) => {
    return (
      preset.values.red === spectrumValues.red &&
      preset.values.green === spectrumValues.green &&
      preset.values.blue === spectrumValues.blue &&
      preset.values.white === spectrumValues.white &&
      preset.values.uv === spectrumValues.uv
    );
  };

  const SpectrumSlider: React.FC<{
    channel: string;
    value: number;
    onChange: (channel: any, value: number) => void;
    trackClassName: string;
    disabled: boolean;
  }> = ({ channel, value, onChange, trackClassName, disabled }) => (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <label className="font-semibold text-white capitalize">{channel}</label>
        <Badge variant="outline">{value}%</Badge>
      </div>
      <Slider
        value={[value]}
        onValueChange={([newValue]) => onChange(channel, newValue)}
        max={100}
        step={1}
        trackClassName={trackClassName}
        disabled={disabled}
      />
    </div>
  );

  return (
    <>
      <div className="min-h-screen p-4 md:p-8 flex items-center justify-center">
        <div className="max-w-2xl w-full mx-auto space-y-6">
          <div className="text-center space-y-2">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 mb-4">
              <FishIcon className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-3xl sm:text-4xl font-bold text-white tracking-tight">Aquarium Light</h1>
            <p className="text-gray-400">Control your AQ-S lighting system</p>
          </div>

          <Card className="p-6">
            <ConnectionStatus
              isConnected={isConnected}
              isConnecting={isConnecting}
              onConnect={startScan}
              onDisconnect={requestDisconnect}
              onOpenSettings={handleOpenDeviceSettings}
              deviceName={displayedDeviceName}
            />
          </Card>
          
          <div>
            <div className="border-b border-[#30363D]">
              <nav className="-mb-px flex space-x-6" aria-label="Tabs">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`whitespace-nowrap py-4 px-1 border-b-2 text-sm font-medium transition-colors ${
                      activeTab === tab.id
                        ? 'border-purple-500 text-purple-400'
                        : 'border-transparent text-gray-400 hover:text-gray-200 hover:border-gray-500'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </nav>
            </div>

            <div className="pt-6">
              {activeTab === 'controls' && (
                <div className="space-y-6">
                  <Card className="p-6 space-y-6">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <PowerIcon className="w-6 h-6 text-white" />
                        <h3 className="text-lg font-semibold text-white">Master Power</h3>
                      </div>
                      <Switch checked={isPowerOn} onCheckedChange={handlePowerToggle} disabled={!isConnected} />
                    </div>

                    <div className="space-y-4 pt-2">
                      <div className="flex items-center justify-between">
                        <label className="text-lg font-semibold text-white">Master Brightness</label>
                        <Badge variant="outline">{brightness[0]}%</Badge>
                      </div>
                      <div className="space-y-2 pt-2">
                        <Slider value={brightness} onValueChange={handleBrightnessChange} max={100} step={1} disabled={!isConnected || !isPowerOn} className="w-full" />
                        <div className="flex justify-between text-xs text-gray-400">
                          <span>0%</span>
                          <span>50%</span>
                          <span>100%</span>
                        </div>
                      </div>
                    </div>

                    <div className="pt-2">
                      <h3 className="text-xl font-semibold text-white mb-4">Lighting Presets</h3>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                        {PRESETS.map((preset) => (
                          <PresetButton key={preset.id} preset={preset} isActive={activePreset === preset.id} isDisabled={!isConnected || !isPowerOn} onClick={() => handlePresetSelect(preset)} />
                        ))}
                      </div>
                    </div>
                  </Card>
                  
                   <Card className="p-6 space-y-6">
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="text-lg font-semibold text-white">Sunrise & Sunset Simulation</h3>
                        <Badge variant="outline">{gradientDuration} min</Badge>
                      </div>
                      <p className="text-sm text-gray-400">
                        Simulate a natural lighting cycle. The light will gradually change over the selected duration.
                      </p>
                      <Slider
                        value={[gradientDuration]}
                        onValueChange={(value) => setGradientDuration(value[0])}
                        min={5}
                        max={60}
                        step={5}
                        disabled={!isConnected || !isPowerOn}
                      />
                      <div className="flex justify-between text-xs text-gray-400">
                        <span>5 min</span>
                        <span>60 min</span>
                      </div>
                    </div>
                    <div
                      className="w-full h-10 rounded-lg border border-white/10"
                      style={{
                        background: 'linear-gradient(to right, #1e293b, #f97316, #fde047, #60a5fa, #1e293b)'
                      }}
                      aria-label="Sunrise/Sunset Color Preview"
                    />
                    <div className="grid grid-cols-2 gap-4 pt-2">
                      <Button onClick={handleStartSunrise} disabled={!isConnected || !isPowerOn} variant="outline">
                        <SunriseIcon className="w-4 h-4 mr-2"/>
                        Start Sunrise
                      </Button>
                      <Button onClick={handleStartSunset} disabled={!isConnected || !isPowerOn} variant="outline">
                        <SunsetIcon className="w-4 h-4 mr-2"/>
                        Start Sunset
                      </Button>
                    </div>
                  </Card>
                </div>
              )}
              {activeTab === 'custom' && (
                <Card className="p-6 space-y-6">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <PaintbrushIcon className="w-6 h-6 text-white" />
                      <h3 className="text-lg font-semibold text-white">Custom Color</h3>
                    </div>
                    <div className="flex items-center p-1 rounded-lg bg-[#0D1117] border border-[#30363D] self-stretch sm:self-center">
                      <Button
                        variant={customColorMode === 'solid' ? 'default' : 'ghost'}
                        size="sm"
                        onClick={() => setCustomColorMode('solid')}
                        className={`w-full ${customColorMode === 'solid' ? 'shadow-md shadow-purple-500/20' : ''}`}
                      >
                        Solid
                      </Button>
                      <Button
                        variant={customColorMode === 'gradient' ? 'default' : 'ghost'}
                        size="sm"
                        onClick={() => setCustomColorMode('gradient')}
                        className={`w-full ${customColorMode === 'gradient' ? 'shadow-md shadow-purple-500/20' : ''}`}
                      >
                        Gradient
                      </Button>
                      <Button
                        variant={customColorMode === 'spectrum' ? 'default' : 'ghost'}
                        size="sm"
                        onClick={() => setCustomColorMode('spectrum')}
                        className={`w-full ${customColorMode === 'spectrum' ? 'shadow-md shadow-purple-500/20' : ''}`}
                      >
                        Spectrum
                      </Button>
                    </div>
                  </div>
                  
                  <div className="space-y-4 pt-2">
                    {customColorMode === 'solid' ? (
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <label className="font-semibold text-white">
                            Color
                          </label>
                          <div className="flex items-center gap-2 rounded-lg bg-[#0D1117] border border-[#30363D] px-3 py-1.5 focus-within:ring-2 focus-within:ring-purple-500">
                            <div className="w-6 h-6 rounded-md border border-white/10" style={{ backgroundColor: solidColor }}></div>
                            <input
                              type="text"
                              value={hexInputValue}
                              onChange={handleHexInputChange}
                              onBlur={handleHexInputBlur}
                              onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                              className="w-24 bg-transparent text-sm text-gray-300 uppercase font-mono focus:outline-none"
                              disabled={!isConnected || !isPowerOn}
                              aria-label="Solid Color Hex Input"
                            />
                          </div>
                        </div>
                        <ColorPicker color={solidColor} onChange={setSolidColor} disabled={!isConnected || !isPowerOn} />
                      </div>
                    ) : customColorMode === 'gradient' ? (
                      <div className="grid gap-6 grid-cols-1 sm:grid-cols-2">
                        <div className="flex items-center gap-3">
                          <input
                            id="color1"
                            type="color"
                            value={gradientStart}
                            onChange={(e) => setGradientStart(e.target.value)}
                            className="w-12 h-12 bg-transparent border-none rounded-md cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                            disabled={!isConnected || !isPowerOn}
                            aria-label="Start Color"
                          />
                          <div>
                            <label htmlFor="color1" className="font-semibold text-white">
                              Start
                            </label>
                            <p className="text-sm text-gray-400 uppercase">
                              {gradientStart}
                            </p>
                          </div>
                        </div>
                         <div className="flex items-center gap-3">
                          <input
                            id="color2"
                            type="color"
                            value={gradientEnd}
                            onChange={(e) => setGradientEnd(e.target.value)}
                            className="w-12 h-12 bg-transparent border-none rounded-md cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                            disabled={!isConnected || !isPowerOn}
                            aria-label="End Color"
                          />
                          <div>
                            <label htmlFor="color2" className="font-semibold text-white">
                              End
                            </label>
                            <p className="text-sm text-gray-400 uppercase">
                              {gradientEnd}
                            </p>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-6">
                        <div className="space-y-4 pt-2 border-t border-white/10">
                          <h4 className="text-md font-semibold text-white">Spectrum Presets</h4>
                          <div className="grid grid-cols-3 gap-3">
                            {SPECTRUM_PRESETS.map(preset => (
                              <SpectrumPresetButton
                                key={preset.id}
                                preset={preset}
                                isActive={isSpectrumPresetActive(preset)}
                                onClick={() => handleSelectSpectrumPreset(preset)}
                                isDisabled={!isConnected || !isPowerOn}
                              />
                            ))}
                          </div>
                        </div>
                        <div className="space-y-6 pt-6 border-t border-white/10">
                          <SpectrumSlider channel="red" value={spectrumValues.red} onChange={handleSpectrumChange} trackClassName="bg-red-500" disabled={!isConnected || !isPowerOn} />
                          <SpectrumSlider channel="green" value={spectrumValues.green} onChange={handleSpectrumChange} trackClassName="bg-green-500" disabled={!isConnected || !isPowerOn} />
                          <SpectrumSlider channel="blue" value={spectrumValues.blue} onChange={handleSpectrumChange} trackClassName="bg-blue-500" disabled={!isConnected || !isPowerOn} />
                          <SpectrumSlider channel="white" value={spectrumValues.white} onChange={handleSpectrumChange} trackClassName="bg-gray-200" disabled={!isConnected || !isPowerOn} />
                          <SpectrumSlider channel="uv" value={spectrumValues.uv} onChange={handleSpectrumChange} trackClassName="bg-violet-500" disabled={!isConnected || !isPowerOn} />
                        </div>
                      </div>
                    )}
                  </div>

                  <div
                      className="w-full h-10 rounded-lg border border-white/10"
                      style={{
                        background: customColorMode === 'solid'
                          ? solidColor
                          : customColorMode === 'gradient'
                          ? `linear-gradient(to right, ${gradientStart}, ${gradientEnd})`
                          : calculateSpectrumColor(spectrumValues)
                      }}
                      aria-label="Color Preview"
                    ></div>

                  <div className="pt-2">
                      <Button onClick={handleApplyCustomColor} disabled={!isConnected || !isPowerOn} className="w-full">
                          {customColorMode === 'spectrum' ? 'Apply Spectrum' : 'Apply Custom Color'}
                      </Button>
                  </div>
                </Card>
              )}
              {activeTab === 'schedules' && (
                <Card className="p-6">
                   <p className="text-gray-400 mb-4 text-center">Set up automated lighting schedules for different times and days to simulate a natural environment.</p>
                  <Button variant="outline" className="w-full" onClick={() => setIsScheduleModalOpen(true)}>
                    <CalendarIcon className="w-4 h-4 mr-2" /> Manage Schedules
                  </Button>
                </Card>
              )}
              {activeTab === 'bridge' && (
                <Card className="p-6 space-y-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <CloudIcon className="w-6 h-6 text-white" />
                      <h3 className="text-lg font-semibold text-white">Bridge Mode</h3>
                    </div>
                    <Switch
                      checked={isBridgeModeEnabled}
                      onCheckedChange={handleBridgeToggle}
                      disabled={!isConnected || !bridgeServerUrl}
                    />
                  </div>
                  <p className="text-sm text-gray-400 -mt-2">
                    Control your light remotely. This device will act as a bridge, staying connected to the light and listening for commands from the server.
                  </p>

                  <div className="space-y-4">
                    <div>
                      <label htmlFor="serverUrl" className="block text-sm font-medium text-gray-300 mb-2">
                        Server URL
                      </label>
                      <input
                        id="serverUrl"
                        type="text"
                        className="w-full px-3 py-2 bg-[#0D1117] border border-[#30363D] rounded-md text-gray-300 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                        placeholder="wss://your-bridge-server.com"
                        value={bridgeServerUrl}
                        onChange={(e) => setBridgeServerUrl(e.target.value)}
                      />
                    </div>
                    <div>
                      <label htmlFor="apiKey" className="block text-sm font-medium text-gray-300 mb-2">
                        API Key
                      </label>
                      <input
                        id="apiKey"
                        type="password"
                        className="w-full px-3 py-2 bg-[#0D1117] border border-[#30363D] rounded-md text-gray-300 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                        placeholder="Enter your secret API key"
                        value={bridgeApiKey}
                        onChange={(e) => setBridgeApiKey(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-300">Status:</span>
                      <Badge variant={bridgeStatus === 'active' ? 'default' : 'outline'} className={
                          bridgeStatus === 'active' ? 'bg-green-600/50 border-green-500/50 text-green-300' :
                          bridgeStatus === 'error' ? 'bg-red-600/50 border-red-500/50 text-red-300' :
                          ''
                      }>
                        {bridgeStatus.charAt(0).toUpperCase() + bridgeStatus.slice(1)}
                      </Badge>
                    </div>
                    <Button onClick={handleSaveBridgeConfig} size="sm">
                      Save Config
                    </Button>
                  </div>
                </Card>
              )}
            </div>
          </div>
        </div>
      </div>
      <Dialog
        open={isScanModalOpen}
        onOpenChange={setIsScanModalOpen}
        title={
          <div className="flex items-center gap-2">
            {isScanning && <Loader2Icon className="w-5 h-5 animate-spin" />}
            {isScanning ? 'Scanning for Devices...' : 'Available Devices'}
          </div>
        }
        description="Select your AQ-S device from the list below, or connect manually."
      >
        <div className="mt-4 space-y-2 max-h-60 overflow-y-auto">
          {scannedDevices.length > 0 ? (
            scannedDevices.map((d) => (
              <button
                key={d.id}
                onClick={() => onSelectDevice(d)}
                className="w-full text-left p-3 bg-white/5 hover:bg-white/10 rounded-lg transition-colors"
              >
                {d.name || `Unnamed Device (${d.id.slice(0, 8)}...)`}
              </button>
            ))
          ) : (
            <div className="text-center text-slate-400 py-8">
              {isScanning ? 'Listening for advertisements...' : 'No devices found.'}
            </div>
          )}
        </div>
        <div className="mt-6 space-y-3">
           <Button
              variant="ghost"
              onClick={manualConnect}
              className="w-full"
            >
              Connect Manually
            </Button>
           <Button
              variant="outline"
              onClick={() => {
                stopScan();
                setIsScanModalOpen(false);
              }}
              className="w-full"
            >
              Cancel
            </Button>
        </div>
      </Dialog>
      <Dialog
        open={isDisconnectConfirmOpen}
        onOpenChange={setIsDisconnectConfirmOpen}
        title="Confirm Disconnection"
        description="Are you sure you want to disconnect? This will also clear the device for auto-reconnection."
      >
        <div className="mt-6 flex justify-end gap-3">
           <Button
              variant="outline"
              onClick={() => setIsDisconnectConfirmOpen(false)}
            >
              Cancel
            </Button>
            <Button
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={confirmDisconnect}
            >
              Disconnect
            </Button>
        </div>
      </Dialog>
      <Dialog
        open={isDeviceSettingsModalOpen}
        onOpenChange={setIsDeviceSettingsModalOpen}
        title="Device Settings"
        description={`Manage settings for ${displayedDeviceName || 'your device'}.`}
      >
        <div className="mt-4 space-y-6">
            <div className="space-y-2">
                <label htmlFor="deviceName" className="block text-sm font-medium text-gray-300">
                    Device Nickname
                </label>
                <input
                    id="deviceName"
                    type="text"
                    className="w-full px-3 py-2 bg-[#0D1117] border border-[#30363D] rounded-md text-gray-300 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                    placeholder="e.g., Living Room Light"
                    value={currentDeviceAlias}
                    onChange={(e) => setCurrentDeviceAlias(e.target.value)}
                />
            </div>
            <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-300">
                    Signal Strength
                </label>
                <Slider value={[80]} onValueChange={() => {}} max={100} step={1} disabled={true} />
                <p className="text-xs text-gray-500 pt-1">
                    This setting is not available for this device.
                </p>
            </div>
        </div>
        <div className="mt-8 flex justify-end gap-3">
            <Button
                variant="outline"
                onClick={() => setIsDeviceSettingsModalOpen(false)}
            >
                Cancel
            </Button>
            <Button
                onClick={handleSaveDeviceSettings}
            >
                Save Changes
            </Button>
        </div>
      </Dialog>
      <ScheduleDialog
        open={isScheduleModalOpen}
        onOpenChange={setIsScheduleModalOpen}
        schedules={schedules}
        onSchedulesChange={setSchedules}
        onSync={handleSyncSchedules}
        disabled={!isConnected}
      />
    </>
  );
};

export default function App() {
  return (
    <ToastProvider>
      <AquariumControlPage />
    </ToastProvider>
  );
}