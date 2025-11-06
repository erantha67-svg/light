
import React, { useEffect } from 'react';
import ReactDOM from 'react-dom';

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
}

const Dialog: React.FC<DialogProps> = ({ open, onOpenChange, title, description, children }) => {
  useEffect(() => {
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onOpenChange(false);
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => {
      window.removeEventListener('keydown', handleEsc);
    };
  }, [onOpenChange]);

  if (!open) return null;

  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div
        className="fixed inset-0"
        onClick={() => onOpenChange(false)}
        aria-hidden="true"
      ></div>
      <div className="relative z-10 w-full max-w-md m-4 bg-[#161B22] border border-[#30363D] text-white rounded-lg shadow-2xl shadow-black/50">
        <div className="p-6">
          <div className="mb-4">
            <h2 className="text-xl font-semibold text-white">{title}</h2>
            {description && <p className="text-gray-400 pt-2">{description}</p>}
          </div>
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default Dialog;