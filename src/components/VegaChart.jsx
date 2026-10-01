import { useEffect, useRef } from 'react'
import embed from 'vega-embed'

// onClick(datum): quando informado, cada marca do gráfico vira um filtro clicável.
export function VegaChart({ spec, className = '', onClick }) {
  const container = useRef(null)
  const clickRef = useRef(onClick)
  clickRef.current = onClick

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
      view.addEventListener('click', (_event, item) => {
        const datum = item?.datum
        if (datum && clickRef.current) clickRef.current(datum)
      })
    })
    return () => {
      disposed = true
      view?.finalize()
    }
  }, [spec])

  return <div ref={container} className={`vega-chart ${onClick ? 'clickable' : ''} ${className}`} />
}
