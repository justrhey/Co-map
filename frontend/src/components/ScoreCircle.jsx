import { scoreColor } from '../utils/score';

// ── Score Circle Component ──────────────────────────────────────
export default function ScoreCircle({ score }) {
  if (score == null) return null;
  const grade = score.letter_grade || 'F';
  const col = scoreColor(score.total);

  // The ring carries the number; the big letter beside it carries the grade —
  // so the two don't repeat the same information.
  return (
    <div className="score-circle" style={{ borderColor: col }}>
      <span className="score-circle-num" style={{ color: col }}>{score.total}</span>
    </div>
  );
}
