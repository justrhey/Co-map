import { useAddress } from '../hooks/useAddress';
export default function BottomCard({ latlng, onReport }) {
  const { address, loading } = useAddress(latlng);
  return (
    <div className="bottom-card">
      <div className="bottom-card-pin">
        <svg viewBox="0 0 28 40" width="20" height="28" fill="none">
          <path d="M14 39C14 39 2 26 2 14 2 7.5 7.5 2 14 2s12 5.5 12 12c0 12-12 25-12 25z" fill="#333"/>
          <circle cx="14" cy="14" r="5" fill="#fff"/>
        </svg>
      </div>
      <div className="bottom-card-body">
        <span className="bottom-card-label">Add report</span>
        <span className={`bottom-card-address${loading ? ' loading' : ''}`}>
          {loading ? 'Locating...' : address}
        </span>
      </div>
      <button className="bottom-card-btn" onClick={onReport}>Report</button>
    </div>
  );
}
