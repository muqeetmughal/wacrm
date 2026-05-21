import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendTextMessage, sendTemplateMessage, sendAudioMessage, sendImageMessage, sendDocumentMessage, uploadMedia } from '@/lib/whatsapp/meta-api'
import { decrypt, encrypt, isLegacyFormat } from '@/lib/whatsapp/encryption'
import {
  sanitizePhoneForMeta,
  isValidE164,
  phoneVariants,
  isRecipientNotAllowedError,
} from '@/lib/whatsapp/phone-utils'
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from '@/lib/rate-limit'

export async function POST(request: Request) {
  try {
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

    // Per-user rate limit. Bucket key is scoped to this route so
    // `/broadcast` has an independent budget.
    const limit = checkRateLimit(`send:${user.id}`, RATE_LIMITS.send)
    if (!limit.success) {
      return rateLimitResponse(limit)
    }

    const body = await request.json()
    const {
      conversation_id,
      message_type,
      content_text,
      media_url,
      template_name,
      template_params,
      reply_to_message_id,
      file_name,
    } = body

    if (!conversation_id || !message_type) {
      return NextResponse.json(
        { error: 'conversation_id and message_type are required' },
        { status: 400 }
      )
    }

    if (message_type === 'text' && !content_text) {
      return NextResponse.json(
        { error: 'content_text is required for text messages' },
        { status: 400 }
      )
    }

    if (message_type === 'template' && !template_name) {
      return NextResponse.json(
        { error: 'template_name is required for template messages' },
        { status: 400 }
      )
    }

    if ((message_type === 'audio' || message_type === 'image' || message_type === 'document') && !body.media_data) {
      return NextResponse.json(
        { error: 'media_data is required for image/document/audio messages' },
        { status: 400 }
      )
    }

    if (message_type === 'document' && !body.file_name) {
      return NextResponse.json(
        { error: 'file_name is required for document messages' },
        { status: 400 }
      )
    }

    // Fetch conversation and contact (contact is optional — groups have no contact)
    const { data: conversation, error: convError } = await supabase
      .from('conversations')
      .select('*, contact:contacts(*)')
      .eq('id', conversation_id)
      .eq('user_id', user.id)
      .single()

    if (convError || !conversation) {
      return NextResponse.json(
        { error: 'Conversation not found' },
        { status: 404 }
      )
    }

    const isGroup = !!conversation.group_id
    const contact = conversation.contact

    if (!isGroup && !contact?.phone) {
      return NextResponse.json(
        { error: 'Contact phone number not found' },
        { status: 400 }
      )
    }

    // For groups the "to" is the group_id; for 1:1 it's the contact's phone
    const recipientId = isGroup ? conversation.group_id : ''
    const recipientType = isGroup ? 'group' as const : 'individual' as const

    // Sanitize and validate phone for 1:1 messages only
    const sanitizedPhone = !isGroup && contact?.phone
      ? sanitizePhoneForMeta(contact.phone)
      : ''

    if (!isGroup && !isValidE164(sanitizedPhone)) {
      return NextResponse.json(
        { error: 'Invalid phone number format' },
        { status: 400 }
      )
    }

    // Fetch and decrypt WhatsApp config
    const { data: config, error: configError } = await supabase
      .from('whatsapp_config')
      .select('*')
      .eq('user_id', user.id)
      .single()

    if (configError || !config) {
      return NextResponse.json(
        { error: 'WhatsApp not configured. Please set up your WhatsApp integration first.' },
        { status: 400 }
      )
    }

    const accessToken = decrypt(config.access_token)

    // Self-heal legacy CBC-encrypted tokens. Fire-and-forget: we
    // return from the send without waiting, so a failed upgrade just
    // means the next send tries again. The upgrade is idempotent —
    // concurrent sends both produce valid GCM ciphertexts of the same
    // plaintext, last write wins.
    if (isLegacyFormat(config.access_token)) {
      void supabase
        .from('whatsapp_config')
        .update({ access_token: encrypt(accessToken) })
        .eq('id', config.id)
        .then(({ error }) => {
          if (error) {
            console.warn(
              '[whatsapp/send] access_token GCM upgrade failed:',
              error.message,
            )
          }
        })
    }

    // Resolve the reply target (if any) to its Meta message_id, which is
    // what `context.message_id` on the outgoing Meta payload needs. The
    // parent must belong to this same conversation — otherwise a caller
    // could quote messages they can't see by guessing UUIDs.
    let contextMessageId: string | undefined
    if (reply_to_message_id) {
      const { data: parent, error: parentError } = await supabase
        .from('messages')
        .select('message_id, conversation_id')
        .eq('id', reply_to_message_id)
        .eq('conversation_id', conversation_id)
        .maybeSingle()

      if (parentError || !parent) {
        return NextResponse.json(
          { error: 'reply_to_message_id not found in this conversation' },
          { status: 400 }
        )
      }
      if (!parent.message_id) {
        // Parent never reached Meta (still in 'sending' or 'failed') — we
        // can't quote it on WhatsApp. Send without context rather than
        // dropping the message entirely.
        console.warn(
          '[whatsapp/send] reply target has no Meta message_id; sending without context'
        )
      } else {
        contextMessageId = parent.message_id
      }
    }

    // For groups the send target is the group_id; for 1:1 it's the phone number.
    // Groups skip the phone-variant retry and auto-correct logic.
    let waMessageId = ''
    let workingPhone = isGroup ? '' : sanitizedPhone

    // Upload media to Meta first for image/document/audio
    let uploadedMediaId: string | undefined

    if (message_type === 'image' || message_type === 'document' || message_type === 'audio') {
      const base64Data = body.media_data as string
      const mediaPattern = message_type === 'audio' ? 'audio' : message_type === 'image' ? 'image' : '\\w+'
      const regex = new RegExp(`^data:(${mediaPattern}\\/\\w+);base64,(.+)$`)
      const matches = base64Data.match(regex)
      let mimeType = 'audio/ogg'
      let rawBase64 = base64Data

      if (matches) {
        mimeType = matches[1]
        rawBase64 = matches[2]
      } else if (base64Data.includes(';base64,')) {
        const parts = base64Data.split(';base64,')
        mimeType = parts[0].replace('data:', '')
        rawBase64 = parts[1]
      }

      const fileBuffer = Buffer.from(rawBase64, 'base64')
      const uploadResult = await uploadMedia({
        phoneNumberId: config.phone_number_id,
        accessToken,
        fileBuffer,
        mimeType,
        fileName: file_name || `file.${mimeType.split('/')[1] || 'bin'}`,
      })
      uploadedMediaId = uploadResult.id
    }

    const attempt = async (to: string): Promise<string> => {
      if (message_type === 'image' && uploadedMediaId) {
        const result = await sendImageMessage({
          phoneNumberId: config.phone_number_id,
          accessToken,
          to,
          recipientType,
          mediaId: uploadedMediaId,
          caption: content_text || undefined,
          contextMessageId,
        })
        return result.messageId
      }
      if (message_type === 'document' && uploadedMediaId) {
        const result = await sendDocumentMessage({
          phoneNumberId: config.phone_number_id,
          accessToken,
          to,
          recipientType,
          mediaId: uploadedMediaId,
          caption: content_text || undefined,
          filename: file_name,
          contextMessageId,
        })
        return result.messageId
      }
      if (message_type === 'audio' && uploadedMediaId) {
        const result = await sendAudioMessage({
          phoneNumberId: config.phone_number_id,
          accessToken,
          to,
          recipientType,
          mediaId: uploadedMediaId,
          contextMessageId,
        })
        return result.messageId
      }
      if (message_type === 'template') {
        const result = await sendTemplateMessage({
          phoneNumberId: config.phone_number_id,
          accessToken,
          to,
          recipientType,
          templateName: template_name,
          params: template_params || [],
          contextMessageId,
        })
        return result.messageId
      }
      const result = await sendTextMessage({
        phoneNumberId: config.phone_number_id,
        accessToken,
        to,
        recipientType,
        text: content_text,
        contextMessageId,
      })
      return result.messageId
    }

    try {
      if (isGroup) {
        waMessageId = await attempt(recipientId)
      } else {
        const variants = phoneVariants(sanitizedPhone)
        let lastError: unknown = null

        for (const variant of variants) {
          try {
            waMessageId = await attempt(variant)
            workingPhone = variant
            lastError = null
            break
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err)
            // Only retry when the failure is specifically that the
            // recipient isn't in Meta's allowed list. Any other error
            // (bad token, invalid template, etc.) bubbles up immediately.
            if (!isRecipientNotAllowedError(message)) {
              throw err
            }
            lastError = err
            console.warn(`[whatsapp/send] variant "${variant}" rejected by Meta, trying next…`)
          }
        }

        if (lastError) throw lastError
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown Meta API error'
      console.error('Meta API send failed for all variants:', message)
      return NextResponse.json(
        { error: `Meta API error: ${message}` },
        { status: 502 }
      )
    }

    // If a non-original variant succeeded, update the contact so future
    // sends go straight through. sanitizePhoneForMeta on workingPhone
    // will yield workingPhone itself, so re-storing preserves it.
    // Only applies to 1:1 conversations.
    if (!isGroup && workingPhone !== sanitizedPhone) {
      console.log(
        `[whatsapp/send] Auto-corrected contact phone: ${sanitizedPhone} → ${workingPhone}`
      )
      await supabase
        .from('contacts')
        .update({ phone: workingPhone })
        .eq('id', contact.id)
    }

    // Build the media_url for stored messages
    let storedMediaUrl = media_url || null
    if (uploadedMediaId && (message_type === 'image' || message_type === 'document' || message_type === 'audio')) {
      storedMediaUrl = `/api/whatsapp/media/${uploadedMediaId}`
    }

    // Insert message into DB — field names MUST match the messages schema
    // (see supabase/migrations/001_initial_schema.sql):
    //   conversation_id, sender_type, content_type, content_text,
    //   media_url, template_name, message_id, status, created_at
    const { data: messageRecord, error: msgError } = await supabase
      .from('messages')
      .insert({
        conversation_id,
        sender_type: 'agent',
        content_type: message_type,
        content_text: content_text || null,
        media_url: storedMediaUrl,
        template_name: template_name || null,
        message_id: waMessageId,
        status: 'sent',
        reply_to_message_id: reply_to_message_id || null,
      })
      .select()
      .single()

    if (msgError) {
      console.error('Error inserting sent message:', msgError)
      return NextResponse.json(
        { error: `Message sent to Meta but failed to save to DB: ${msgError.message}` },
        { status: 500 }
      )
    }

    // Update conversation
    const typeLabels: Record<string, string> = {
      audio: '[Voice message]',
      image: '[Image]',
      document: '[Document]',
    }
    const lastText = typeLabels[message_type] || content_text || `[${message_type}]`
    await supabase
      .from('conversations')
      .update({
        last_message_text: lastText,
        last_message_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', conversation_id)

    return NextResponse.json({
      success: true,
      message_id: messageRecord.id,
      whatsapp_message_id: waMessageId,
    })
  } catch (error) {
    console.error('Error in WhatsApp send POST:', error)
    return NextResponse.json(
      { error: 'Failed to send message' },
      { status: 500 }
    )
  }
}
