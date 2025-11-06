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
  writeValueWithoutResponse: (data: ArrayBuffer) => Promise<void>;
  startNotifications: () => Promise<MockBluetoothRemoteGATTCharacteristic>;
  addEventListener: (type: 'characteristicvaluechanged', listener: (event: any) => void) => void;
  removeEventListener: (type: 'characteristicvaluechanged', listener: (event: any) => void) => void;
  value?: DataView;
}

// UI Elements
export interface Preset {
  id: string;
  name: string;
  icon: React.FC<SVGProps<SVGSVGElement>>;
  color: string;
}

export interface SpectrumPreset {
  id: string;
  name: string;
  icon: React.FC<SVGProps<SVGSVGElement>>;
  values: {
    red: number;
    green: number;
    blue: number;
    white: number;
    uv: number;
  };
}


export interface ToastMessage {
  id: number;
  message: string;
  type: 'success' | 'info' | 'error';
}

export interface Schedule {
  id: string;
  enabled: boolean;
  startTime: string; // "HH:mm"
  endTime: string; // "HH:mm"
  days: boolean[]; // [M, T, W, T, F, S, S]
  action: {
    type: 'preset' | 'color' | 'power_off';
    value: string; // preset.id, hex color, or 'off'
    name: string; // "Preset: Clear White", "Color: #ff0000", "Power Off"
  };
}

// Fix for: Property 'bluetooth' does not exist on type 'Navigator'.
// Corrected Bluetooth filter options to allow for filtering by name and other properties.
interface BluetoothDeviceFilter {
  services?: string[];
  name?: string;
  namePrefix?: string;
}

interface RequestDeviceOptions {
  filters?: BluetoothDeviceFilter[];
  optionalServices?: string[];
  acceptAllDevices?: boolean;
}

interface BluetoothLEScanOptions {
  filters?: BluetoothDeviceFilter[];
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
