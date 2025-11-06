import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'outline' | 'ghost';
  size?: 'default' | 'sm' | 'lg' | 'icon';
}

const Button: React.FC<ButtonProps> = ({ className, variant = 'default', size = 'default', ...props }) => {
  const baseClasses = 'inline-flex items-center justify-center rounded-md text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0D1117] disabled:pointer-events-none disabled:opacity-50';

  const variantClasses = {
    default: 'bg-gradient-to-r from-purple-500 to-pink-500 text-white font-semibold hover:opacity-90 shadow-lg shadow-purple-500/20',
    outline: 'border border-[#30363D] bg-transparent hover:bg-white/5',
    ghost: 'hover:bg-white/10',
  };

  const sizeClasses = {
    default: 'h-10 px-4 py-2',
    sm: 'h-9 rounded-md px-3',
    lg: 'h-11 rounded-md px-8',
    icon: 'h-10 w-10',
  };

  const combinedClasses = `${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`;

  return <button className={combinedClasses} {...props} />;
};

export default Button;