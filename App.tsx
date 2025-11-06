

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { GoogleGenAI, Type } from '@google/genai';
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
  PaintbrushIcon,
  SunriseIcon,
  SunsetIcon,
  InfoIcon,
  AlertTriangleIcon,
  RefreshCwIcon,
  ClockIcon,
  WifiIcon,
  ServerIcon,
  ClipboardIcon,
  ClipboardCheckIcon,
  SparklesIcon,
  SunIcon,
  MoonIcon,
  ZapIcon,
} from './components/icons';
import { PRESETS, SPECTRUM_PRESETS, DEVICE_NAME, SERVICE_UUID, CHARACTERISTIC_UUID_NOTIFY, CHARACTERISTIC_UUID_WRITE } from './constants';
import { MockBluetoothDevice, MockBluetoothRemoteGATTCharacteristic, Preset, Schedule, SpectrumPreset } from './types';
import { hslToRgb, rgbToHex, hexToRgb, rgbToHsl, calculateSpectrumColor, debounce } from './utils';
import { formatCommand } from './commandFormatter';
import { parseDeviceResponse, DeviceState } from './responseParser';

const LAST_DEVICE_ID_KEY = 'lastConnectedAquariumDeviceId';
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
  // Bluetooth state
  const [device, setDevice] = useState<MockBluetoothDevice | null>(null);
  const [characteristic, setCharacteristic] = useState<MockBluetoothRemoteGATTCharacteristic | null>(null);
  const [notifyCharacteristic, setNotifyCharacteristic] = useState<MockBluetoothRemoteGATTCharacteristic | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);

  // Device control state
  const [isPowerOn, setIsPowerOn] = useState(false);
  const [brightness, setBrightness] = useState([75]);
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const [customColorMode, setCustomColorMode] = useState<'solid' | 'gradient' | 'spectrum'>('solid');
  const [solidColor, setSolidColor] = useState('#3b82f6');
  const [gradientStart, setGradientStart] = useState('#fb923c');
  const [gradientEnd, setGradientEnd] = useState('#f472b6');
  const [spectrumValues, setSpectrumValues] = useState({ red: 100, green: 80, blue: 90, white: 50, uv: 25 });
  const [gradientDuration, setGradientDuration] = useState(30);

  // UI State
  const [activeTab, setActiveTab] = useState('controls');
  const [isScanModalOpen, setIsScanModalOpen] = useState(false);
  const [scannedDevices, setScannedDevices] = useState<MockBluetoothDevice[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [isDisconnectConfirmOpen, setIsDisconnectConfirmOpen] = useState(false);
  const { addToast } = useToast();
  const [hexInputValue, setHexInputValue] = useState(solidColor);
  const [isDeviceSettingsModalOpen, setIsDeviceSettingsModalOpen] = useState(false);
  const [isFactoryResetConfirmOpen, setIsFactoryResetConfirmOpen] = useState(false);
  const scanRef = useRef<any>(null);
  
  // Bridge state (WebRTC)
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const [bridgeStatus, setBridgeStatus] = useState<'inactive' | 'generating' | 'waiting' | 'connecting' | 'connected' | 'error'>('inactive');
  const [isClientConnectedToBridge, setIsClientConnectedToBridge] = useState(false);
  const [bridgeOffer, setBridgeOffer] = useState('');
  const [bridgeAnswer, setBridgeAnswer] = useState('');
  const [isOfferCopied, setIsOfferCopied] = useState(false);
  const [isAnswerCopied, setIsAnswerCopied] = useState(false);

  // Device metadata state
  const [deviceAliases, setDeviceAliases] = useState<{ [key: string]: string }>({});
  const [deviceAliasInput, setDeviceAliasInput] = useState('');

  // Scheduling state
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [nextEvent, setNextEvent] = useState<{ time: Date; name: string } | null>(null);
  const [countdown, setCountdown] = useState('');
  
  // AI State
  const [aiPrompt, setAiPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [placeholderPrompt, setPlaceholderPrompt] = useState('');
  const placeholderPrompts = useRef([
    "Vibrant coral reef at sunset",
    "Misty morning in a deep forest",
    "Calm deep blue ocean trench",
    "Bright Amazon riverbed",
    "Lighting to make neon tetras pop",
  ]).current;

  useEffect(() => {
    setPlaceholderPrompt(placeholderPrompts[Math.floor(Math.random() * placeholderPrompts.length)]);
  }, []);


  const tabs = [
    { id: 'controls', label: 'Controls' },
    { id: 'custom', label: 'Custom Color' },
    { id: 'schedules', label: 'Schedules' },
    { id: 'bridge', label: 'Bridge' },
  ];
  
  const isControlDisabled = !isPowerOn || (!isConnected && !isClientConnectedToBridge);
  
  const updateAppState = (state: Partial<DeviceState>) => {
    console.log('Updating app state:', state);
    if (state.power !== undefined) setIsPowerOn(state.power);
    if (state.brightness !== undefined) setBrightness([state.brightness]);
    if (state.activePresetId !== undefined) setActivePreset(state.activePresetId);
    
    if (state.mode === 'solid' && state.solidColor) {
        setSolidColor(state.solidColor);
        setActivePreset(null);
        setCustomColorMode('solid');
    } else if (state.mode === 'spectrum' && state.spectrum) {
        setSpectrumValues(state.spectrum);
        setActivePreset(null);
        setCustomColorMode('spectrum');
    } else if (state.mode === 'preset') {
        setActivePreset(state.activePresetId);
    }
  };
  
  useEffect(() => {
    const intervalId = setInterval(() => {
      if (!schedules || schedules.length === 0) {
        setNextEvent(null);
        return;
      }

      const now = new Date();
      const currentDay = (now.getDay() + 6) % 7; // Monday = 0
      let closestEvent: { time: Date; name: string } | null = null;

      for (let i = 0; i < 7; i++) {
        const checkDay = (currentDay + i) % 7;
        const checkDate = new Date(now);
        checkDate.setDate(now.getDate() + i);

        const daySchedules = schedules
          .filter(s => s.enabled && s.days[checkDay])
          .flatMap(s => {
            const [startH, startM] = s.startTime.split(':').map(Number);
            const startDate = new Date(checkDate);
            startDate.setHours(startH, startM, 0, 0);

            const [endH, endM] = s.endTime.split(':').map(Number);
            const endDate = new Date(checkDate);
            endDate.setHours(endH, endM, 0, 0);
            
            return [
                { time: startDate, name: `Start: ${s.action.name}` },
                { time: endDate, name: `End: ${s.action.name}` },
            ];
          })
          .filter(e => e.time > now)
          .sort((a, b) => a.time.getTime() - b.time.getTime());

        if (daySchedules.length > 0) {
          closestEvent = daySchedules[0];
          break;
        }
      }
      setNextEvent(closestEvent);
    }, 1000);
    return () => clearInterval(intervalId);
  }, [schedules]);

  useEffect(() => {
    if (!nextEvent) {
      setCountdown('');
      return;
    }
    const intervalId = setInterval(() => {
      const now = new Date();
      const diff = nextEvent.time.getTime() - now.getTime();
      if (diff <= 0) {
        setCountdown('Now');
        return;
      }
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);
      setCountdown(
        `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
      );
    }, 1000);
    return () => clearInterval(intervalId);
  }, [nextEvent]);

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

  const sendCommand = useCallback(async (command: string) => {
    if (isClientConnectedToBridge && dataChannelRef.current?.readyState === 'open') {
      const message = JSON.stringify({ type: 'command', command });
      dataChannelRef.current.send(message);
      return;
    }
    
    if (!characteristic || !isConnected) {
      addToast('Not connected to a device.', 'error');
      return;
    }
  
    const dataBuffer = formatCommand(command);
  
    if (dataBuffer.byteLength === 0) {
      console.warn('Skipping empty command buffer');
      return;
    }
  
    try {
      await characteristic.writeValue(dataBuffer);
      console.log('Command sent via Bluetooth:', command);
    } catch (error) {
      console.error('Bluetooth command error:', error);
      addToast('Failed to send command', 'error');
    }
  }, [characteristic, isConnected, isClientConnectedToBridge, addToast]);

  const debouncedSendCommand = useRef(
    debounce((command: string) => {
        sendCommand(command);
    }, 250)
  ).current;

  const handleDeviceNotification = useCallback((event: any) => {
    const value = event.target.value;
    if (!value) return;
    
    const parsedState = parseDeviceResponse(value.buffer);

    if (parsedState) {
        updateAppState(parsedState);
        if (bridgeStatus === 'connected' && dataChannelRef.current?.readyState === 'open') {
          const message = JSON.stringify({ type: 'state_update', state: parsedState });
          dataChannelRef.current.send(message);
        }
    }
  }, [bridgeStatus]);

  const handleDisconnect = useCallback(() => {
    if(notifyCharacteristic) {
      notifyCharacteristic.removeEventListener('characteristicvaluechanged', handleDeviceNotification);
    }
    setIsConnected(false);
    setDevice(null);
    setCharacteristic(null);
    setNotifyCharacteristic(null);
    addToast('Disconnected from device', 'info');
  }, [addToast, notifyCharacteristic, handleDeviceNotification]);
  
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
      const notifyChar = await service.getCharacteristic(CHARACTERISTIC_UUID_NOTIFY.toLowerCase());
      const writeChar = await service.getCharacteristic(CHARACTERISTIC_UUID_WRITE.toLowerCase());
      
      await notifyChar.startNotifications();
      notifyChar.addEventListener('characteristicvaluechanged', handleDeviceNotification);
  
      setDevice(selectedDevice);
      setCharacteristic(writeChar);
      setNotifyCharacteristic(notifyChar);
      setIsConnected(true);
      localStorage.setItem(LAST_DEVICE_ID_KEY, selectedDevice.id);
      addToast(`Connected to ${selectedDevice.name || 'device'}`, 'success');
      
      selectedDevice.addEventListener('gattserverdisconnected', handleDisconnect);
  
      addToast('Syncing device state...', 'info');
      setTimeout(() => {
        const dataBuffer = formatCommand('REQUEST_STATE');
        if (dataBuffer.byteLength > 0) {
          writeChar.writeValue(dataBuffer);
        }
      }, 500);
  
    } catch (error) {
      let errorMessage = 'An unexpected error occurred. Please try again.';
      if (error instanceof Error) {
          console.error('Bluetooth connection error:', error.name, error.message);
          if (error.name === 'NotFoundError') {
              errorMessage = 'Device not found. It may be out of range or turned off.';
          } else if (error.name === 'NetworkError') {
              errorMessage = 'Connection failed. The device may have disconnected.';
          } else if (error.message.includes('GATT Service')) {
              errorMessage = 'Required Bluetooth service not found. Is this the correct device?';
          } else if (error.message.includes('GATT Characteristic')) {
              errorMessage = 'Required Bluetooth characteristic not found on this device.';
          } else if (error.message.includes('User cancelled')) {
              errorMessage = 'Connection process cancelled.';
          } else {
              errorMessage = `Connection failed. Please ensure device is on and in range.`;
          }
      }
      addToast(errorMessage, 'error');
      if (selectedDevice.gatt?.connected) {
        selectedDevice.gatt.disconnect();
      }
    } finally {
      setIsConnecting(false);
      setIsScanModalOpen(false);
    }
  }, [addToast, handleDisconnect, handleDeviceNotification]);

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
    if (!navigator.bluetooth) {
      addToast('Web Bluetooth is not supported on this browser or device.', 'error');
      return;
    }
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
          errorMessage = 'Bluetooth permission denied. Please allow access in your browser settings.';
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
      addToast('Bluetooth not supported on this browser. Use Bridge mode instead.', 'error');
      return;
    }

    if (!navigator.bluetooth.requestLEScan) {
      addToast('Device scanning not supported. Using default chooser.', 'info');
      await manualConnect();
      return;
    }

    setIsScanModalOpen(true);
    setIsScanning(true);
    
    try {
      const scan = await navigator.bluetooth.requestLEScan({
        filters: [{ services: [SERVICE_UUID.toLowerCase()] }],
        acceptAllAdvertisements: false,
      });
      scanRef.current = scan;
      navigator.bluetooth.addEventListener('advertisementreceived', handleAdvertisement);
    } catch (error) {
      addToast('Failed to start scan.', 'error');
      setIsScanning(false);
    }
  };
  
  const handleGenerateAiColor = async () => {
      if (!aiPrompt.trim()) {
          addToast('Please enter a description for the AI.', 'info');
          return;
      }

      setIsGenerating(true);
      addToast('✨ Asking the AI for a lighting idea...', 'info');

      try {
          const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

          const systemInstruction = `You are an expert lighting designer for high-end aquariums. Your task is to translate a user's descriptive prompt into specific lighting parameters for a 5-channel LED light (Red, Green, Blue, White, UV). You must return a single JSON object that conforms to the provided schema. You must choose the BEST lighting type (solid, gradient, or spectrum) to represent the user's prompt.
- Use 'spectrum' for complex, nuanced scenes like 'planted tank' or 'reef growth' where specific light frequencies are important.
- Use 'gradient' for dynamic scenes like 'sunrise' or 'sunset'.
- Use 'solid' for simple, single-mood prompts like 'calm blue'.
Ensure all color values are valid 6-digit hex codes starting with '#'. Ensure all spectrum values are integers between 0 and 100. Your response must be only the JSON object.`;

          const response = await ai.models.generateContent({
              model: 'gemini-2.5-flash',
              contents: aiPrompt,
              config: {
                  systemInstruction,
                  responseMimeType: 'application/json',
                  responseSchema: {
                      type: Type.OBJECT,
                      description: "Describes the lighting settings. Exactly one of 'solid', 'gradient', or 'spectrum' must be provided.",
                      properties: {
                          solid: {
                              type: Type.OBJECT,
                              nullable: true,
                              description: "A single solid color.",
                              properties: { color: { type: Type.STRING, description: "A 6-digit hex color code, e.g., '#3b82f6'." } }
                          },
                          gradient: {
                              type: Type.OBJECT,
                              nullable: true,
                              description: "A color gradient for dynamic scenes.",
                              properties: {
                                  start: { type: Type.STRING, description: "The starting 6-digit hex color code." },
                                  end: { type: Type.STRING, description: "The ending 6-digit hex color code." }
                              }
                          },
                          spectrum: {
                              type: Type.OBJECT,
                              nullable: true,
                              description: "A full 5-channel spectrum for complex biotopes.",
                              properties: {
                                  red: { type: Type.INTEGER, description: "Red channel (0-100)." },
                                  green: { type: Type.INTEGER, description: "Green channel (0-100)." },
                                  blue: { type: Type.INTEGER, description: "Blue channel (0-100)." },
                                  white: { type: Type.INTEGER, description: "White channel (0-100)." },
                                  uv: { type: Type.INTEGER, description: "UV channel (0-100)." }
                              },
                              required: ['red', 'green', 'blue', 'white', 'uv']
                          }
                      }
                  },
              },
          });

          const jsonText = response.text.trim();
          const result = JSON.parse(jsonText);

          if (result.solid && result.solid.color) {
              setCustomColorMode('solid');
              setSolidColor(result.solid.color);
              sendCommand(`COLOR_HEX:${result.solid.color.substring(1)}`);
              addToast('AI generated a solid color!', 'success');
          } else if (result.gradient && result.gradient.start && result.gradient.end) {
              setCustomColorMode('gradient');
              setGradientStart(result.gradient.start);
              setGradientEnd(result.gradient.end);
              sendCommand(`GRADIENT_HEX:${result.gradient.start.substring(1)}:${result.gradient.end.substring(1)}`);
              addToast('AI generated a gradient!', 'success');
          } else if (result.spectrum) {
              setCustomColorMode('spectrum');
              const newSpectrum = {
                  red: result.spectrum.red ?? 0,
                  green: result.spectrum.green ?? 0,
                  blue: result.spectrum.blue ?? 0,
                  white: result.spectrum.white ?? 0,
                  uv: result.spectrum.uv ?? 0,
              };
              setSpectrumValues(newSpectrum);
              sendCommand(`SPECTRUM:${newSpectrum.red}:${newSpectrum.green}:${newSpectrum.blue}:${newSpectrum.white}:${newSpectrum.uv}`);
              addToast('AI generated a custom spectrum!', 'success');
          } else {
              throw new Error("AI response was not in the expected format.");
          }

      } catch (error) {
          console.error('AI generation error:', error);
          addToast('AI failed to generate a color. Please try a different prompt.', 'error');
      } finally {
          setIsGenerating(false);
          setPlaceholderPrompt(placeholderPrompts[Math.floor(Math.random() * placeholderPrompts.length)]);
      }
  };

  useEffect(() => {
    if (isDeviceSettingsModalOpen && device) {
      setDeviceAliasInput(deviceAliases[device.id] || '');
    }
  }, [isDeviceSettingsModalOpen, device, deviceAliases]);

  const handleSaveAlias = () => {
    if (!device) return;
    const newAliases = { ...deviceAliases, [device.id]: deviceAliasInput };
    setDeviceAliases(newAliases);
    localStorage.setItem(DEVICE_ALIASES_KEY, JSON.stringify(newAliases));
    addToast('Device alias saved!', 'success');
  };
  
  const handleFastSetting = (setting: 'daylight' | 'evening' | 'nightlight' | 'off') => {
    if (!isConnected && !isClientConnectedToBridge) return;

    const sendSequentially = async (commands: string[]) => {
      for (const command of commands) {
        await sendCommand(command);
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    switch (setting) {
        case 'daylight':
            addToast('Setting Daylight mode...', 'info');
            setIsPowerOn(true);
            setActivePreset('clear');
            setBrightness([100]);
            sendSequentially(['POWER_ON', 'PRESET:clear', 'BRIGHTNESS:100']);
            break;
        case 'evening':
            addToast('Setting Evening mode...', 'info');
            setIsPowerOn(true);
            setActivePreset('sunrise');
            setBrightness([50]);
            sendSequentially(['POWER_ON', 'PRESET:sunrise', 'BRIGHTNESS:50']);
            break;
        case 'nightlight':
            addToast('Setting Nightlight mode...', 'info');
            setIsPowerOn(true);
            setActivePreset('deep');
            setBrightness([10]);
            sendSequentially(['POWER_ON', 'PRESET:deep', 'BRIGHTNESS:10']);
            break;
        case 'off':
            addToast('Turning lights off...', 'info');
            setIsPowerOn(false);
            sendCommand('POWER_OFF');
            break;
    }
  };
    
  return (
    <div className="min-h-screen bg-[#0D1117] text-gray-300">
      <div className="container mx-auto max-w-4xl p-4 sm:p-6 space-y-6">
        <header className="text-center space-y-2">
          <div className="flex items-center justify-center gap-3">
            <FishIcon className="w-8 h-8 text-purple-400" />
            <h1 className="text-3xl sm:text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-pink-500">
              Aquarium Light Controller
            </h1>
          </div>
          <p className="text-gray-400">Control your AQ-S aquarium light with ease.</p>
        </header>

        <main>
          <ConnectionStatus
            isConnected={isConnected || isClientConnectedToBridge}
            isConnecting={isConnecting}
            onConnect={manualConnect}
            onDisconnect={() => setIsDisconnectConfirmOpen(true)}
            onOpenSettings={() => setIsDeviceSettingsModalOpen(true)}
            deviceName={deviceAliases[device?.id || ''] || device?.name || (isClientConnectedToBridge ? 'Remote Client' : 'Unknown')}
          />

          <div className="mt-6">
            <div className="flex items-center justify-center border-b border-[#30363D]">
              {tabs.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-4 py-3 font-medium text-sm transition-colors ${
                    activeTab === tab.id
                      ? 'text-white border-b-2 border-purple-500'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="mt-6">
              {activeTab === 'controls' && (
                <div className="space-y-6">
                   <Card className="p-6">
                      <div className="flex items-center gap-3 mb-4">
                        <ZapIcon className="w-6 h-6 text-yellow-400"/>
                        <h3 className="text-xl font-semibold">Fast Settings</h3>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <Button variant="outline" onClick={() => handleFastSetting('daylight')} disabled={!isConnected && !isClientConnectedToBridge}>
                          <SunIcon className="w-5 h-5 mr-2" /> Daylight
                        </Button>
                        <Button variant="outline" onClick={() => handleFastSetting('evening')} disabled={!isConnected && !isClientConnectedToBridge}>
                          <SunsetIcon className="w-5 h-5 mr-2" /> Evening
                        </Button>
                        <Button variant="outline" onClick={() => handleFastSetting('nightlight')} disabled={!isConnected && !isClientConnectedToBridge}>
                          <MoonIcon className="w-5 h-5 mr-2" /> Nightlight
                        </Button>
                        <Button variant="outline" onClick={() => handleFastSetting('off')} disabled={!isConnected && !isClientConnectedToBridge} className="border-red-500/50 text-red-400 hover:bg-red-500/10 hover:text-red-300">
                          <PowerIcon className="w-5 h-5 mr-2" /> Off
                        </Button>
                      </div>
                    </Card>

                   <Card className="p-6">
                     <div className="flex items-center justify-between">
                       <div className="flex items-center gap-3">
                         <PowerIcon className="w-6 h-6"/>
                         <h3 className="text-xl font-semibold">Power & Brightness</h3>
                       </div>
                       <Switch 
                         checked={isPowerOn} 
                         onCheckedChange={(checked) => {
                            setIsPowerOn(checked);
                            sendCommand(checked ? 'POWER_ON' : 'POWER_OFF');
                         }}
                         disabled={!isConnected && !isClientConnectedToBridge}
                       />
                     </div>
                     <div className="mt-6 space-y-3">
                       <label htmlFor="brightness" className="text-sm font-medium">Brightness: {brightness[0]}%</label>
                       <Slider 
                         value={brightness} 
                         onValueChange={(val) => {
                            setBrightness(val);
                            debouncedSendCommand(`BRIGHTNESS:${val[0]}`);
                         }} 
                         max={100} 
                         step={1} 
                         disabled={isControlDisabled}
                       />
                     </div>
                   </Card>

                   <Card className="p-6">
                    <h3 className="text-xl font-semibold mb-4">Lighting Presets</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                      {PRESETS.map((preset) => (
                        <PresetButton
                          key={preset.id}
                          preset={preset}
                          isActive={activePreset === preset.id}
                          isDisabled={isControlDisabled}
                          onClick={() => {
                            setActivePreset(preset.id);
                            sendCommand(`PRESET:${preset.id}`);
                          }}
                        />
                      ))}
                    </div>
                  </Card>
                </div>
              )}
              
              {activeTab === 'custom' && (
                <div className="space-y-6">
                    <Card className="p-6">
                      <div className="flex items-center gap-3 mb-4">
                        <SparklesIcon className="w-6 h-6 text-purple-400" />
                        <h3 className="text-xl font-semibold text-white">AI Magic Color</h3>
                      </div>
                      <p className="text-gray-400 mb-4 text-sm">Describe a scene or mood, and let AI create a unique lighting preset for you.</p>
                      <div className="space-y-4">
                        <textarea
                          value={aiPrompt}
                          onChange={(e) => setAiPrompt(e.target.value)}
                          placeholder={`e.g., "${placeholderPrompt}"`}
                          disabled={isControlDisabled || isGenerating}
                          rows={3}
                          className="w-full p-3 bg-[#0D1117] border border-[#30363D] rounded-md resize-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-colors"
                          aria-label="AI prompt for color generation"
                        />
                        <Button
                          onClick={handleGenerateAiColor}
                          disabled={isControlDisabled || isGenerating}
                          className="w-full"
                        >
                          {isGenerating ? (
                            <>
                              <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
                              Generating...
                            </>
                          ) : (
                            'Generate with AI'
                          )}
                        </Button>
                      </div>
                    </Card>

                   <Card className="p-4">
                     <div className="flex items-center justify-around">
                       {(['solid', 'gradient', 'spectrum'] as const).map((mode) => (
                         <Button 
                           key={mode}
                           variant={customColorMode === mode ? 'default' : 'ghost'}
                           size="sm"
                           onClick={() => setCustomColorMode(mode)}
                           disabled={isControlDisabled}
                           className="capitalize w-full"
                         >
                           {mode}
                         </Button>
                       ))}
                     </div>
                   </Card>
                   
                   {customColorMode === 'solid' && (
                     <Card className="p-6">
                        <div className="flex justify-between items-center mb-4">
                         <h3 className="text-xl font-semibold">Solid Color</h3>
                         <div
                            className="w-8 h-8 rounded-full border-2 border-white/20"
                            style={{ backgroundColor: solidColor }}
                         />
                        </div>
                       <ColorPicker color={solidColor} onChange={(c) => {
                            setSolidColor(c);
                            debouncedSendCommand(`COLOR_HEX:${c.substring(1)}`);
                       }} disabled={isControlDisabled}/>
                       <div className="mt-4 flex items-center gap-2">
                         <input
                            type="text"
                            value={hexInputValue}
                            onChange={handleHexInputChange}
                            onBlur={handleHexInputBlur}
                            disabled={isControlDisabled}
                            className="w-full font-mono text-sm px-3 py-2 bg-[#0D1117] border border-[#30363D] rounded-md"
                         />
                         <Button variant="outline" onClick={() => {
                            sendCommand(`COLOR_HEX:${solidColor.substring(1)}`);
                            addToast('Color sent to device', 'success');
                         }} disabled={isControlDisabled}>
                           Apply
                         </Button>
                       </div>
                     </Card>
                   )}
                   
                   {customColorMode === 'gradient' && (
                     <Card className="p-6">
                       <h3 className="text-xl font-semibold mb-4">Gradient</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          <div>
                            <div className="flex justify-between items-center mb-2">
                                <label className="text-sm font-medium">Start Color</label>
                                <div className="w-6 h-6 rounded-full border border-white/20" style={{backgroundColor: gradientStart}}></div>
                            </div>
                            <ColorPicker color={gradientStart} onChange={(c) => {
                                setGradientStart(c);
                                debouncedSendCommand(`GRADIENT_HEX:${c.substring(1)}:${gradientEnd.substring(1)}`);
                            }} disabled={isControlDisabled}/>
                          </div>
                          <div>
                            <div className="flex justify-between items-center mb-2">
                                <label className="text-sm font-medium">End Color</label>
                                <div className="w-6 h-6 rounded-full border border-white/20" style={{backgroundColor: gradientEnd}}></div>
                            </div>
                            <ColorPicker color={gradientEnd} onChange={(c) => {
                                setGradientEnd(c);
                                debouncedSendCommand(`GRADIENT_HEX:${gradientStart.substring(1)}:${c.substring(1)}`);
                            }} disabled={isControlDisabled}/>
                          </div>
                        </div>
                        <div className="mt-6">
                            <label className="text-sm font-medium">Preview</label>
                            <div className="w-full h-10 rounded-lg mt-2" style={{background: `linear-gradient(to right, ${gradientStart}, ${gradientEnd})`}}/>
                        </div>
                        <div className="mt-6 flex justify-end">
                          <Button onClick={() => sendCommand(`GRADIENT_HEX:${gradientStart.substring(1)}:${gradientEnd.substring(1)}`)} disabled={isControlDisabled}>
                            Apply Gradient
                          </Button>
                        </div>
                     </Card>
                   )}
                   
                   {customColorMode === 'spectrum' && (
                     <Card className="p-6">
                       <div className="flex justify-between items-center mb-4">
                           <h3 className="text-xl font-semibold">5-Channel Spectrum</h3>
                           <div className="w-8 h-8 rounded-full border border-white/20" style={{backgroundColor: calculateSpectrumColor(spectrumValues)}} />
                       </div>
                       <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
                         {SPECTRUM_PRESETS.map(p => (
                            <SpectrumPresetButton 
                              key={p.id}
                              preset={p}
                              isActive={false} // This can be enhanced to detect if current values match a preset
                              isDisabled={isControlDisabled}
                              onClick={() => {
                                  setSpectrumValues(p.values);
                                  const {red, green, blue, white, uv} = p.values;
                                  sendCommand(`SPECTRUM:${red}:${green}:${blue}:${white}:${uv}`);
                              }}
                            />
                         ))}
                       </div>
                       <div className="space-y-6">
                        {(['red', 'green', 'blue', 'white', 'uv'] as const).map((channel, index) => {
                          const colors = ['bg-red-500', 'bg-green-500', 'bg-blue-500', 'bg-gray-200', 'bg-purple-500'];
                          return (
                            <div key={channel}>
                              <label className="text-sm font-medium capitalize flex justify-between">
                                <span>{channel}</span>
                                <span>{spectrumValues[channel]}%</span>
                              </label>
                              <Slider
                                value={[spectrumValues[channel]]}
                                onValueChange={(val) => {
                                  const newValues = { ...spectrumValues, [channel]: val[0] };
                                  setSpectrumValues(newValues);
                                  const {red, green, blue, white, uv} = newValues;
                                  debouncedSendCommand(`SPECTRUM:${red}:${green}:${blue}:${white}:${uv}`);
                                }}
                                max={100}
                                step={1}
                                disabled={isControlDisabled}
                                className="mt-2"
                                trackClassName={colors[index]}
                              />
                            </div>
                          );
                         })}
                       </div>
                     </Card>
                   )}
                </div>
              )}
              
              {activeTab === 'schedules' && (
                <div className="space-y-6">
                  <Card className="p-6">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                      <div>
                        <h3 className="text-xl font-semibold">Schedules & Automation</h3>
                        <p className="text-gray-400 text-sm mt-1">Automate your lighting throughout the day.</p>
                      </div>
                      <Button onClick={() => setIsScheduleModalOpen(true)}>
                        <CalendarIcon className="w-4 h-4 mr-2"/>
                        Manage Schedules
                      </Button>
                    </div>
                    {nextEvent && (
                      <div className="mt-6 p-4 rounded-lg bg-white/5 flex items-center gap-4">
                        <ClockIcon className="w-6 h-6 text-purple-400 flex-shrink-0" />
                        <div>
                          <p className="text-sm text-gray-400">Next Event: <span className="font-medium text-white">{nextEvent.name}</span></p>
                          <p className="text-lg font-semibold text-white tabular-nums">{countdown}</p>
                        </div>
                      </div>
                    )}
                  </Card>
                </div>
              )}
              
              {activeTab === 'bridge' && (
                 <Card className="p-6 space-y-4">
                   <div className="flex items-center gap-3">
                     <WifiIcon className="w-6 h-6"/>
                     <h3 className="text-xl font-semibold">Bridge Mode</h3>
                   </div>
                   <p className="text-gray-400 text-sm">
                     Use one device with Bluetooth as a "bridge" to control your light from another device on the same network without Bluetooth.
                   </p>
                   
                   <div className="p-4 rounded-lg bg-white/5 space-y-4">
                      <div className="flex items-center gap-3">
                         <ServerIcon className="w-5 h-5"/>
                         <h4 className="font-semibold">Become a Bridge (Host)</h4>
                      </div>
                      <p className="text-xs text-gray-400">
                        Requires an active Bluetooth connection to the light. Generate an offer code and send it to the client device.
                      </p>
                      <Button disabled={!isConnected}>Generate Offer</Button>
                   </div>
                   
                   <div className="p-4 rounded-lg bg-white/5 space-y-4">
                      <div className="flex items-center gap-3">
                         <PaintbrushIcon className="w-5 h-5"/>
                         <h4 className="font-semibold">Connect as a Client</h4>
                      </div>
                       <p className="text-xs text-gray-400">
                        Paste the offer from the bridge device here, then generate and send back the answer code.
                      </p>
                      <textarea placeholder="Paste offer code here..." disabled={isConnected} className="w-full text-xs p-2 bg-[#0D1117] border border-[#30363D] rounded-md resize-none"/>
                      <Button disabled={isConnected}>Generate Answer</Button>
                   </div>

                 </Card>
              )}
            </div>
          </div>
        </main>
      </div>

      <Dialog open={isScanModalOpen} onOpenChange={setIsScanModalOpen} title="Scan for Devices">
        <div className="mt-4 space-y-3 max-h-60 overflow-y-auto">
          {scannedDevices.length > 0 ? scannedDevices.map(d => (
            <div key={d.id} onClick={() => connectToSelectedDevice(d)} className="p-3 rounded-md bg-white/5 hover:bg-white/10 cursor-pointer">
              <p className="font-semibold">{d.name || 'Unnamed Device'}</p>
              <p className="text-xs text-gray-500">{d.id}</p>
            </div>
          )) : (
            <p className="text-gray-500 text-center py-4">
              {isScanning ? 'Scanning...' : 'No devices found.'}
            </p>
          )}
        </div>
        <div className="mt-6 flex gap-3">
          <Button onClick={stopScan} variant="outline" className="w-full">Stop Scan</Button>
          <Button onClick={manualConnect} className="w-full">Manual Chooser</Button>
        </div>
      </Dialog>
      
      <Dialog
        open={isDisconnectConfirmOpen}
        onOpenChange={setIsDisconnectConfirmOpen}
        title="Confirm Disconnect"
        description="Are you sure you want to disconnect from the device?"
      >
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="outline" onClick={() => setIsDisconnectConfirmOpen(false)}>Cancel</Button>
          <Button onClick={() => {
            if (device?.gatt?.connected) device.gatt.disconnect();
            setIsDisconnectConfirmOpen(false);
          }} className="border-red-500/50 bg-red-500/20 text-red-300 hover:bg-red-500/30">Disconnect</Button>
        </div>
      </Dialog>
      
      <ScheduleDialog
        open={isScheduleModalOpen}
        onOpenChange={setIsScheduleModalOpen}
        schedules={schedules}
        onSchedulesChange={setSchedules}
        onSync={() => sendCommand('SYNC_TIME')}
        disabled={isControlDisabled}
      />

      <Dialog
        open={isDeviceSettingsModalOpen}
        onOpenChange={setIsDeviceSettingsModalOpen}
        title="Device Settings"
      >
        {device ? (
            <div className="space-y-6 mt-4">
                <div>
                    <label className="text-sm font-medium text-gray-400">Device Name</label>
                    <p>{device.name}</p>
                </div>
                <div>
                    <label className="text-sm font-medium text-gray-400">Device ID</label>
                    <p className="text-xs font-mono text-gray-500">{device.id}</p>
                </div>
                <div>
                    <label htmlFor="alias" className="text-sm font-medium text-gray-400">Device Alias</label>
                    <div className="flex gap-2 mt-1">
                        <input
                            id="alias"
                            type="text"
                            value={deviceAliasInput}
                            onChange={(e) => setDeviceAliasInput(e.target.value)}
                            placeholder="e.g., Living Room Tank"
                            className="w-full font-sans text-sm px-3 py-2 bg-[#0D1117] border border-[#30363D] rounded-md"
                        />
                        <Button onClick={handleSaveAlias} size="sm">Save</Button>
                    </div>
                </div>
                <div className="pt-4 border-t border-white/10 space-y-3">
                     <h4 className="font-semibold">Advanced</h4>
                     <div className="flex flex-col sm:flex-row gap-3">
                        <Button
                            variant="outline"
                            onClick={() => {
                                sendCommand('REQUEST_STATE');
                                addToast('State sync request sent.', 'info');
                            }}
                            className="w-full"
                        >
                            <RefreshCwIcon className="w-4 h-4 mr-2" />
                            Sync State
                        </Button>
                        <Button
                            variant="outline"
                            className="border-red-500/50 text-red-400 hover:bg-red-500/10 hover:text-red-300 w-full"
                            onClick={() => setIsFactoryResetConfirmOpen(true)}
                        >
                            <AlertTriangleIcon className="w-4 h-4 mr-2" />
                            Factory Reset
                        </Button>
                     </div>
                </div>
            </div>
        ) : (
            <p className="text-gray-400 mt-4">No device connected.</p>
        )}
      </Dialog>

      <Dialog
        open={isFactoryResetConfirmOpen}
        onOpenChange={setIsFactoryResetConfirmOpen}
        title="Confirm Factory Reset"
        description="This will reset all settings on your device, including schedules. This action cannot be undone."
      >
        <div className="mt-6 flex justify-end gap-3">
            <Button variant="outline" onClick={() => setIsFactoryResetConfirmOpen(false)}>Cancel</Button>
            <Button onClick={() => {
                sendCommand('FACTORY_RESET');
                addToast('Factory reset command sent.', 'info');
                setIsFactoryResetConfirmOpen(false);
                setIsDeviceSettingsModalOpen(false);
            }} className="border-red-500/50 bg-red-500/20 text-red-300 hover:bg-red-500/30">
                Reset Device
            </Button>
        </div>
      </Dialog>
    </div>
  );
};

const App: React.FC = () => (
  <ToastProvider>
    <AquariumControlPage />
  </ToastProvider>
);

export default App;
