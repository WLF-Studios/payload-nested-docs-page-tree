import config from '@payload-config'
import { headers } from 'next/headers'
import { createLocalReq, getPayload } from 'payload'

import { seedWithRequest } from '../../../seed.js'

export const maxDuration = 60

export async function POST(): Promise<Response> {
  const payload = await getPayload({ config })
  const requestHeaders = await headers()
  const { user } = await payload.auth({ headers: requestHeaders })

  if (!user) {
    return new Response('Action forbidden.', { status: 403 })
  }

  try {
    const req = await createLocalReq({ user }, payload)

    await seedWithRequest({ payload, req })

    return Response.json({ success: true })
  } catch (err) {
    payload.logger.error({ err, message: 'Error seeding data' })

    return new Response('Error seeding data.', { status: 500 })
  }
}
