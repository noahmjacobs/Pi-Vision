import { CSSProperties } from 'react'

interface SkeletonProps {
  width?: string
  height?: string
  radius?: string
  style?: CSSProperties
}

export function Skeleton({ width = '100%', height = '14px', radius = '6px', style }: SkeletonProps) {
  return (
    <div
      className="skeleton"
      style={{ width, height, borderRadius: radius, ...style }}
    />
  )
}
