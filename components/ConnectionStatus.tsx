
import React from 'react';
import Button from './Button';
import { BluetoothIcon, BluetoothOffIcon, Loader2Icon } from './icons';

interface ConnectionStatusProps {
  isConnected: boolean;
  isConnecting: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
}

const ConnectionStatus: React.FC<ConnectionStatusProps> = ({
  isConnected,
  isConnecting,
  onConnect,
  onDisconnect,
}) => {
  return (
    <div className="p-4 rounded-xl bg-white/5">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center space-x-3 w-full sm:w-auto">
          {isConnected ? (
            <BluetoothIcon className="w-6 h-6 text-green-400 flex-shrink-0" />
          ) : (
            <BluetoothOffIcon className="w-6 h-6 text-red-400 flex-shrink-0" />
          )}
          <div>
            <p className="font-semibold text-white">
              {isConnected ? 'Connected' : 'Disconnected'}
            </p>
            <p className="text-xs text-gray-400">
              {isConnecting ? 'Attempting to connect...' : 'Ready to connect'}
            </p>
          </div>
        </div>
        {isConnected ? (
          <Button
            onClick={onDisconnect}
            variant="outline"
            className="border-red-500/50 text-red-400 hover:bg-red-500/10 hover:text-red-300 w-full sm:w-auto flex-shrink-0"
            size="sm"
          >
            Disconnect
          </Button>
        ) : (
          <Button onClick={onConnect} disabled={isConnecting} className="w-full sm:w-auto flex-shrink-0">
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