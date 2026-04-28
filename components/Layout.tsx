import Sidebar from './Sidebar';

export default function Layout({ current, children }: { current?: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <Sidebar current={current} />
      <main className="flex-1 min-w-0 flex flex-col">{children}</main>
    </div>
  );
}
