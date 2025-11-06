import React from 'react';

const Card: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className, ...props }) => {
  return (
    <div
      className={`rounded-xl border shadow-sm ${className}`}
      {...props}
    />
  );
};

export default Card;