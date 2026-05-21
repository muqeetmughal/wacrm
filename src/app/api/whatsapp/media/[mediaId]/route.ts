import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getMediaUrl } from '@/lib/whatsapp/meta-api'
import { decrypt } from '@/lib/whatsapp/encryption'

const META_API_VERSION = 'v21.0'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ mediaId: string }> }
) {
  try {
    const { mediaId } = await params

    if (!mediaId) {
      return NextResponse.json(
        { error: 'Media ID is required' },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { data: config, error: configError } = await supabase
      .from('whatsapp_config')
      .select('*')
      .eq('user_id', user.id)
      .single()

    if (configError || !config) {
      return NextResponse.json(
        { error: 'WhatsApp not configured' },
        { status: 400 }
      )
    }

    const accessToken = decrypt(config.access_token)

    // Resolve media ID to Meta's CDN download URL + MIME type
    const mediaInfo = await getMediaUrl({ mediaId, accessToken })

    const contentType = mediaInfo.mimeType || 'application/octet-stream'

    // Stream directly from Meta instead of buffering in memory.
    // This avoids serverless timeout / memory limits for large files
    // and lets the browser start playback before the full download.
    const metaRes = await fetch(mediaInfo.url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    if (!metaRes.ok) {
      throw new Error(`Meta download failed: ${metaRes.status}`)
    }

    const metaContentType =
      metaRes.headers.get('content-type') || contentType

    const headers = new Headers({
      'Content-Type': metaContentType,
      'Cache-Control': 'public, max-age=86400',
      'Accept-Ranges': 'bytes',
    })

    // Handle Range requests (required by <audio> / <video> for seeking
    // and by Safari for any playback at all).
    const range = request.headers.get('range')
    if (range) {
      const total = Number(metaRes.headers.get('content-length')) ||
        Number(metaRes.headers.get('x-goog-stored-content-length')) || 0

      if (total > 0) {
        const parts = range.replace(/bytes=/, '').split('-')
        const start = parseInt(parts[0], 10)
        const end = parts[1] ? parseInt(parts[1], 10) : total - 1

        headers.set('Content-Range', `bytes ${start}-${end}/${total}`)
        headers.set('Content-Length', String(end - start + 1))

        // Fetch only the requested byte range from Meta
        const rangeRes = await fetch(mediaInfo.url, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Range: `bytes=${start}-${end}`,
          },
        })

        if (!rangeRes.ok && rangeRes.status !== 206) {
          throw new Error(`Meta range download failed: ${rangeRes.status}`)
        }

        return new Response(rangeRes.body, {
          status: 206,
          headers,
        })
      }
    }

    // No Range header — pass through the whole stream
    return new Response(metaRes.body, {
      status: 200,
      headers,
    })
  } catch (error) {
    console.error('Error in WhatsApp media GET:', error)
    return NextResponse.json(
      { error: 'Failed to fetch media' },
      { status: 500 }
    )
  }
}
