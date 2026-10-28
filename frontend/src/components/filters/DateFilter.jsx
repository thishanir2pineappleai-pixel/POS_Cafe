import { ArrowRightIcon, CalendarIcon, RefreshIcon, TriangleDownIcon } from '../common/Icons.jsx';
import { formatLong, isSameDay } from '../../api/formatDate.js';

// Date control: "Today (...)", "Custom Day (...)" or "From (...) -> To (...)". Any control opens the picker.
export default function DateFilter({ range, today, onOpen, onReset }) {
  const { start, end } = range;
  const single = !end || isSameDay(start, end);
  const control = (text) => (
    <button type="button" className="date-select" onClick={onOpen}>
      <CalendarIcon size={16} />
      <span>{text}</span>
      <TriangleDownIcon size={20} />
    </button>
  );

  if (single && isSameDay(start, today)) return <div className="date-controls">{control(`Today (${formatLong(start)})`)}</div>;

  return (
    <div className="date-controls">
      {single ? control(`Custom Day (${formatLong(start)})`) : (
        <>
          {control(`From (${formatLong(start)})`)}
          <ArrowRightIcon size={16} className="date-arrow" />
          {control(`To (${formatLong(end)})`)}
        </>
      )}
      <button type="button" className="reset-btn" onClick={onReset} aria-label="Reset to today"><RefreshIcon size={18} /></button>
    </div>
  );
}
