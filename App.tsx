
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
import { PRESETS, SPECTRUM_PRESETS, DEVICE_NAME, SERVICE_UUID, CHARACTERISTIC_UUID } from './constants';
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
    if(characteristic) {
      characteristic.removeEventListener('characteristicvaluechanged', handleDeviceNotification);
    }
    setIsConnected(false);
    setDevice(null);
    setCharacteristic(null);
    addToast('Disconnected from device', 'info');
  }, [addToast, characteristic, handleDeviceNotification]);
  
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
        
        await char.startNotifications();
        char.addEventListener('characteristicvaluechanged', handleDeviceNotification);

        setDevice(selectedDevice);
        setCharacteristic(char);
        setIsConnected(true);
        localStorage.setItem(LAST_DEVICE_ID_KEY, selectedDevice.id);
        addToast(`Connected to ${selectedDevice.name || 'device'}`, 'success');
        
        selectedDevice.addEventListener('gattserverdisconnected', handleDisconnect);

        addToast('Syncing device state...', 'info');
        setTimeout(() => {
          const dataBuffer = formatCommand('REQUEST_STATE');
          if (dataBuffer.byteLength > 0) {
            char.writeValueWithoutResponse(dataBuffer);
          }
        }, 500);

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
  
  // WebRTC Bridge Logic
  const createPeerConnection = () => {
    try {
      const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
      pc.onconnectionstatechange = () => {
        console.log('Bridge connection state:', pc.connectionState);
        if (pc.connectionState === 'connected') {
          addToast('Bridge connection established!', 'success');
          setBridgeStatus('connected');
          if(!isConnected) { // This check prevents the bridge client from setting this state
            setIsClientConnectedToBridge(true);
          }
        } else if (['disconnected', 'failed', 'closed'].includes(pc.connectionState)) {
          addToast('Bridge connection lost.', 'error');
          setBridgeStatus('inactive');
          setIsClientConnectedToBridge(false);
          peerConnectionRef.current = null;
        }
      };
      return pc;
    } catch (error) {
      addToast('WebRTC not supported on this browser.', 'error');
      setBridgeStatus('error');
      return null;
    }
  };

  const startBridge = async () => {
    setBridgeStatus('generating');
    addToast('Generating bridge offer...', 'info');
    const pc = createPeerConnection();
    if (!pc) return;

    peerConnectionRef.current = pc;

    const dc = pc.createDataChannel('commands');
    dc.onmessage = (event) => {
      const { type, command } = JSON.parse(event.data);
      if (type === 'command') {
        sendCommand(command);
      }
    };
    dataChannelRef.current = dc;

    pc.onicecandidate = () => {
      if (pc.iceGatheringState === 'complete' && pc.localDescription) {
        setBridgeOffer(JSON.stringify(pc.localDescription));
      }
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    setBridgeStatus('waiting');
  };

  const connectToBridge = async () => {
    if (!bridgeOffer) {
      addToast('Please paste the offer code first.', 'error');
      return;
    }
    setBridgeStatus('connecting');
    addToast('Generating answer...', 'info');
    const pc = createPeerConnection();
    if (!pc) return;

    peerConnectionRef.current = pc;
    pc.ondatachannel = (event) => {
      const dc = event.channel;
      dc.onmessage = (e) => {
        const { type, state } = JSON.parse(e.data);
        if (type === 'state_update') {
          updateAppState(state);
        }
      };
      dataChannelRef.current = dc;
    };

    try {
      await pc.setRemoteDescription(JSON.parse(bridgeOffer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      pc.onicecandidate = () => {
        if (pc.iceGatheringState === 'complete' && pc.localDescription) {
          setBridgeAnswer(JSON.stringify(pc.localDescription));
        }
      };
    } catch (e) {
      addToast('Invalid offer code.', 'error');
      setBridgeStatus('error');
    }
  };

  const completeBridgeConnection = async () => {
    if (!bridgeAnswer) {
      addToast('Please paste the answer code first.', 'error');
      return;
    }
    setBridgeStatus('connecting');
    try {
      await peerConnectionRef.current?.setRemoteDescription(JSON.parse(bridgeAnswer));
    } catch (e) {
      addToast('Invalid answer code.', 'error');
      setBridgeStatus('error');
    }
  };
  
  const handleClientDisconnectFromBridge = () => {
    peerConnectionRef.current?.close();
    setBridgeOffer('');
    setBridgeAnswer('');
    setBridgeStatus('inactive');
  };

  const copyToClipboard = (text: string, onCopy: (isCopied: boolean) => void) => {
    navigator.clipboard.writeText(text).then(() => {
      addToast('Copied to clipboard!', 'success');
      onCopy(true);
      setTimeout(() => onCopy(false), 2000);
    });
  };

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

  const handleFactoryReset = useCallback(async () => {
    await sendCommand('FACTORY_RESET');
    addToast('Device has been reset to factory settings.', 'success');
    setIsFactoryResetConfirmOpen(false);
    setIsDeviceSettingsModalOpen(false);
  }, [sendCommand, addToast]);

  const handleSyncState = useCallback(async () => {
    await sendCommand('REQUEST_STATE');
    addToast('Requesting current state from device...', 'info');
  }, [sendCommand, addToast]);
  
  const handleSyncTime = useCallback(async () => {
    await sendCommand('SYNC_TIME');
    addToast('Device time synchronized successfully!', 'success');
  }, [sendCommand, addToast]);

  const displayedDeviceName = (device && deviceAliases[device.id]) || (isClientConnectedToBridge ? 'Bridge Client' : device?.name);

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

  const renderBridgeServerContent = () => {
    return (
      <div>
        <div className="flex items-center gap-4">
          <ServerIcon className="w-6 h-6 text-white" />
          <h3 className="text-lg font-semibold text-white">Act as Bridge</h3>
        </div>
        <p className="text-sm text-gray-400 mt-2">
          Allow other devices to control this light through a direct peer-to-peer connection.
        </p>
        
        {bridgeStatus === 'inactive' && (
          <Button onClick={startBridge} className="w-full mt-6">Start Bridge</Button>
        )}
        
        {(bridgeStatus === 'generating' || bridgeStatus === 'waiting') && bridgeOffer && (
          <div className="mt-6 pt-6 border-t border-white/10 space-y-4">
            <h4 className="font-semibold text-white">Step 1: Share Offer Code</h4>
            <p className="text-sm text-gray-400">Copy this code and paste it into the "Connect to Bridge" section on your other device.</p>
            <div className="relative">
              <textarea
                readOnly
                value={bridgeOffer}
                className="w-full h-28 p-2 bg-[#0D1117] border border-[#30363D] rounded-md text-gray-400 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
              <Button size="icon" variant="ghost" className="absolute top-2 right-2" onClick={() => copyToClipboard(bridgeOffer, setIsOfferCopied)}>
                {isOfferCopied ? <ClipboardCheckIcon className="w-4 h-4 text-green-400" /> : <ClipboardIcon className="w-4 h-4" />}
              </Button>
            </div>
          </div>
        )}

        {bridgeStatus === 'waiting' && (
          <div className="mt-6 pt-6 border-t border-white/10 space-y-4">
            <h4 className="font-semibold text-white">Step 2: Paste Answer Code</h4>
            <p className="text-sm text-gray-400">Generate an answer on your other device and paste it here to complete the connection.</p>
            <textarea
              value={bridgeAnswer}
              onChange={(e) => setBridgeAnswer(e.target.value)}
              placeholder="Paste answer code from client device..."
              className="w-full h-28 p-2 bg-[#0D1117] border border-[#30363D] rounded-md text-gray-300 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
            <Button onClick={completeBridgeConnection} className="w-full" disabled={!bridgeAnswer || bridgeStatus === 'connecting'}>
              {bridgeStatus === 'connecting' ? <Loader2Icon className="w-4 h-4 mr-2 animate-spin"/> : null}
              Connect
            </Button>
          </div>
        )}

        {bridgeStatus === 'connected' && (
           <div className="mt-6 pt-6 border-t border-white/10 text-center">
            <p className="text-green-400 font-semibold">Bridge Connected!</p>
            <p className="text-sm text-gray-400 mt-2">You can now control the light from your other device.</p>
             <Button onClick={handleClientDisconnectFromBridge} variant="outline" className="mt-4 border-red-500/50 text-red-400 hover:bg-red-500/10 hover:text-red-300 w-full sm:w-auto">
              Disconnect Bridge
            </Button>
          </div>
        )}
      </div>
    );
  };
  
  const renderBridgeClientContent = () => {
    return (
      <div>
        <div className="flex items-center gap-4">
          <WifiIcon className="w-6 h-6 text-white" />
          <h3 className="text-lg font-semibold text-white">Connect to a Bridge</h3>
        </div>
        <p className="text-sm text-gray-400 mt-2">
          Control this light remotely by connecting to a bridge device over your local network.
        </p>

        {bridgeStatus === 'inactive' && !isClientConnectedToBridge && (
          <div className="mt-6 pt-6 border-t border-white/10 space-y-4">
            <h4 className="font-semibold text-white">Step 1: Paste Offer Code</h4>
            <p className="text-sm text-gray-400">Get the offer code from your Bluetooth-connected device and paste it here.</p>
            <textarea
              value={bridgeOffer}
              onChange={(e) => setBridgeOffer(e.target.value)}
              placeholder="Paste offer code from server device..."
              className="w-full h-28 p-2 bg-[#0D1117] border border-[#30363D] rounded-md text-gray-300 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
            <Button onClick={connectToBridge} className="w-full" disabled={!bridgeOffer}>
              Generate Answer
            </Button>
          </div>
        )}
        
        {(bridgeStatus === 'connecting' || bridgeStatus === 'connected') && bridgeAnswer && !isClientConnectedToBridge && (
          <div className="mt-6 pt-6 border-t border-white/10 space-y-4">
            <h4 className="font-semibold text-white">Step 2: Share Answer Code</h4>
            <p className="text-sm text-gray-400">Copy this answer code and paste it back into your bridge device to establish the connection.</p>
             <div className="relative">
              <textarea
                readOnly
                value={bridgeAnswer}
                className="w-full h-28 p-2 bg-[#0D1117] border border-[#30363D] rounded-md text-gray-400 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
              <Button size="icon" variant="ghost" className="absolute top-2 right-2" onClick={() => copyToClipboard(bridgeAnswer, setIsAnswerCopied)}>
                {isAnswerCopied ? <ClipboardCheckIcon className="w-4 h-4 text-green-400" /> : <ClipboardIcon className="w-4 h-4" />}
              </Button>
            </div>
            <p className="text-center text-gray-400">Waiting for bridge device to connect...</p>
          </div>
        )}

        {isClientConnectedToBridge && (
          <div className="mt-6 pt-6 border-t border-white/10 text-center">
            <p className="text-green-400 font-semibold">Bridge Connected!</p>
            <p className="text-sm text-gray-400 mt-2">You now have full control of the light.</p>
            <Button onClick={handleClientDisconnectFromBridge} variant="outline" className="mt-4 border-red-500/50 text-red-400 hover:bg-red-500/10 hover:text-red-300 w-full sm:w-auto">
              Disconnect from Bridge
            </Button>
          </div>
        )}
      </div>
    );
  };


  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0D1117] via-[#161B22] to-[#0D1117] p-4 sm:p-6 lg:p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        <header className="text-center">
          <div className="flex items-center justify-center gap-4 mb-2">
            <FishIcon className="w-8 h-8 text-purple-400" />
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-white bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-pink-500">
              Aquarium Light Controller
            </h1>
          </div>
          <p className="text-gray-400">Control your AQ-S light system with ease.</p>
        </header>

        <main>
          <Card className="p-4 sm:p-6">
            <ConnectionStatus
              isConnected={isConnected || isClientConnectedToBridge}
              isConnecting={isConnecting}
              onConnect={startScan}
              onDisconnect={requestDisconnect}
              onOpenSettings={handleOpenDeviceSettings}
              deviceName={displayedDeviceName}
            />
          </Card>

          <Card className="mt-8">
            <div className="p-6">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-white">Master Controls</h2>
                <div className="flex items-center space-x-4">
                  <span className="text-sm font-medium">Power</span>
                  <Switch
                    checked={isPowerOn}
                    onCheckedChange={handlePowerToggle}
                    disabled={!isConnected && !isClientConnectedToBridge}
                  />
                </div>
              </div>
              <div className="mt-6 space-y-2">
                <div className="flex justify-between items-center">
                  <label htmlFor="brightness" className="font-medium text-white">Brightness</label>
                  <Badge variant="outline">{brightness[0]}%</Badge>
                </div>
                <Slider
                  value={brightness}
                  onValueChange={handleBrightnessChange}
                  max={100}
                  step={1}
                  disabled={isControlDisabled}
                />
              </div>
            </div>

            <div className="border-t border-[#30363D] px-2 sm:px-4 py-2 flex justify-center items-center gap-2 overflow-x-auto">
              {tabs.map(tab => (
                 <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-4 py-2 text-sm font-semibold rounded-md transition-colors whitespace-nowrap
                    ${activeTab === tab.id
                      ? 'bg-white/10 text-white'
                      : 'text-gray-400 hover:bg-white/5 hover:text-white'
                    }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="p-6">
              {activeTab === 'controls' && (
                <div>
                  <h3 className="text-lg font-semibold text-white mb-4">Color Presets</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    {PRESETS.map(preset => (
                      <PresetButton
                        key={preset.id}
                        preset={preset}
                        isActive={activePreset === preset.id}
                        isDisabled={isControlDisabled}
                        onClick={() => handlePresetSelect(preset)}
                      />
                    ))}
                  </div>
                </div>
              )}
              {activeTab === 'custom' && (
                <div className="space-y-6">
                   <div className="flex justify-center bg-[#0D1117] p-1 rounded-lg border border-[#30363D]">
                    {['solid', 'gradient', 'spectrum'].map(mode => (
                      <button
                        key={mode}
                        onClick={() => setCustomColorMode(mode as any)}
                        className={`w-full py-2 px-3 text-sm font-semibold rounded-md transition ${customColorMode === mode ? 'bg-white/10 text-white' : 'text-gray-400 hover:bg-white/5'}`}
                      >
                        <span className="capitalize">{mode}</span>
                      </button>
                    ))}
                  </div>

                  {customColorMode === 'solid' && (
                     <div className="space-y-4">
                      <ColorPicker color={solidColor} onChange={setSolidColor} disabled={isControlDisabled} />
                      <div className="flex items-center gap-3">
                         <input
                            type="text"
                            value={hexInputValue}
                            onChange={handleHexInputChange}
                            onBlur={handleHexInputBlur}
                            className="w-full px-3 py-2 bg-[#0D1117] border border-[#30363D] rounded-md font-mono"
                            disabled={isControlDisabled}
                          />
                        <div className="w-10 h-10 rounded-md border border-white/20" style={{ backgroundColor: solidColor }}></div>
                      </div>
                    </div>
                  )}

                  {customColorMode === 'gradient' && (
                    <div className="space-y-6">
                      <div>
                        <h4 className="font-semibold text-white mb-2">Sunrise Effect</h4>
                         <div className="flex gap-2 items-center">
                          <Button onClick={handleStartSunrise} disabled={isControlDisabled} className="w-full">
                            <SunriseIcon className="mr-2 h-4 w-4" /> Start Sunrise
                          </Button>
                        </div>
                      </div>
                      <div>
                        <h4 className="font-semibold text-white mb-2">Sunset Effect</h4>
                        <div className="flex gap-2 items-center">
                           <Button onClick={handleStartSunset} disabled={isControlDisabled} className="w-full">
                            <SunsetIcon className="mr-2 h-4 w-4" /> Start Sunset
                          </Button>
                        </div>
                      </div>
                      <div>
                         <label className="font-medium text-white block mb-2">Duration ({gradientDuration} minutes)</label>
                        <Slider
                          value={[gradientDuration]}
                          onValueChange={([val]) => setGradientDuration(val)}
                          min={5}
                          max={120}
                          step={5}
                          disabled={isControlDisabled}
                        />
                      </div>
                    </div>
                  )}

                  {customColorMode === 'spectrum' && (
                     <div className="space-y-4">
                       <div className="grid grid-cols-3 gap-3">
                         {SPECTRUM_PRESETS.map(p => (
                            <SpectrumPresetButton 
                              key={p.id}
                              preset={p}
                              onClick={() => handleSelectSpectrumPreset(p)}
                              isActive={isSpectrumPresetActive(p)}
                              isDisabled={isControlDisabled}
                            />
                         ))}
                       </div>
                       <div className="pt-4 border-t border-white/10 space-y-4">
                        <SpectrumSlider channel="red" value={spectrumValues.red} onChange={handleSpectrumChange} trackClassName="bg-red-500" disabled={isControlDisabled}/>
                        <SpectrumSlider channel="green" value={spectrumValues.green} onChange={handleSpectrumChange} trackClassName="bg-green-500" disabled={isControlDisabled}/>
                        <SpectrumSlider channel="blue" value={spectrumValues.blue} onChange={handleSpectrumChange} trackClassName="bg-blue-500" disabled={isControlDisabled}/>
                        <SpectrumSlider channel="white" value={spectrumValues.white} onChange={handleSpectrumChange} trackClassName="bg-gray-200" disabled={isControlDisabled}/>
                        <SpectrumSlider channel="uv" value={spectrumValues.uv} onChange={handleSpectrumChange} trackClassName="bg-violet-500" disabled={isControlDisabled}/>
                       </div>
                       <div 
                          className="w-full h-10 rounded-md border border-white/20 transition-colors"
                          style={{ backgroundColor: calculateSpectrumColor(spectrumValues) }}
                        />
                     </div>
                  )}

                  {(customColorMode === 'solid' || customColorMode === 'spectrum') && (
                    <Button onClick={handleApplyCustomColor} disabled={isControlDisabled} className="w-full">
                      <PaintbrushIcon className="mr-2 h-4 w-4" /> Apply Custom Lighting
                    </Button>
                  )}
                </div>
              )}
              {activeTab === 'schedules' && (
                <div className="space-y-4">
                   <div className="p-4 rounded-lg bg-white/5 text-center">
                      <h3 className="font-semibold text-white">Next Scheduled Event</h3>
                      {nextEvent ? (
                        <>
                          <p className="text-gray-300">{nextEvent.name}</p>
                          <p className="text-2xl font-mono font-bold text-purple-400 mt-1">{countdown}</p>
                        </>
                      ) : (
                         <p className="text-gray-500">No upcoming events.</p>
                      )}
                   </div>
                  <Button
                    onClick={() => setIsScheduleModalOpen(true)}
                    variant="outline"
                    className="w-full"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    Manage Schedules
                  </Button>
                </div>
              )}
              {activeTab === 'bridge' && (
                <div>
                  { (isConnected && !isClientConnectedToBridge) ? renderBridgeServerContent() : renderBridgeClientContent() }
                </div>
              )}
            </div>
          </Card>
        </main>
      </div>

      <Dialog
        open={isScanModalOpen}
        onOpenChange={setIsScanModalOpen}
        title="Scan for Devices"
        description="Select your AQ-S device from the list below."
      >
        <div className="mt-4 max-h-60 overflow-y-auto space-y-2">
          {isScanning && scannedDevices.length === 0 && (
            <div className="flex items-center justify-center p-8 text-gray-400">
              <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
              Scanning...
            </div>
          )}
          {!isScanning && scannedDevices.length === 0 && (
            <div className="text-center p-8 text-gray-500">No devices found.</div>
          )}
          {scannedDevices.map(d => (
            <button
              key={d.id}
              onClick={() => onSelectDevice(d)}
              className="w-full text-left p-3 rounded-md hover:bg-white/10 transition-colors flex items-center justify-between"
            >
              <span>{deviceAliases[d.id] || d.name || 'Unknown Device'}</span>
              <span className="text-xs text-gray-500">{d.id}</span>
            </button>
          ))}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setIsScanModalOpen(false)}>Cancel</Button>
          <Button onClick={startScan} disabled={isScanning}>
             {isScanning ? (
              <>
                <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
                Scanning...
              </>
            ) : (
              'Scan Again'
            )}
          </Button>
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
          <Button onClick={confirmDisconnect} className="bg-red-600 hover:bg-red-700 text-white shadow-red-600/20">Disconnect</Button>
        </div>
      </Dialog>
      
      <Dialog
        open={isDeviceSettingsModalOpen}
        onOpenChange={setIsDeviceSettingsModalOpen}
        title="Device Settings"
      >
        <div className="space-y-6 mt-4">
          <div>
            <label className="text-sm font-medium text-gray-300 mb-2 block">Device Alias</label>
            <input
              type="text"
              value={currentDeviceAlias}
              onChange={(e) => setCurrentDeviceAlias(e.target.value)}
              placeholder="e.g., Living Room Tank"
              className="w-full px-3 py-2 bg-[#0D1117] border border-[#30363D] rounded-md"
            />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-300 mb-2 block">Signal Strength</p>
             <div className="flex items-center gap-4">
              <div className="relative w-full h-2 bg-[#30363D] rounded-full">
                <div className="absolute top-0 left-0 h-2 rounded-full bg-green-500" style={{ width: '88%' }}></div>
              </div>
              <Badge className="bg-green-500/20 text-green-300 border-green-500/30">Excellent</Badge>
            </div>
            <p className="text-xs text-gray-500 mt-2">-62 dBm</p>
          </div>
           <div>
             <label className="text-sm font-medium text-gray-300 mb-2 block">Firmware Version</label>
             <div className="flex items-center gap-2 p-3 rounded-md bg-[#0D1117] border border-[#30363D]">
               <InfoIcon className="w-4 h-4 text-gray-400" />
               <p className="text-sm text-gray-300 font-mono">1.2.5-20240515</p>
             </div>
           </div>
          
           <details className="bg-[#0D1117] border border-[#30363D] rounded-md p-3">
            <summary className="cursor-pointer font-medium text-sm text-gray-300">Compliance Information</summary>
            <div className="mt-2 pt-2 border-t border-[#30363D] max-h-32 overflow-y-auto text-xs text-gray-400 space-y-2">
                <p className="font-semibold">FCC STATEMENT:</p>
                <p>This device complies with Part 15 of the FCC Rules. Operation is subject to the following two conditions: (1) This device may not cause harmful interference, and (2) this device must accept any interference received, including interference that may cause undesired operation.</p>
                <p><span className="font-semibold">Warning:</span> Changes or modifications not expressly approved by the party responsible for compliance could void the user’s authority to operate the equipment.</p>
                <p><span className="font-semibold">NOTE:</span> This equipment has been tested and found to comply with the limits for a Class B digital device, pursuant to Part 15 of the FCC Rules. These limits are designed to provide reasonable protection against harmful interference in a residential installation. This equipment generates, uses and can radiate radio frequency energy and, if not installed and used in accordance with the instructions, may cause harmful interference to radio communications. However, there is no guarantee that interference will not occur in a particular installation. If this equipment does cause harmful interference to radio or television reception, which can be determined by turning the equipment off and on, the user is encouraged to try to correct the interference by one or more of the following measures: Reorient or relocate the receiving antenna. Increase the separation between the equipment and receiver. Connect the equipment into an outlet on a circuit different from that to which the receiver is connected. Consult the dealer or an experienced radio/TV technician for help.</p>
                <p className="font-semibold">FCC Radiation Exposure Statement:</p>
                <p>This equipment complies with FCC radiation exposure limits set forth for an uncontrolled environment. This equipment should be installed and operated with a minimum distance 20cm between the radiator & your body.</p>
            </div>
           </details>


           <div className="pt-4 border-t border-white/10">
            <h4 className="font-semibold text-white mb-3">Device Actions</h4>
            <div className="grid grid-cols-2 gap-3">
              <Button onClick={handleSyncState} variant="outline"><RefreshCwIcon className="w-4 h-4 mr-2" /> Sync State</Button>
              <Button onClick={handleSyncTime} variant="outline"><ClockIcon className="w-4 h-4 mr-2" /> Sync Time</Button>
              <Button
                onClick={() => setIsFactoryResetConfirmOpen(true)}
                variant="outline"
                className="col-span-2 border-red-500/50 text-red-400 hover:bg-red-500/10 hover:text-red-300"
              >
                <AlertTriangleIcon className="w-4 h-4 mr-2" />
                Factory Reset
              </Button>
            </div>
           </div>

        </div>
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="outline" onClick={() => setIsDeviceSettingsModalOpen(false)}>Cancel</Button>
          <Button onClick={handleSaveDeviceSettings}>Save Settings</Button>
        </div>
      </Dialog>
      
       <Dialog
          open={isFactoryResetConfirmOpen}
          onOpenChange={setIsFactoryResetConfirmOpen}
          title={
            <div className="flex items-center gap-2 text-red-400">
              <AlertTriangleIcon /> Factory Reset
            </div>
          }
          description="This will erase all settings and schedules from your device. This action cannot be undone."
       >
         <div className="mt-6 flex justify-end gap-3">
           <Button variant="outline" onClick={() => setIsFactoryResetConfirmOpen(false)}>Cancel</Button>
           <Button onClick={handleFactoryReset} className="bg-red-600 hover:bg-red-700 text-white shadow-red-600/20">
             Confirm Reset
           </Button>
         </div>
       </Dialog>

       <ScheduleDialog
        open={isScheduleModalOpen}
        onOpenChange={setIsScheduleModalOpen}
        schedules={schedules}
        onSchedulesChange={setSchedules}
        onSync={handleSyncSchedules}
        disabled={isControlDisabled}
      />

    </div>
  );
};


const App: React.FC = () => (
  <ToastProvider>
    <AquariumControlPage />
  </ToastProvider>
);

export default App;
