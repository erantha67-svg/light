import React from 'react';

interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'outline';
}

const Badge: React.FC<BadgeProps> = ({ className, variant = 'default', ...props }) => {
  const variantClasses = {
    default: 'border-transparent bg-purple-500 text-white',
    outline: 'text-gray-300 border-[#30363D] bg-white/5',
  };

  const combinedClasses = `inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 ${variantClasses[variant]} ${className}`;

  return <div className={combinedClasses} {...props} />;
};

export default Badge;