import React from 'react';

const Card: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className, ...props }) => {
  return (
    <div
      className={`rounded-2xl border bg-[#161B22]/80 border-[#30363D] shadow-2xl shadow-black/40 backdrop-blur-xl ${className}`}
      {...props}
    />
  );
};

export default Card;