
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
      <div
        className="fixed inset-0"
        onClick={() => onOpenChange(false)}
        aria-hidden="true"
      ></div>
      <div className="relative z-10 w-full max-w-md m-4 bg-slate-900 border border-cyan-500/50 text-white rounded-lg shadow-lg">
        <div className="p-6">
          <div className="mb-4">
            <h2 className="text-xl font-semibold text-white">{title}</h2>
            {description && <p className="text-cyan-200 pt-2">{description}</p>}
          </div>
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default Dialog;
