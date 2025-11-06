
import React from 'react';

interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
}

const Switch: React.FC<SwitchProps> = ({ checked, onCheckedChange, disabled, className = '' }) => {
  const handleToggle = () => {
    if (!disabled) {
      onCheckedChange(!checked);
    }
  };

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={handleToggle}
      disabled={disabled}
      className={`
        relative inline-flex h-7 w-12 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent 
        transition-colors duration-300 ease-in-out focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 focus:ring-offset-[#161B22]
        ${checked ? 'bg-purple-500' : 'bg-[#30363D]'}
        ${disabled ? 'cursor-not-allowed opacity-50' : ''}
        ${className}
      `}
    >
      <span
        aria-hidden="true"
        className={`
          pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow ring-0 
          transition duration-300 ease-in-out
          ${checked ? 'translate-x-5' : 'translate-x-0'}
        `}
      />
    </button>
  );
};

export default Switch;