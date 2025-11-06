
import React, { useCallback } from 'react';

interface SliderProps {
  value: number[];
  onValueChange: (value: number[]) => void;
  max: number;
  step: number;
  disabled?: boolean;
  className?: string;
}

const Slider: React.FC<SliderProps> = ({ value, onValueChange, max, step, disabled, className }) => {
  const handleValueChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    onValueChange([parseInt(event.target.value, 10)]);
  }, [onValueChange]);

  const progress = (value[0] / max) * 100;

  return (
    <div className={`relative w-full h-2 flex items-center ${disabled ? 'opacity-50' : ''}`}>
      <input
        type="range"
        min={0}
        max={max}
        step={step}
        value={value[0]}
        onChange={handleValueChange}
        disabled={disabled}
        className={`
          w-full h-2 bg-transparent appearance-none cursor-pointer
          [&::-webkit-slider-runnable-track]:rounded-full 
          [&::-webkit-slider-runnable-track]:h-2
          [&::-webkit-slider-runnable-track]:bg-slate-700
          [&::-webkit-slider-thumb]:appearance-none 
          [&::-webkit-slider-thumb]:h-5 
          [&::-webkit-slider-thumb]:w-5 
          [&::-webkit-slider-thumb]:rounded-full 
          [&::-webkit-slider-thumb]:bg-cyan-400 
          [&::-webkit-slider-thumb]:-mt-1.5
          [&::-webkit-slider-thumb]:border-2
          [&::-webkit-slider-thumb]:border-slate-900
          [&::-moz-range-track]:rounded-full 
          [&::-moz-range-track]:h-2 
          [&::-moz-range-track]:bg-slate-700
          [&::-moz-range-thumb]:appearance-none 
          [&::-moz-range-thumb]:h-5 
          [&::-moz-range-thumb]:w-5 
          [&::-moz-range-thumb]:rounded-full 
          [&::-moz-range-thumb]:bg-cyan-400
          [&::-moz-range-thumb]:border-2
          [&::-moz-range-thumb]:border-slate-900
        `}
      />
       <div 
        className="absolute top-0 left-0 h-2 rounded-l-full bg-cyan-400 pointer-events-none"
        style={{ width: `${progress}%` }}
      />
    </div>
  );
};

export default Slider;
