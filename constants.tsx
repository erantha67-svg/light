

import { Preset, SpectrumPreset } from './types';
import {
  SunriseIcon,
  SunIcon,
  DropletsIcon,
  MoonIcon,
  SparklesIcon,
  FishIcon,
  LeafIcon,
} from './components/icons';

export const DEVICE_NAME = 'AQ-S';
export const SERVICE_UUID = '0000fff0-0000-1000-8000-00805f9b34fb';
export const CHARACTERISTIC_UUID = '0000fff1-0000-1000-8000-00805f9b34fb';

export const PRESETS: Preset[] = [
  { id: 'sunrise', name: 'Sunrise/Sunset', icon: SunriseIcon, color: 'from-orange-400 to-pink-400' },
  { id: 'clear', name: 'Clear White', icon: SunIcon, color: 'from-white to-blue-50' },
  { id: 'crystal', name: 'Crystal Water', icon: DropletsIcon, color: 'from-cyan-400 to-blue-400' },
  { id: 'deep', name: 'Deep Ocean', icon: MoonIcon, color: 'from-blue-600 to-indigo-800' },
  { id: 'coral', name: 'Coral Reef', icon: SparklesIcon, color: 'from-pink-400 to-purple-400' },
  { id: 'natural', name: 'Natural Day', icon: FishIcon, color: 'from-yellow-200 to-blue-300' },
];

export const SPECTRUM_PRESETS: SpectrumPreset[] = [
  {
    id: 'reef',
    name: 'Reef Growth',
    icon: SparklesIcon,
    values: { red: 30, green: 50, blue: 100, white: 80, uv: 90 },
  },
  {
    id: 'planted',
    name: 'Planted Tank',
    icon: LeafIcon,
    values: { red: 95, green: 70, blue: 85, white: 90, uv: 10 },
  },
  {
    id: 'fish',
    name: 'Vivid Fish',
    icon: FishIcon,
    values: { red: 80, green: 80, blue: 95, white: 100, uv: 5 },
  },
];