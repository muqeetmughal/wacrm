import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getMediaUrl } from '@/lib/whatsapp/meta-api'
import { decrypt } from '@/lib/whatsapp/encryption'

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

    // Resolve media ID to Meta's CDN download URL + MIME type.
    // Meta's mime_type is the authoritative source (e.g. "audio/ogg").
    const mediaInfo = await getMediaUrl({ mediaId, accessToken })

    // Strip any MIME parameters (e.g. "; codecs=opus") that can confuse
    // browser <audio> elements into refusing playback.
    const baseMime = (mediaInfo.mimeType || 'application/octet-stream')
      .split(';')[0]
      .trim()

    // Check for Range header BEFORE any fetch so we don't needlessly
    // request the full body when only a byte range is wanted.
    const range = request.headers.get('range')

    const fetchHeaders: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
    }
    if (range) {
      fetchHeaders['Range'] = range
    }

    const metaRes = await fetch(mediaInfo.url, { headers: fetchHeaders })

    if (!metaRes.ok && metaRes.status !== 206) {
      throw new Error(`Meta download failed: ${metaRes.status}`)
    }

    const responseHeaders = new Headers({
      'Content-Type': baseMime,
      'Cache-Control': 'public, max-age=86400',
    })

    // Forward Content-Range and Content-Length from Meta when the
    // response is a 206 Partial Content (Range request).
    const metaContentRange = metaRes.headers.get('content-range')
    if (metaContentRange) {
      responseHeaders.set('Content-Range', metaContentRange)
    }
    const metaContentLength = metaRes.headers.get('content-length')
    if (metaContentLength) {
      responseHeaders.set('Content-Length', metaContentLength)
    }

    return new Response(metaRes.body, {
      status: range ? 206 : 200,
      headers: responseHeaders,
    })
  } catch (error) {
    console.error('Error in WhatsApp media GET:', error)
    return NextResponse.json(
      { error: 'Failed to fetch media' },
      { status: 500 }
    )
  }
}
