import { scoreColor } from '../utils/score';

// ── Score Circle Component ──────────────────────────────────────
export default function ScoreCircle({ score }) {
  if (score == null) return null;
  const grade = score.letter_grade || 'F';
  const col = scoreColor(score.total);

  return (
    <div className="score-circle" style={{ borderColor: col }}>
      <span className="score-circle-grade" style={{ color: col }}>{grade}</span>
      <span className="score-circle-pct">{score.total}</span>
    </div>
  );
}
