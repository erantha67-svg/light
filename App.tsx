

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
import {
  FishIcon,
  CalendarIcon,
  PowerIcon,
  Loader2Icon,
  CloudIcon,
} from './components/icons';
import { PRESETS, DEVICE_NAME, SERVICE_UUID, CHARACTERISTIC_UUID } from './constants';
import { MockBluetoothDevice, MockBluetoothRemoteGATTCharacteristic, Preset } from './types';

const LAST_DEVICE_ID_KEY = 'lastConnectedAquariumDeviceId';
const BRIDGE_CONFIG_KEY = 'aquariumBridgeConfig';

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

  const scanRef = useRef<any>(null);
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    try {
      const savedConfig = localStorage.getItem(BRIDGE_CONFIG_KEY);
      if (savedConfig) {
        const { isEnabled, serverUrl, apiKey } = JSON.parse(savedConfig);
        setIsBridgeModeEnabled(isEnabled ?? false);
        setBridgeServerUrl(serverUrl ?? '');
        setBridgeApiKey(apiKey ?? '');
      }
    } catch (error) {
      console.error("Failed to load bridge config from localStorage", error);
    }
  }, []);

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
    navigator.bluetooth.removeEventListener('advertisementreceived', handleAdvertisement);
    setIsScanning(false);
  }, []);

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
      // FIX: Combined filters into a single object for a more specific scan.
      const scan = await navigator.bluetooth.requestLEScan({
        filters: [
          { services: [SERVICE_UUID.toLowerCase()], name: DEVICE_NAME }
        ],
      });
      scanRef.current = scan;
      navigator.bluetooth.addEventListener('advertisementreceived', handleAdvertisement);
      
      setTimeout(() => {
        if(scanRef.current){
           stopScan();
           addToast('Scan finished.', 'info');
        }
      }, 15000); // Stop scan after 15 seconds

    } catch (error) {
       addToast('Could not start device scan.', 'error');
       setIsScanning(false);
    }
  };
  
  const onSelectDevice = (selectedDevice: MockBluetoothDevice) => {
    stopScan();
    connectToSelectedDevice(selectedDevice);
  };
  
  const manualConnect = async () => {
    try {
      const DFU_SERVICE_UUID = '4169726f-6861-4446-5553-657276696365';
      // FIX: Combined filters into a single object for a more specific device request.
      const bluetoothDevice = await navigator.bluetooth.requestDevice({
        filters: [
          { services: [SERVICE_UUID.toLowerCase()], name: DEVICE_NAME }
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

  const sendCommand = useCallback(async (command: string) => {
    if (!characteristic || !isConnected) {
      addToast('Not connected to device', 'error');
      return;
    }

    try {
      const encoder = new TextEncoder();
      const data = encoder.encode(command);
      await characteristic.writeValueWithoutResponse(data);
      console.log('Command sent:', command);
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

  return (
    <>
      <div className="min-h-screen p-4 md:p-8 flex items-center justify-center">
        <div className="max-w-2xl w-full mx-auto space-y-8">
          <div className="text-center space-y-2">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 mb-4">
              <FishIcon className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-3xl sm:text-4xl font-bold text-white tracking-tight">Aquarium Light</h1>
            <p className="text-gray-400">Control your AQ-S lighting system</p>
          </div>

          <Card className="p-6 space-y-6">
            <ConnectionStatus isConnected={isConnected} isConnecting={isConnecting} onConnect={startScan} onDisconnect={requestDisconnect} />

            <div className="flex items-center justify-between p-4 rounded-xl bg-white/5">
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
            
            <div className="pt-4">
              <Button variant="outline" className="w-full">
                <CalendarIcon className="w-4 h-4 mr-2" /> View Schedules
              </Button>
            </div>
          </Card>
          
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
        description="Select your AQ-S device from the list below."
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
        <div className="mt-6">
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
