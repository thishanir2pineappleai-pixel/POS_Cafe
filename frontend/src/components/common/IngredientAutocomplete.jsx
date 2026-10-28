import { useState } from 'react';

// Text input that suggests ingredient names from `options` while typing.
export default function IngredientAutocomplete({ value, onChange, options, placeholder }) {
  const [open, setOpen] = useState(false);
  const term = value.trim().toLowerCase();
  const matches = term ? options.filter((o) => o.name.toLowerCase().includes(term)) : [];

  return (
    <div className="autocomplete">
      <input className="input" type="text" value={value} placeholder={placeholder}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} />
      {open && matches.length > 0 && (
        <ul className="autocomplete__list">
          {matches.map((o) => (
            <li key={o.id}>
              {/* onMouseDown keeps the input focused so the click lands before blur closes the list */}
              <button type="button" onMouseDown={(e) => { e.preventDefault(); onChange(o.name); setOpen(false); }}>
                {o.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
