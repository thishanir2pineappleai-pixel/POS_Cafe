import { useEffect, useRef, useState } from 'react';
import { TriangleDownIcon, TriangleUpIcon } from '../common/Icons.jsx';

const FORMATS = ['.pdf', '.csv', '.xls'];

// "Export Sales Data" dropdown; calls onExport('pdf' | 'csv' | 'xls').
export default function ExportSalesDataButton({ onExport }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  return (
    <div className="export" ref={ref}>
      <button type="button" className={`btn btn-export${open ? ' is-open' : ''}`} onClick={() => setOpen(!open)} aria-expanded={open}>
        Export Sales Data
        {open ? <TriangleUpIcon size={18} /> : <TriangleDownIcon size={18} />}
      </button>
      {open && (
        <ul className="export__menu">
          {FORMATS.map((f) => (
            <li key={f}><button type="button" onClick={() => { onExport(f.slice(1)); setOpen(false); }}>{f}</button></li>
          ))}
        </ul>
      )}
    </div>
  );
}
