import { useEffect, useRef, useState } from 'react';

function ChevronDownIcon({ className = '' }) {
  return (
    <svg className={`select-chevron ${className}`} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

export function Select({ value, options, onChange, className = '', ariaLabel }) {
  const [isOpen, setIsOpen] = useState(false);
  const [openUp, setOpenUp] = useState(false);
  const selectRef = useRef(null);
  const selectedOption = options.find((option) => option.value === value);

  const toggleMenu = () => {
    if (isOpen) {
      setIsOpen(false);
      return;
    }
    const bounds = selectRef.current?.getBoundingClientRect();
    const estimatedHeight = Math.min(options.length * 40 + 8, 260);
    const shouldOpenUp = bounds
      && window.innerHeight - bounds.bottom < estimatedHeight
      && bounds.top > estimatedHeight;
    setOpenUp(Boolean(shouldOpenUp));
    setIsOpen(true);
  };

  useEffect(() => {
    const closeSelect = (event) => {
      if (!selectRef.current?.contains(event.target)) setIsOpen(false);
    };
    document.addEventListener('mousedown', closeSelect);
    return () => document.removeEventListener('mousedown', closeSelect);
  }, []);

  return (
    <div ref={selectRef} className="select-wrap">
      <button
        type="button"
        className={`ctrl-select custom-select-button ${className}`}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={toggleMenu}
      >
        <span>{selectedOption?.label}</span>
        <ChevronDownIcon className={isOpen ? 'is-open' : ''} />
      </button>
      {isOpen && (
        <div className={`select-menu${openUp ? ' is-up' : ''}`} role="listbox">
          {options.map((option) => (
            <button
              type="button"
              role="option"
              aria-selected={option.value === value}
              className={`select-option${option.value === value ? ' selected' : ''}`}
              key={option.value}
              onClick={() => { onChange(option.value); setIsOpen(false); setOpenUp(false); }}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
