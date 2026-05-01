'use client'

import { toast } from '@payloadcms/ui'
import React, { Fragment, useCallback, useState } from 'react'

import './index.scss'

const SuccessMessage: React.FC = () => (
  <div>
    Database seeded. Open the <a href="/admin/collections/pages">pages collection</a>.
  </div>
)

export const SeedButton: React.FC = () => {
  const [loading, setLoading] = useState(false)
  const [seeded, setSeeded] = useState(false)
  const [error, setError] = useState<null | string>(null)

  const handleClick = useCallback(
    async (e: React.MouseEvent<HTMLButtonElement>) => {
      e.preventDefault()

      if (seeded) {
        toast.info('Database already seeded.')
        return
      }

      if (loading) {
        toast.info('Seeding already in progress.')
        return
      }

      if (error) {
        toast.error('An error occurred, please refresh and try again.')
        return
      }

      setLoading(true)

      try {
        toast.promise(
          new Promise((resolve, reject) => {
            fetch('/next/seed', { method: 'POST', credentials: 'include' })
              .then((res) => {
                if (res.ok) {
                  resolve(true)
                  setSeeded(true)
                  return
                }

                reject('An error occurred while seeding.')
              })
              .catch((err: unknown) => {
                reject(err)
              })
          }),
          {
            error: 'An error occurred while seeding.',
            loading: 'Seeding with data...',
            success: <SuccessMessage />,
          },
        )
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        setLoading(false)
      }
    },
    [error, loading, seeded],
  )

  let message = ''
  if (loading) message = ' (seeding...)'
  if (seeded) message = ' (done)'
  if (error) message = ` (error: ${error})`

  return (
    <Fragment>
      <button className="seedButton" onClick={handleClick}>
        seed the database
      </button>
      {message}
    </Fragment>
  )
}
