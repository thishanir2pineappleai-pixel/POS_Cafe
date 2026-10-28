import { ClockIcon, EditSquareIcon, GlobeIcon, MailIcon, PhoneIcon, PinIcon } from '../../components/common/Icons.jsx';
import AvatarUpload from '../../components/upload/AvatarUpload.jsx';

export default function ShopProfileDetails({ shop, onEdit }) {
  const rows = [
    { Icon: PinIcon, label: 'Address', value: shop.address },
    { Icon: PhoneIcon, label: 'Phone Number', value: shop.phone },
    { Icon: MailIcon, label: 'Email', value: shop.email || '-' },
    { Icon: GlobeIcon, label: 'Website', value: shop.website || '-' },
    { Icon: ClockIcon, label: 'Timezone', value: shop.timezone || '-' }, // a shop made at signup has none until it is edited
  ];

  return (
    <section className="panel view-card">
      <div className="view-card__head">
        <h2 className="settings-card__title">Business Information</h2>
        <button type="button" className="btn btn-outline-green" onClick={onEdit}><EditSquareIcon size={16} />Edit Profile</button>
      </div>

      <div className="view-card__summary">
        <AvatarUpload value={shop.avatar} readOnly />
        <div className="view-card__id">
          <span className="muted-label">Shop Name</span>
          <strong>{shop.name}</strong>
          <span className="muted-label">Status</span>
          <span className="badge-mint badge-mint--static">{shop.status}</span>
        </div>
      </div>

      <dl className="view-card__rows">
        {rows.map(({ Icon, label, value }) => (
          <div key={label}>
            <dt><Icon size={14} />{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
