import { useEffect, useRef, useState } from 'react';
import { ChevronDownIcon, ChevronUpIcon, TriangleDownIcon, TriangleUpIcon } from './Icons.jsx';

// Shared dropdown used by the Menu filters and the Settings timezone field.
// options: [{ value, label }]; `triangle` swaps the chevron for the solid arrow used in Settings.
export default function Dropdown({ value, options, placeholder, onChange, className = '', triangle = false }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const selected = options.find((o) => o.value === value);

  return (
    <div className={`dropdown ${className}`} ref={ref}>
      <button type="button" className={`input input-select${open ? ' is-open' : ''}`} onClick={() => setOpen(!open)}>
        <span className={value ? '' : 'is-placeholder'}>{selected && value ? selected.label : placeholder}</span>
        {triangle
          ? (open ? <TriangleUpIcon size={20} /> : <TriangleDownIcon size={20} />)
          : (open ? <ChevronUpIcon size={14} /> : <ChevronDownIcon size={14} />)}
      </button>
      {open && (
        <ul className="dropdown__list">
          {options.map((o) => (
            <li key={o.value}>
              <button type="button" className={o.value === value ? 'is-selected' : ''}
                onClick={() => { onChange(o.value); setOpen(false); }}>
                {o.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
