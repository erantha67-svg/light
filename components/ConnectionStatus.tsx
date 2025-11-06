
import React from 'react';
import Button from './Button';
import Card from './Card';
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
    <Card className="bg-white/10 backdrop-blur-xl border-white/20 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          {isConnected ? (
            <BluetoothIcon className="w-6 h-6 text-green-400" />
          ) : (
            <BluetoothOffIcon className="w-6 h-6 text-red-400" />
          )}
          <div>
            <p className="font-semibold text-white">
              {isConnected ? 'Connected' : 'Disconnected'}
            </p>
            <p className="text-xs text-cyan-200">
              {isConnecting ? 'Attempting to connect...' : 'Ready to connect'}
            </p>
          </div>
        </div>
        {isConnected ? (
          <Button
            onClick={onDisconnect}
            variant="outline"
            className="bg-red-500/20 hover:bg-red-500/30 border-red-500/30 text-red-300 hover:text-red-200"
          >
            Disconnect
          </Button>
        ) : (
          <Button onClick={onConnect} disabled={isConnecting}>
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
    </Card>
  );
};

export default ConnectionStatus;
