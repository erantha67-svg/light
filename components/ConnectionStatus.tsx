

import React from 'react';
import Button from './Button';
import { BluetoothIcon, BluetoothOffIcon, Loader2Icon, SettingsIcon } from './icons';

interface ConnectionStatusProps {
  isConnected: boolean;
  isConnecting: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  onOpenSettings: () => void;
  deviceName?: string | null;
  isBluetoothAvailable: boolean;
}

const ConnectionStatus: React.FC<ConnectionStatusProps> = ({
  isConnected,
  isConnecting,
  onConnect,
  onDisconnect,
  onOpenSettings,
  deviceName,
  isBluetoothAvailable,
}) => {
  return (
    <div className="p-4 rounded-xl bg-white/5">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center space-x-3 w-full sm:w-auto">
          {isConnected ? (
            <BluetoothIcon className="w-6 h-6 text-green-400 flex-shrink-0" />
          ) : isBluetoothAvailable ? (
            <BluetoothOffIcon className="w-6 h-6 text-red-400 flex-shrink-0" />
          ) : (
            <BluetoothOffIcon className="w-6 h-6 text-gray-500 flex-shrink-0" />
          )}
          <div>
            <p className="font-semibold text-white">
              {isConnected ? deviceName || 'Connected' : isBluetoothAvailable ? 'Disconnected' : 'Bluetooth Off'}
            </p>
            <p className="text-xs text-gray-400">
              {isConnecting ? 'Attempting to connect...' : isConnected ? 'Device is ready' : isBluetoothAvailable ? 'Ready to connect' : 'Enable Bluetooth to continue'}
            </p>
          </div>
        </div>
        {isConnected ? (
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Button
              onClick={onOpenSettings}
              variant="outline"
              size="icon"
              className="flex-shrink-0"
              aria-label="Device Settings"
            >
              <SettingsIcon className="w-4 h-4" />
            </Button>
            <Button
              onClick={onDisconnect}
              variant="outline"
              className="border-red-500/50 text-red-400 hover:bg-red-500/10 hover:text-red-300 w-full sm:w-auto"
              size="sm"
            >
              Disconnect
            </Button>
          </div>
        ) : (
          <Button onClick={onConnect} disabled={isConnecting || !isBluetoothAvailable} className="w-full sm:w-auto flex-shrink-0">
            {isConnecting ? (
              <>
                <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
                Connecting
              </>
            ) : (
              'Connect to Device'
            )}
          </Button>
        )}
      </div>
    </div>
  );
};

export default ConnectionStatus;
