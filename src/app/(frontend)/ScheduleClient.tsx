'use client'

import dynamic from 'next/dynamic'

const ScheduleDashboard = dynamic(
  () => import('@/components/schedule/App'),
  { ssr: false }
)

export default function ScheduleClient() {
  return <ScheduleDashboard />
}