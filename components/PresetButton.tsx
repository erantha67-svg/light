
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
        relative p-4 rounded-xl flex flex-col items-center justify-center space-y-2 
        transition-all duration-300 transform hover:-translate-y-1
        bg-white/5 border border-white/10
        group
        ${isDisabled ? 'opacity-50 cursor-not-allowed' : ''}
        ${isActive ? 'border-purple-500/50' : ''}
      `}
    >
      {isActive && (
        <div className={`absolute -inset-px rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 opacity-50 blur-md group-hover:opacity-75 transition-opacity`}></div>
      )}
      <div className="relative z-10 flex flex-col items-center justify-center space-y-2">
        <Icon className={`w-8 h-8 transition-colors ${isActive ? 'text-white' : 'text-gray-400 group-hover:text-white'}`} />
        <span className={`font-semibold text-sm transition-colors ${isActive ? 'text-white' : 'text-gray-300 group-hover:text-white'}`}>
          {preset.name}
        </span>
      </div>
    </button>
  );
};

export default PresetButton;