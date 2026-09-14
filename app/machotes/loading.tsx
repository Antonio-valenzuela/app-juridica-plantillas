export default function MachotesLoading() {
  return (
    <div style={{ padding: '2rem', display: 'grid', gridTemplateColumns: '280px 1fr', gap: '1.5rem', alignItems: 'start' }}>
      <style>{`
        @keyframes sk-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        .sk { background: var(--border); border-radius: var(--radius-sm); animation: sk-pulse 1.6s ease-in-out infinite; }
        @media (max-width: 768px) {
          .machote-sk-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>

      {/* Sidebar */}
      <div className="machote-sk-grid" style={{ display: 'grid', gap: '0.5rem' }}>
        <div className="sk" style={{ height: 16, width: '60%' }} />
        {[1, 2, 3, 4, 5, 6, 7].map((i) => (
          <div key={i} className="sk" style={{ height: 38 }} />
        ))}
      </div>

      {/* Main panel */}
      <div style={{ display: 'grid', gap: '1.25rem' }}>
        <div className="sk" style={{ height: 22, width: '40%' }} />
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '1.5rem', display: 'grid', gap: '1rem' }}>
          {[200, 240, 180, 220, 200, 160].map((w, i) => (
            <div key={i} style={{ display: 'grid', gap: '0.4rem' }}>
              <div className="sk" style={{ height: 13, width: 100 }} />
              <div className="sk" style={{ height: 40 }} />
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          {[120, 110, 100, 90].map((w, i) => (
            <div key={i} className="sk" style={{ height: 38, width: w }} />
          ))}
        </div>
      </div>
    </div>
  );
}
