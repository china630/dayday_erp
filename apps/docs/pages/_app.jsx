import { useEffect } from 'react'
import mediumZoom from 'medium-zoom'
import 'nextra-theme-docs/style.css'
import '../styles/global.css'

export default function App({ Component, pageProps }) {
  useEffect(() => {
    const zoom = mediumZoom('.nextra-content img', {
      margin: 24,
      background: 'rgba(0, 0, 0, 0.85)'
    })

    return () => {
      zoom.detach()
    }
  }, [])

  return <Component {...pageProps} />
}
