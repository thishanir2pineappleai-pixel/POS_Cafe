import Header from './Header.jsx';
import Sidebar from './Sidebar.jsx';

export default function MainLayout({ title, subtitle, meta, active, children }) {
  return (
    <div className="app">
      <Header title={title} subtitle={subtitle} meta={meta} />
      <Sidebar active={active} />
      <main className="content">{children}</main>
    </div>
  );
}
