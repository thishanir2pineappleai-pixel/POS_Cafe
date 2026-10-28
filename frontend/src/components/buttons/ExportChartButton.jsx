import { TriangleDownIcon } from '../common/Icons.jsx';

// "Export" dropdown button of the Sales Trend card. The design shows no menu options, so it has no actions yet.
export default function ExportChartButton({ onClick }) {
  return (
    <button type="button" className="chart-export" onClick={onClick} aria-haspopup="menu">
      Export
      <TriangleDownIcon size={18} />
    </button>
  );
}
