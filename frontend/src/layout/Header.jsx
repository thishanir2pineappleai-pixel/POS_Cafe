import logo from '../assets/logos/pai-pos-logo.png';

// `meta` is an optional right-hand area (the Dashboard's Cashier / Login / Shop status line).
export default function Header({ title, subtitle, meta }) {
  return (
    <header className="app-header">
      <div className="app-header__logo">
        <img src={logo} alt="PAI POS" />
      </div>
      <div className="app-header__text">
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
      </div>
      {meta && <div className="app-header__meta">{meta}</div>}
    </header>
  );
}
