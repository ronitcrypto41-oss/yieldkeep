// app/(app)/loading.tsx
// Shown instantly while a page's code loads, so a click never feels stuck.
export default function Loading() {
  const bar = (w: string, h = 14) => (
    <div
      style={{
        width: w,
        height: h,
        borderRadius: 6,
        background: "var(--border)",
        opacity: 0.6,
      }}
    />
  );
  return (
    <div className="dashboard" aria-busy="true" aria-label="Loading">
      <div className="dash-head">
        <div style={{ display: "grid", gap: 10 }}>
          {bar("220px", 26)}
          {bar("340px")}
        </div>
      </div>
      <div className="stat-grid">
        {[0, 1, 2, 3].map((i) => (
          <div className="stat-card" key={i} style={{ display: "grid", gap: 10 }}>
            {bar("90px", 11)}
            {bar("120px", 24)}
            {bar("100px", 11)}
          </div>
        ))}
      </div>
      <div className="card" style={{ marginTop: 24, display: "grid", gap: 12 }}>
        {bar("160px", 16)}
        {bar("100%")}
        {bar("100%")}
        {bar("70%")}
      </div>
    </div>
  );
}