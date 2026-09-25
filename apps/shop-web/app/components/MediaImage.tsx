"use client"

import { useState } from "react"

type MediaImageProps = {
  src?: string | null
  alt: string
  fallback: string
  className?: string
}

export function MediaImage({ src, alt, fallback, className = "" }: MediaImageProps) {
  const [failed, setFailed] = useState(false)

  if (!src || failed) return <span className={`${className} media-fallback`} aria-label={`${alt} image unavailable`}>{fallback}</span>

  return <img className={className} src={src} alt={alt} onError={() => setFailed(true)} />
}
