import Header from './Header.jsx';
import Sidebar from './Sidebar.jsx';

export default function MainLayout({ title, subtitle, meta, children }) {
  return (
    <div className="app">
      <Header title={title} subtitle={subtitle} meta={meta} />
      <Sidebar />
      <main className="content">{children}</main>
    </div>
  );
}
