// Fix for: Cannot find namespace 'React'.
import React, { SVGProps } from 'react';

// Web Bluetooth API - simplified interfaces
export interface MockBluetoothDevice {
  id: string;
  name?: string | null;
  gatt?: MockBluetoothRemoteGATTServer;
  addEventListener: (event: string, callback: (event?: any) => void) => void;
}

export interface MockBluetoothRemoteGATTServer {
  connected: boolean;
  connect: () => Promise<MockBluetoothRemoteGATTServer>;
  getPrimaryService: (uuid: string) => Promise<MockBluetoothRemoteGATTService>;
  disconnect: () => void;
}

export interface MockBluetoothRemoteGATTService {
  getCharacteristic: (uuid: string) => Promise<MockBluetoothRemoteGATTCharacteristic>;
}

export interface MockBluetoothRemoteGATTCharacteristic {
  writeValue: (data: ArrayBuffer) => Promise<void>;
}

// UI Elements
export interface Preset {
  id: string;
  name: string;
  icon: React.FC<SVGProps<SVGSVGElement>>;
  color: string;
}

export interface ToastMessage {
  id: number;
  message: string;
  type: 'success' | 'info' | 'error';
}

// Fix for: Property 'bluetooth' does not exist on type 'Navigator'.
interface RequestDeviceOptions {
  filters?: { services?: string[] }[];
  optionalServices?: string[];
  acceptAllDevices?: boolean;
}

interface BluetoothLEScanOptions {
  filters?: { services?: string[] }[];
  acceptAllAdvertisements?: boolean;
}

interface BluetoothLEScan {
  stop: () => void;
}

interface BluetoothAdvertisingEvent {
  device: MockBluetoothDevice;
}

interface WebBluetooth {
  requestDevice: (options: RequestDeviceOptions) => Promise<MockBluetoothDevice>;
  getDevices: () => Promise<MockBluetoothDevice[]>;
  requestLEScan: (options: BluetoothLEScanOptions) => Promise<BluetoothLEScan>;
  addEventListener: (event: 'advertisementreceived', callback: (event: BluetoothAdvertisingEvent) => void) => void;
  removeEventListener: (event: 'advertisementreceived', callback: (event: BluetoothAdvertisingEvent) => void) => void;
}

declare global {
  interface Navigator {
    bluetooth: WebBluetooth;
  }
}
