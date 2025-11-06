import { hexToRgb } from './utils';
import { Schedule } from './types';

const PRESET_MAP: { [key: string]: number } = {
  sunrise: 0x01,
  clear: 0x02,
  crystal: 0x03,
  deep: 0x04,
  coral: 0x05,
  natural: 0x06,
};

const COMMAND_CODES = {
  POWER: 0x01,
  BRIGHTNESS: 0x02,
  PRESET: 0x03,
  SOLID_COLOR: 0x04,
  SPECTRUM: 0x05,
  SUNRISE: 0x06,
  SUNSET: 0x07,
  GRADIENT: 0x08,
  SCHEDULE_CLEAR: 0x10,
  SCHEDULE_ADD: 0x11,
  REQUEST_STATE: 0x20,
  SYNC_TIME: 0x21,
  FACTORY_RESET: 0xFE,
};

const START_BYTE = 0x7E;
const END_BYTE = 0xEF;

function calculateChecksum(data: number[]): number {
  // Use a simple XOR checksum, which is very common for these devices.
  return data.reduce((acc, byte) => acc ^ byte, 0);
}

export function formatCommand(command: string): ArrayBuffer {
  const parts = command.split(':');
  const commandType = parts[0];
  const params = parts.slice(1);
  
  let commandCode = 0;
  let payload: number[] = [];

  switch (commandType) {
    case 'POWER_ON':
      commandCode = COMMAND_CODES.POWER;
      payload = [1];
      break;
    case 'POWER_OFF':
      commandCode = COMMAND_CODES.POWER;
      payload = [0];
      break;
    case 'BRIGHTNESS':
      commandCode = COMMAND_CODES.BRIGHTNESS;
      payload = [parseInt(params[0], 10)];
      break;
    case 'PRESET':
      commandCode = COMMAND_CODES.PRESET;
      payload = [PRESET_MAP[params[0].toLowerCase()] || 0x00];
      break;
    case 'COLOR_HEX':
      commandCode = COMMAND_CODES.SOLID_COLOR;
      const rgbSolid = hexToRgb(`#${params[0]}`);
      if (rgbSolid) {
        payload = [rgbSolid.r, rgbSolid.g, rgbSolid.b];
      }
      break;
    case 'GRADIENT_HEX':
      commandCode = COMMAND_CODES.GRADIENT;
      const rgbStart = hexToRgb(`#${params[0]}`);
      const rgbEnd = hexToRgb(`#${params[1]}`);
      if (rgbStart && rgbEnd) {
        payload = [rgbStart.r, rgbStart.g, rgbStart.b, rgbEnd.r, rgbEnd.g, rgbEnd.b];
      }
      break;
    case 'SPECTRUM':
      commandCode = COMMAND_CODES.SPECTRUM;
      payload = params.map(p => parseInt(p, 10)); // [r,g,b,w,uv]
      break;
    case 'SUNRISE':
      commandCode = COMMAND_CODES.SUNRISE;
      payload = [parseInt(params[0], 10)]; // duration
      break;
    case 'SUNSET':
      commandCode = COMMAND_CODES.SUNSET;
      payload = [parseInt(params[0], 10)]; // duration
      break;
    case 'SCHEDULE_CLEAR':
      commandCode = COMMAND_CODES.SCHEDULE_CLEAR;
      break;
    case 'SCHEDULE_ADD':
      const [index, enabled, startTime, endTime, daysStr, actionType, actionValue] = params;
      commandCode = COMMAND_CODES.SCHEDULE_ADD;
      const startTimeParts = startTime.split(':').map(Number);
      const endTimeParts = endTime.split(':').map(Number);
      const daysMask = parseInt(daysStr.split('').reverse().join(''), 2); // bitmask

      payload = [
        parseInt(index, 10),
        parseInt(enabled, 10),
        startTimeParts[0],
        startTimeParts[1],
        endTimeParts[0],
        endTimeParts[1],
        daysMask
      ];

      if (actionType === 'preset') {
        payload.push(1, PRESET_MAP[actionValue] || 0);
      } else if (actionType === 'color') {
        const rgbColor = hexToRgb(actionValue);
        if (rgbColor) {
            payload.push(2, rgbColor.r, rgbColor.g, rgbColor.b);
        }
      } else if (actionType === 'power_off') {
        payload.push(3);
      }
      break;
    case 'FACTORY_RESET':
      commandCode = COMMAND_CODES.FACTORY_RESET;
      // No payload
      break;
    case 'REQUEST_STATE':
        commandCode = COMMAND_CODES.REQUEST_STATE;
        break;
    case 'SYNC_TIME':
      commandCode = COMMAND_CODES.SYNC_TIME;
      const now = new Date();
      payload = [
        now.getFullYear() - 2000,
        now.getMonth() + 1,
        now.getDate(),
        now.getHours(),
        now.getMinutes(),
        now.getSeconds()
      ];
      break;
    default:
      console.warn(`Unknown command format: ${command}`);
      return new ArrayBuffer(0);
  }
  
  if(commandCode === 0 && commandType !== 'SCHEDULE_CLEAR'){
      console.error(`Could not format command: ${command}`);
      return new ArrayBuffer(0);
  }

  const commandLength = 1 + payload.length;
  const checksum = calculateChecksum([commandCode, ...payload]);
  const finalPacket = new Uint8Array([START_BYTE, commandLength, commandCode, ...payload, checksum, END_BYTE]);
  
  return finalPacket.buffer;
}