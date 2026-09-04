export function App() {
  return (
    <div className="board" data-mode="ambient">
      <section className="area-weather rounded-2xl bg-surface" />
      <section className="area-clock rounded-2xl bg-surface" />
      <section className="area-bins rounded-2xl bg-surface" />
      <section className="area-commute rounded-2xl bg-surface" />
      <section className="area-tfl rounded-2xl bg-surface" />
      <section className="area-crypto rounded-2xl bg-surface" />
    </div>
  );
}
