import { ArrowRight, CheckCircle2 } from 'lucide-react'

type Props = {
  eyebrow: string
  title: string
  description: string
  primaryLabel: string
  onPrimary: () => void
  secondaryLabel?: string
  onSecondary?: () => void
  meta?: string
}

export default function StudyCompletion({ eyebrow, title, description, primaryLabel, onPrimary, secondaryLabel, onSecondary, meta }: Props) {
  return <section className="study-completion panel" aria-label={title}>
    <div className="study-completion-icon"><CheckCircle2 size={23}/></div>
    <div className="study-completion-copy">
      <span className="study-completion-eyebrow">{eyebrow}</span>
      <h2>{title}</h2>
      <p>{description}</p>
      {meta && <small>{meta}</small>}
    </div>
    <div className="study-completion-actions">
      <button type="button" className="primary" onClick={onPrimary}>{primaryLabel}<ArrowRight size={15}/></button>
      {secondaryLabel && onSecondary && <button type="button" className="secondary" onClick={onSecondary}>{secondaryLabel}</button>}
    </div>
  </section>
}