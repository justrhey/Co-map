const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'potholes', label: 'Potholes' },
  { value: 'streetlight', label: 'Lights' },
  { value: 'graffiti', label: 'Graffiti' },
  { value: 'illegal_dumping', label: 'Dumping' },
  { value: 'traffic', label: 'Traffic' },
];

export default function FilterBar({ active, onChange, counts, total, error, onRetry, loaded }) {
  return (
    <div className="filter-bar">
      <div className="filter-scroll">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            className={`filter-pill${active === f.value ? ' active' : ''}`}
            onClick={() => onChange(f.value)}
          >
            {f.label}
            {(counts?.[f.value] ?? 0) > 0 && <span className="pill-count">{counts[f.value]}</span>}
          </button>
        ))}
      </div>
      <div className={`filter-stats${error ? ' error' : ''}`}>
        {error ? <><span>{error}</span><button className="retry-btn" onClick={onRetry}>Retry</button></> : (total > 0 ? `${total} report${total > 1 ? 's' : ''}` : (loaded ? 'No reports in this area yet' : 'Loading...'))}
      </div>
    </div>
  );
}
