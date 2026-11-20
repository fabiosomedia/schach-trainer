import { CATEGORY_INFO, isBad } from '../analysis/classify'
import { formatEval } from '../analysis/eval'
import type { MoveAnalysis } from '../analysis/explain'

type Props = {
  analysis: MoveAnalysis | null
  waiting: boolean
  canRetry: boolean
  onRetry: () => void
  hintLevel: number
  canHint: boolean
  onHint: () => void
}

const HINT_LABEL = ['💡 Hinweis', '💡 Mehr Hinweis', '💡 Zug zeigen', '💡 Zug gezeigt']

export function CoachPanel({ analysis, waiting, canRetry, onRetry, hintLevel, canHint, onHint }: Props) {
  const info = analysis ? CATEGORY_INFO[analysis.category] : null

  return (
    <div className="card coach">
      <h2>Coach</h2>
      {!analysis && (
        <p className="coach-text muted-text">
          {waiting ? 'Ich schaue mir deinen Zug an …' : 'Spiel einen Zug – ich sage dir, was gut war und was nicht.'}
        </p>
      )}
      {analysis && info && (
        <>
          <div className="coach-head">
            <span className="badge" style={{ background: info.color }}>
              {info.symbol} {info.label}
            </span>
            <span className="coach-move">{analysis.san}</span>
            <span className="coach-eval">
              {formatEval(analysis.scoreBefore)} → {formatEval(analysis.scoreAfter)}
            </span>
          </div>
          <p className="coach-text">{analysis.text}</p>
          {analysis.tips.map((t) => (
            <p key={t.motif} className="coach-tip">
              {t.text}
            </p>
          ))}
          {isBad(analysis.category) && analysis.arrows.length > 0 && (
            <p className="coach-legend">
              <span className="dot green" /> besserer Zug <span className="dot red" /> Antwort des Gegners
            </p>
          )}
        </>
      )}
      <div className="row">
        <button onClick={onHint} disabled={!canHint || hintLevel >= 3}>
          {HINT_LABEL[Math.min(hintLevel, 3)]}
        </button>
        <button onClick={onRetry} disabled={!canRetry}>
          ⟲ Nochmal versuchen
        </button>
      </div>
    </div>
  )
}
