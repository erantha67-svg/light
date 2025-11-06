
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
  Loader2Icon
} from './components/icons';
import { PRESETS, DEVICE_NAME, SERVICE_UUID, CHARACTERISTIC_UUID } from './constants';
import { MockBluetoothDevice, MockBluetoothRemoteGATTCharacteristic, Preset } from './types';

const LAST_DEVICE_ID_KEY = 'lastConnectedAquariumDeviceId';

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

  const scanRef = useRef<any>(null);

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
      const scan = await navigator.bluetooth.requestLEScan({
        filters: [{ services: [SERVICE_UUID.toLowerCase()] }],
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
      const bluetoothDevice = await navigator.bluetooth.requestDevice({
        filters: [{ services: [SERVICE_UUID.toLowerCase()] }],
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

  return (
    <>
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-cyan-900 p-4 md:p-8">
        <div className="max-w-2xl mx-auto space-y-6">
          <div className="text-center space-y-2">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-cyan-400 to-blue-500 shadow-lg shadow-cyan-500/50 mb-4">
              <FishIcon className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-4xl font-bold text-white">Aquarium Light</h1>
            <p className="text-cyan-200">Control your AQ-S lighting system</p>
          </div>

          <div className="grid grid-cols-1 gap-3">
            <Button variant="outline" className="w-full bg-white/10 hover:bg-white/20 border-white/20 text-white">
              <CalendarIcon className="w-4 h-4 mr-2" /> Schedules
            </Button>
          </div>

          <ConnectionStatus isConnected={isConnected} isConnecting={isConnecting} onConnect={startScan} onDisconnect={requestDisconnect} />

          <Card className="bg-white/10 backdrop-blur-xl border-white/20 p-6 space-y-6">
            <div className="flex items-center justify-between p-4 rounded-xl bg-gradient-to-r from-white/5 to-white/10 border border-white/20">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-white/10"><PowerIcon className="w-6 h-6 text-white" /></div>
                <div>
                  <h3 className="text-lg font-semibold text-white">Master Power</h3>
                  <p className="text-sm text-cyan-200">Turn all lights on/off</p>
                </div>
              </div>
              <Switch checked={isPowerOn} onCheckedChange={handlePowerToggle} disabled={!isConnected} />
            </div>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <label className="text-lg font-semibold text-white">Master Brightness</label>
                <Badge variant="outline" className="bg-white/10 text-white border-white/30">{brightness[0]}%</Badge>
              </div>
              <div className="space-y-2">
                <Slider value={brightness} onValueChange={handleBrightnessChange} max={100} step={1} disabled={!isConnected || !isPowerOn} className="w-full" />
                <div className="flex justify-between text-xs text-cyan-200">
                  <span>0%</span><span>25%</span><span>50%</span><span>75%</span><span>100%</span>
                </div>
              </div>
            </div>
          </Card>

          <Card className="bg-white/10 backdrop-blur-xl border-white/20 p-6">
            <h3 className="text-xl font-semibold text-white mb-4">Lighting Presets</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {PRESETS.map((preset) => (
                <PresetButton key={preset.id} preset={preset} isActive={activePreset === preset.id} isDisabled={!isConnected || !isPowerOn} onClick={() => handlePresetSelect(preset)} />
              ))}
            </div>
          </Card>

          <div className="text-center text-cyan-300 text-sm space-y-1">
            <p>Make sure Bluetooth is enabled on your device</p>
            <p className="text-cyan-400/60">Device: {DEVICE_NAME}</p>
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
