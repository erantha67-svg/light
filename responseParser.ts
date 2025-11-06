import { rgbToHex } from './utils';

const START_BYTE = 0x7E;
const END_BYTE = 0xEF;

const RESPONSE_CODES = {
  STATE_UPDATE: 0x81,
};

const PRESET_ID_MAP: { [key: number]: string } = {
  0x01: 'sunrise',
  0x02: 'clear',
  0x03: 'crystal',
  0x04: 'deep',
  0x05: 'coral',
  0x06: 'natural',
};

export interface DeviceState {
  power: boolean;
  brightness: number;
  mode: 'preset' | 'solid' | 'spectrum' | 'gradient' | 'off';
  activePresetId: string | null;
  solidColor: string;
  spectrum: {
    red: number;
    green: number;
    blue: number;
    white: number;
    uv: number;
  };
}

function verifyChecksum(data: Uint8Array): boolean {
    if (data.length < 2) return false;
    const payload = data.slice(0, -1);
    const checksum = data[data.length - 1];
    const calculatedChecksum = payload.reduce((acc, byte) => (acc + byte) & 0xFF, 0);
    return checksum === calculatedChecksum;
}


export function parseDeviceResponse(data: ArrayBuffer): Partial<DeviceState> | null {
  const view = new Uint8Array(data);
  
  if (view[0] !== START_BYTE || view[view.length - 1] !== END_BYTE) {
    console.warn('Invalid packet start/end bytes');
    return null;
  }

  const len = view[1];
  const responseCode = view[2];
  const payload = view.slice(3, 3 + len - 1);
  const checksumPacket = view.slice(2, 3 + len); // code + payload + checksum

  if (!verifyChecksum(checksumPacket)) {
    console.warn('Checksum mismatch in device response');
    return null;
  }
  
  const state: Partial<DeviceState> = {};

  if (responseCode === RESPONSE_CODES.STATE_UPDATE) {
    const power = view[3] === 1;
    const brightness = view[4];
    const modeId = view[5];

    state.power = power;
    state.brightness = brightness;

    switch (modeId) {
      case 1: // Preset
        state.mode = 'preset';
        const presetId = view[6];
        state.activePresetId = PRESET_ID_MAP[presetId] || null;
        break;
      case 2: // Solid Color
        state.mode = 'solid';
        state.activePresetId = null;
        const r = view[6];
        const g = view[7];
        const b = view[8];
        state.solidColor = rgbToHex(r, g, b);
        break;
      case 3: // Spectrum
        state.mode = 'spectrum';
        state.activePresetId = null;
        state.spectrum = {
          red: view[6],
          green: view[7],
          blue: view[8],
          white: view[9],
          uv: view[10],
        };
        break;
      // Other modes like gradient can be added here
      default:
        state.mode = 'off';
        state.activePresetId = null;
    }
    return state;
  }

  console.warn(`Unknown response code: ${responseCode}`);
  return null;
}
