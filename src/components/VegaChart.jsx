import { useEffect, useRef } from 'react'
import embed from 'vega-embed'

export function VegaChart({ spec, className = '' }) {
  const container = useRef(null)

  useEffect(() => {
    let disposed = false
    let view
    container.current.replaceChildren()
    embed(container.current, spec, {
      actions: false,
      renderer: 'svg',
      theme: 'dark',
      defaultStyle: false,
    }).then((result) => {
      if (disposed) {
        result.view.finalize()
        return
      }
      view = result.view
    })
    return () => {
      disposed = true
      view?.finalize()
    }
  }, [spec])

  return <div ref={container} className={`vega-chart ${className}`} />
}
