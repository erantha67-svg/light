
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
} from './components/icons';
import { PRESETS, SPECTRUM_PRESETS, DEVICE_NAME, SERVICE_UUID, CHARACTERISTIC_UUID_NOTIFY, CHARACTERISTIC_UUID_WRITE } from './constants';
import { MockBluetoothDevice, MockBluetoothRemoteGATTCharacteristic, Preset, Schedule, SpectrumPreset } from './types';
import { hslToRgb, rgbToHex, hexToRgb, rgbToHsl, calculateSpectrumColor } from './utils';
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
    // Fix for: Block-scoped variable 'newHsl' used before its declaration.
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
  const [currentDeviceAlias, setCurrentDeviceAlias] = useState('');

  // Scheduling state
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [nextEvent, setNextEvent] = useState<{ time: Date; name: string } | null>(null);
  const [countdown, setCountdown] = useState('');

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
      await characteristic.writeValueWithoutResponse(dataBuffer);
      console.log('Command sent via Bluetooth:', command, dataBuffer);
    } catch (error) {
      console.error('Bluetooth command error:', error);
      addToast('Failed to send command', 'error');
    }
  }, [characteristic, isConnected, isClientConnectedToBridge, addToast]);

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
          writeChar.writeValueWithoutResponse(dataBuffer);
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
