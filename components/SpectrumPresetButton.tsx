import React from 'react';
import { SpectrumPreset } from '../types';

interface SpectrumPresetButtonProps {
  preset: SpectrumPreset;
  isActive: boolean;
  isDisabled: boolean;
  onClick: () => void;
}

const SpectrumPresetButton: React.FC<SpectrumPresetButtonProps> = ({ preset, isActive, isDisabled, onClick }) => {
  const Icon = preset.icon;
  return (
    <button
      onClick={onClick}
      disabled={isDisabled}
      className={`
        relative p-3 rounded-lg flex flex-col items-center justify-center space-y-2 
        transition-all duration-300 transform hover:-translate-y-0.5
        bg-white/5 border border-white/10
        group
        ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''}
        ${isActive ? 'border-purple-500/50' : ''}
      `}
    >
      {isActive && (
        <div className={`absolute -inset-px rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 opacity-40 blur-md group-hover:opacity-60 transition-opacity`}></div>
      )}
      <div className="relative z-10 flex flex-col items-center justify-center space-y-2">
        <Icon className={`w-6 h-6 transition-colors ${isActive ? 'text-white' : 'text-gray-300 group-hover:text-white'}`} />
        <span className={`text-xs text-center font-medium transition-colors ${isActive ? 'text-white' : 'text-gray-300 group-hover:text-white'}`}>
          {preset.name}
        </span>
      </div>
    </button>
  );
};

export default SpectrumPresetButton;
