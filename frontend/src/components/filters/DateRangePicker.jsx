import { useEffect, useState } from 'react';
import { ModalShell } from '../modals/ConfirmationModal.jsx';
import CancelButton from '../buttons/CancelButton.jsx';
import SaveButton from '../buttons/SaveButton.jsx';
import { ArrowRightIcon, CalendarIcon, ChevronLeftIcon, ChevronRightIcon, RefreshIcon } from '../common/Icons.jsx';
import { MONTHS_FULL, formatSlash, isSameDay, parseSlash } from '../../utils/formatDate.js';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const monthStart = (d) => new Date(d.getFullYear(), d.getMonth(), 1);
const addMonths = (d, n) => new Date(d.getFullYear(), d.getMonth() + n, 1);

function Calendar({ month, onMonth, start, end, onPick, disabled }) {
  const offset = (month.getDay() + 6) % 7; // weeks start on Monday
  const cells = Array.from({ length: 42 }, (_, i) => new Date(month.getFullYear(), month.getMonth(), 1 - offset + i));
  const range = start && end && !isSameDay(start, end);

  return (
    <div className={`cal${disabled ? ' is-disabled' : ''}`}>
      <div className="cal__head">
        <button type="button" onClick={() => onMonth(addMonths(month, -1))} aria-label="Previous month"><ChevronLeftIcon size={14} /></button>
        <span>{disabled ? 'Month / Year' : `${MONTHS_FULL[month.getMonth()]} ${month.getFullYear()}`}</span>
        <button type="button" onClick={() => onMonth(addMonths(month, 1))} aria-label="Next month"><ChevronRightIcon size={14} /></button>
      </div>
      <div className="cal__grid">
        {WEEKDAYS.map((d) => <span key={d} className="cal__weekday">{d}</span>)}
        {cells.map((d) => {
          const out = d.getMonth() !== month.getMonth();
          const isStart = !out && isSameDay(d, start);
          const isEnd = !out && isSameDay(d, end);
          const between = !out && range && d > start && d < end;
          const band = range && !out && (between || isStart || isEnd) ? ` band${isStart ? ' band--start' : ''}${isEnd ? ' band--end' : ''}` : '';
          return (
            <span key={d.getTime()} className={`cal__cell${band}`}>
              <button type="button" disabled={out || disabled} className={`cal__day${isStart || isEnd ? ' is-selected' : ''}${out ? ' is-out' : ''}`}
                onClick={() => onPick(d)}>
                {d.getDate()}
              </button>
            </span>
          );
        })}
      </div>
    </div>
  );
}

// "Select Date / Date Range" dialog: two calendars plus typed dd/mm/yyyy inputs.
// The second calendar is greyed until a start date exists (as in the designs).
export default function DateRangePicker({ start: initialStart, end: initialEnd, today, onApply, onCancel }) {
  const [start, setStart] = useState(initialStart ?? null);
  const [end, setEnd] = useState(initialEnd ?? null);
  const [startText, setStartText] = useState(initialStart ? formatSlash(initialStart) : '');
  const [endText, setEndText] = useState(initialEnd ? formatSlash(initialEnd) : '');
  const [left, setLeft] = useState(monthStart(initialStart ?? today));
  const [right, setRight] = useState(addMonths(monthStart(initialStart ?? today), 1));

  useEffect(() => { setStartText(start ? formatSlash(start) : ''); }, [start]);
  useEffect(() => { setEndText(end ? formatSlash(end) : ''); }, [end]);

  const pick = (d) => {
    if (!start || end) { setStart(d); setEnd(null); return; }
    if (d < start) { setEnd(start); setStart(d); } else setEnd(d);
  };
  const typed = (setText, setDate, which) => (e) => {
    const text = e.target.value;
    setText(text);
    if (text === '') { setDate(null); return; }
    const parsed = parseSlash(text);
    if (parsed) { setDate(parsed); (which === 'start' ? setLeft : setRight)(monthStart(parsed)); }
  };
  const reset = () => { setStart(null); setEnd(null); };

  return (
    <ModalShell className="modal--date">
      <h2 className="modal__title modal__title--sm">Select Date / Date Range</h2>
      <div className="range-inputs">
        <div className="field">
          <span className="field-label">Start Date</span>
          <label className="date-input"><CalendarIcon size={14} />
            <input value={startText} placeholder="DD/MM/YYYY" onChange={typed(setStartText, setStart, 'start')} /></label>
        </div>
        <ArrowRightIcon size={16} className="date-arrow" />
        <div className="field">
          <span className="field-label">End Date</span>
          <label className="date-input"><CalendarIcon size={14} />
            <input value={endText} placeholder="DD/MM/YYYY" onChange={typed(setEndText, setEnd, 'end')} /></label>
        </div>
        <button type="button" className="reset-btn reset-btn--sm" onClick={reset} aria-label="Clear dates"><RefreshIcon size={15} /></button>
      </div>
      <p className="range-hint">You can type manually or select from calendar.</p>

      <div className="cal-wrap">
        <Calendar month={left} onMonth={setLeft} start={start} end={end} onPick={pick} />
        <Calendar month={right} onMonth={setRight} start={start} end={end} onPick={pick} disabled={!start} />
      </div>

      <div className="modal__actions modal__actions--date">
        <CancelButton onClick={onCancel} />
        <SaveButton label="Apply" onClick={() => { if (start) onApply({ start, end: end ?? start }); }} />
      </div>
    </ModalShell>
  );
}
