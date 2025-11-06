import React, { useCallback } from 'react';

interface SliderProps {
  value: number[];
  onValueChange: (value: number[]) => void;
  max: number;
  step: number;
  min?: number;
  disabled?: boolean;
  className?: string;
  trackClassName?: string;
}

const Slider: React.FC<SliderProps> = ({ value, onValueChange, max, step, min = 0, disabled, className, trackClassName }) => {
  const handleValueChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    onValueChange([parseInt(event.target.value, 10)]);
  }, [onValueChange]);

  const progress = ((value[0] - min) / (max - min)) * 100;
  
  const trackClasses = trackClassName || 'bg-gradient-to-r from-purple-500 to-pink-500';

  return (
    <div className={`relative w-full h-2 flex items-center ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${className}`}>
      <div className="absolute top-0 left-0 h-2 rounded-full bg-[#30363D] w-full" />
      <div 
        className={`absolute top-0 left-0 h-2 rounded-l-full pointer-events-none ${trackClasses}`}
        style={{ width: `${progress}%` }}
      />
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value[0]}
        onChange={handleValueChange}
        disabled={disabled}
        className={`
          absolute w-full h-2 bg-transparent appearance-none cursor-pointer group
          [&::-webkit-slider-thumb]:appearance-none 
          [&::-webkit-slider-thumb]:h-5 
          [&::-webkit-slider-thumb]:w-5 
          [&::-webkit-slider-thumb]:rounded-full 
          [&::-webkit-slider-thumb]:bg-white
          [&::-webkit-slider-thumb]:shadow-md
          [&::-webkit-slider-thumb]:transition-transform
          [&::-webkit-slider-thumb]:group-hover:scale-110
          [&::-moz-range-thumb]:appearance-none 
          [&::-moz-range-thumb]:h-5 
          [&::-moz-range-thumb]:w-5 
          [&::-moz-range-thumb]:rounded-full 
          [&::-moz-range-thumb]:bg-white
          [&::-moz-range-thumb]:border-none
          [&::-moz-range-thumb]:shadow-md
        `}
      />
    </div>
  );
};

export default Slider;