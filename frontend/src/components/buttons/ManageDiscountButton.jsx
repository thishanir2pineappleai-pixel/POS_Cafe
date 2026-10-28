import { BadgePercentIcon } from '../common/Icons.jsx';

export default function ManageDiscountButton({ onClick }) {
  return (
    <button type="button" className="btn btn-primary btn-manage" onClick={onClick}>
      <BadgePercentIcon size={18} />
      Manage Discount
    </button>
  );
}
