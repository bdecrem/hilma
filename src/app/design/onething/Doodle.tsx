/* A day's doodle, still. Colours come from the concept's CSS:
 * --dd-ink for the line, --dd-acc for the accent strokes, --dd-w the pen. */
export default function Doodle({ svg, className = '', label }: { svg: string; className?: string; label?: string }) {
  return (
    <svg
      className={`dd ${className}`}
      viewBox="0 0 340 170"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      dangerouslySetInnerHTML={{ __html: `<g>${svg}</g>` }}
    />
  )
}
