
import React from 'react';
import { Preset } from '../types';

interface PresetButtonProps {
  preset: Preset;
  isActive: boolean;
  isDisabled: boolean;
  onClick: () => void;
}

const PresetButton: React.FC<PresetButtonProps> = ({ preset, isActive, isDisabled, onClick }) => {
  const Icon = preset.icon;
  return (
    <button
      onClick={onClick}
      disabled={isDisabled}
      className={`
        p-4 rounded-xl flex flex-col items-center justify-center space-y-2 
        transition-all duration-200 transform hover:scale-105
        ${
          isActive
            ? `ring-4 ring-offset-2 ring-offset-slate-800 ring-cyan-400 bg-gradient-to-br ${preset.color}`
            : 'bg-white/10 hover:bg-white/20 border border-white/20'
        }
        ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''}
      `}
    >
      <Icon className={`w-8 h-8 ${isActive ? 'text-white' : 'text-cyan-300'}`} />
      <span className={`font-semibold text-sm ${isActive ? 'text-white' : 'text-white'}`}>
        {preset.name}
      </span>
    </button>
  );
};

export default PresetButton;
