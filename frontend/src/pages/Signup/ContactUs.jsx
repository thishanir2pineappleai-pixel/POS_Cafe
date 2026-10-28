import { ChevronLeftIcon, GlobeIcon, MailIcon, PhoneIcon } from '../../components/common/Icons.jsx';
import { SignupLayout } from '../../stepper/SignupStepper.jsx';

// PLACEHOLDER CONTENT copied from the Figma (the website value is clearly dummy text there). Replace with the
// real support contact details when they are provided.
const CONTACTS = [
  { Icon: PhoneIcon, label: 'Phone number', value: '0774412558' },
  { Icon: MailIcon, label: 'Email', value: 'example@gmail.com' },
  { Icon: GlobeIcon, label: 'Website', value: 'assadasdasdasdasda' },
];

export default function ContactUs({ onBack }) {
  return (
    <SignupLayout current={6}>
      <div className="info-page">
        <h1 className="info-page__title">
          <button type="button" className="info-page__back" onClick={onBack} aria-label="Back"><ChevronLeftIcon size={16} /></button>
          Contact us
        </h1>
        <ul className="contacts">
          {CONTACTS.map(({ Icon, label, value }) => (
            <li key={label}>
              <span className="contacts__icon"><Icon size={22} /></span>
              <span className="contacts__text"><strong>{label}</strong>{value}</span>
            </li>
          ))}
        </ul>
      </div>
    </SignupLayout>
  );
}
