/**
 * Meta WhatsApp Cloud API helpers.
 *
 * Every function takes a single options object (named parameters) instead
 * of positional arguments. This was a deliberate choice after the same
 * swapped-args bug was found four times in a row with the positional form
 * (e.g. `(accessToken, phoneNumberId)` vs `(phoneNumberId, accessToken)`).
 * With named params, a typo surfaces immediately as a TypeScript error
 * instead of a runtime rejection from Meta.
 */

const META_API_VERSION = 'v21.0'
const META_API_BASE = `https://graph.facebook.com/${META_API_VERSION}`
// Groups API requires v23.0+
const META_GROUPS_API_BASE = `https://graph.facebook.com/v23.0`

export interface MetaSendResult {
  messageId: string
}

export interface MetaPhoneInfo {
  id: string
  display_phone_number: string
  verified_name?: string
  quality_rating?: string
}

interface MetaErrorResponse {
  error?: { message?: string; code?: number; type?: string }
}

async function throwMetaError(response: Response, fallback: string): Promise<never> {
  let message = fallback
  try {
    const data = (await response.json()) as MetaErrorResponse
    if (data.error?.message) message = data.error.message
  } catch {
    // response body wasn't JSON — keep the fallback
  }
  throw new Error(message)
}

// ============================================================
// Phone number / account
// ============================================================

export interface VerifyPhoneNumberArgs {
  phoneNumberId: string
  accessToken: string
}

/**
 * Verify a Meta phone number ID by fetching its public metadata
 * (display_phone_number, verified_name, quality_rating).
 */
export async function verifyPhoneNumber(
  args: VerifyPhoneNumberArgs
): Promise<MetaPhoneInfo> {
  const { phoneNumberId, accessToken } = args
  const url = `${META_API_BASE}/${phoneNumberId}?fields=id,display_phone_number,verified_name,quality_rating`
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!response.ok) {
    await throwMetaError(response, `Meta API error: ${response.status}`)
  }
  return response.json()
}

// ============================================================
// Sending
// ============================================================

export interface SendTextMessageArgs {
  phoneNumberId: string
  accessToken: string
  to: string
  text: string
  /** 'individual' (default) or 'group' */
  recipientType?: 'individual' | 'group'
  /** Meta's message_id of the message being replied to. Adds a `context` field
   *  so WhatsApp renders the new message as a reply with a quote preview. */
  contextMessageId?: string
}

/**
 * Send a free-form WhatsApp text message.
 * Only works inside the 24-hour customer service window.
 */
export async function sendTextMessage(
  args: SendTextMessageArgs
): Promise<MetaSendResult> {
  const { phoneNumberId, accessToken, to, text, recipientType, contextMessageId } = args
  const url = `${META_API_BASE}/${phoneNumberId}/messages`
  const body: Record<string, unknown> = {
    messaging_product: 'whatsapp',
    recipient_type: recipientType ?? 'individual',
    to,
    type: 'text',
    text: { body: text },
  }
  if (contextMessageId) {
    body.context = { message_id: contextMessageId }
  }
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    await throwMetaError(response, `Meta API error: ${response.status}`)
  }
  const data = await response.json()
  return { messageId: data.messages[0].id }
}

export interface SendTemplateMessageArgs {
  phoneNumberId: string
  accessToken: string
  to: string
  templateName: string
  language?: string
  params?: string[]
  /** 'individual' (default) or 'group' */
  recipientType?: 'individual' | 'group'
  /** Meta's message_id of the message being replied to. */
  contextMessageId?: string
}

/**
 * Send a pre-approved WhatsApp message template. Required outside
 * the 24-hour window and for any first-touch messaging.
 */
export async function sendTemplateMessage(
  args: SendTemplateMessageArgs
): Promise<MetaSendResult> {
  const {
    phoneNumberId,
    accessToken,
    to,
    templateName,
    language = 'en_US',
    params,
    recipientType,
    contextMessageId,
  } = args
  const url = `${META_API_BASE}/${phoneNumberId}/messages`

  const template: Record<string, unknown> = {
    name: templateName,
    language: { code: language },
  }

  if (params && params.length > 0) {
    template.components = [
      {
        type: 'body',
        parameters: params.map((p) => ({ type: 'text', text: String(p) })),
      },
    ]
  }

  const body: Record<string, unknown> = {
    messaging_product: 'whatsapp',
    recipient_type: recipientType ?? 'individual',
    to,
    type: 'template',
    template,
  }
  if (contextMessageId) {
    body.context = { message_id: contextMessageId }
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    await throwMetaError(response, `Meta API error: ${response.status}`)
  }
  const data = await response.json()
  return { messageId: data.messages[0].id }
}

// ============================================================
// Reactions
// ============================================================

export interface SendReactionMessageArgs {
  phoneNumberId: string
  accessToken: string
  to: string
  /** 'individual' (default) or 'group' */
  recipientType?: 'individual' | 'group'
  /** Meta's message_id of the message being reacted to. */
  targetMessageId: string
  /** Single emoji, or empty string to remove an existing reaction. */
  emoji: string
}

/**
 * Send a reaction (or removal) to a previously-exchanged message.
 * Empty `emoji` removes the reaction per Meta's spec.
 */
export async function sendReactionMessage(
  args: SendReactionMessageArgs
): Promise<MetaSendResult> {
  const { phoneNumberId, accessToken, to, recipientType, targetMessageId, emoji } = args
  const url = `${META_API_BASE}/${phoneNumberId}/messages`
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: recipientType ?? 'individual',
      to,
      type: 'reaction',
      reaction: { message_id: targetMessageId, emoji },
    }),
  })
  if (!response.ok) {
    await throwMetaError(response, `Meta API error: ${response.status}`)
  }
  const data = await response.json()
  return { messageId: data.messages[0].id }
}

// ============================================================
// Media
// ============================================================

export interface GetMediaUrlArgs {
  mediaId: string
  accessToken: string
}

/**
 * Resolve a media ID to Meta's (short-lived, authenticated) CDN URL
 * plus the MIME type. Step one of the media-proxy flow.
 */
export async function getMediaUrl(
  args: GetMediaUrlArgs
): Promise<{ url: string; mimeType: string }> {
  const { mediaId, accessToken } = args
  const response = await fetch(`${META_API_BASE}/${mediaId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!response.ok) {
    await throwMetaError(response, `Media fetch failed: ${response.status}`)
  }
  const data = await response.json()
  if (!data.url) throw new Error('Media URL not found in Meta response')
  return { url: data.url, mimeType: data.mime_type || 'application/octet-stream' }
}

export interface UploadMediaArgs {
  phoneNumberId: string
  accessToken: string
  fileBuffer: Buffer
  mimeType: string
  fileName?: string
}

/**
 * Upload a media file (audio/image/video/document) to Meta's servers.
 * Returns the media ID that can be used in sendAudioMessage (and future
 * sendImageMessage / sendDocumentMessage) calls.
 *
 * Meta docs: https://developers.facebook.com/docs/whatsapp/cloud-api/reference/media#
 */
export async function uploadMedia(
  args: UploadMediaArgs
): Promise<{ id: string }> {
  const { phoneNumberId, accessToken, fileBuffer, mimeType, fileName } = args
  const url = `${META_API_BASE}/${phoneNumberId}/media`

  const form = new FormData()
  form.append('messaging_product', 'whatsapp')
  form.append('file', new Blob([new Uint8Array(fileBuffer)], { type: mimeType }), fileName || `audio.${mimeType.split('/')[1] || 'ogg'}`)
  form.append('type', mimeType)

  const response = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body: form,
  })
  if (!response.ok) {
    await throwMetaError(response, `Media upload failed: ${response.status}`)
  }
  const data = await response.json()
  if (!data.id) throw new Error('Media upload returned no ID')
  return { id: data.id }
}

// ============================================================
// Audio messages
// ============================================================

export interface SendAudioMessageArgs {
  phoneNumberId: string
  accessToken: string
  to: string
  /** The media ID returned by uploadMedia (or a previously-uploaded one). */
  mediaId: string
  /** 'individual' (default) or 'group' */
  recipientType?: 'individual' | 'group'
  contextMessageId?: string
}

/**
 * Send an audio/voice message via WhatsApp Cloud API.
 * The audio must already be uploaded to Meta via uploadMedia.
 */
export async function sendAudioMessage(
  args: SendAudioMessageArgs
): Promise<MetaSendResult> {
  const { phoneNumberId, accessToken, to, mediaId, recipientType, contextMessageId } = args
  const url = `${META_API_BASE}/${phoneNumberId}/messages`
  const body: Record<string, unknown> = {
    messaging_product: 'whatsapp',
    recipient_type: recipientType ?? 'individual',
    to,
    type: 'audio',
    audio: { id: mediaId },
  }
  if (contextMessageId) {
    body.context = { message_id: contextMessageId }
  }
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    await throwMetaError(response, `Meta API error: ${response.status}`)
  }
  const data = await response.json()
  return { messageId: data.messages[0].id }
}

// ============================================================
// Image messages
// ============================================================

export interface SendImageMessageArgs {
  phoneNumberId: string
  accessToken: string
  to: string
  mediaId: string
  caption?: string
  /** 'individual' (default) or 'group' */
  recipientType?: 'individual' | 'group'
  contextMessageId?: string
}

export async function sendImageMessage(
  args: SendImageMessageArgs
): Promise<MetaSendResult> {
  const { phoneNumberId, accessToken, to, mediaId, caption, recipientType, contextMessageId } = args
  const url = `${META_API_BASE}/${phoneNumberId}/messages`
  const body: Record<string, unknown> = {
    messaging_product: 'whatsapp',
    recipient_type: recipientType ?? 'individual',
    to,
    type: 'image',
    image: { id: mediaId, caption },
  }
  if (!caption) delete (body.image as Record<string, unknown>).caption
  if (contextMessageId) {
    body.context = { message_id: contextMessageId }
  }
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    await throwMetaError(response, `Meta API error: ${response.status}`)
  }
  const data = await response.json()
  return { messageId: data.messages[0].id }
}

// ============================================================
// Document messages
// ============================================================

export interface SendDocumentMessageArgs {
  phoneNumberId: string
  accessToken: string
  to: string
  mediaId: string
  caption?: string
  filename?: string
  /** 'individual' (default) or 'group' */
  recipientType?: 'individual' | 'group'
  contextMessageId?: string
}

export async function sendDocumentMessage(
  args: SendDocumentMessageArgs
): Promise<MetaSendResult> {
  const { phoneNumberId, accessToken, to, mediaId, caption, filename, recipientType, contextMessageId } = args
  const url = `${META_API_BASE}/${phoneNumberId}/messages`
  const body: Record<string, unknown> = {
    messaging_product: 'whatsapp',
    recipient_type: recipientType ?? 'individual',
    to,
    type: 'document',
    document: { id: mediaId, caption, filename },
  }
  if (!caption) delete (body.document as Record<string, unknown>).caption
  if (!filename) delete (body.document as Record<string, unknown>).filename
  if (contextMessageId) {
    body.context = { message_id: contextMessageId }
  }
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    await throwMetaError(response, `Meta API error: ${response.status}`)
  }
  const data = await response.json()
  return { messageId: data.messages[0].id }
}

export interface DownloadMediaArgs {
  downloadUrl: string
  accessToken: string
}

/**
 * Fetch the binary bytes for a media URL obtained from getMediaUrl.
 * Step two of the media-proxy flow.
 */
export async function downloadMedia(
  args: DownloadMediaArgs
): Promise<{ buffer: Buffer; contentType: string }> {
  const { downloadUrl, accessToken } = args
  const response = await fetch(downloadUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!response.ok) {
    throw new Error(`Media download failed: ${response.status}`)
  }
  const contentType =
    response.headers.get('content-type') || 'application/octet-stream'
  const buffer = Buffer.from(await response.arrayBuffer())
  return { buffer, contentType }
}

// ============================================================
// Group management
// ============================================================

export interface CreateGroupArgs {
  phoneNumberId: string
  accessToken: string
  subject: string
  description?: string
}

export interface CreateGroupResult {
  groupId: string
  inviteLink: string
}

/**
 * Create a WhatsApp group via the Cloud API.
 * Returns the group_id and invite_link.
 */
export async function createGroup(
  args: CreateGroupArgs
): Promise<CreateGroupResult> {
  const { phoneNumberId, accessToken, subject, description } = args
  const url = `${META_GROUPS_API_BASE}/${phoneNumberId}/groups`
  const body: Record<string, unknown> = {
    messaging_product: 'whatsapp',
    subject,
  }
  if (description) body.description = description

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    await throwMetaError(response, `Group creation failed: ${response.status}`)
  }
  const data = await response.json()
  return { groupId: data.id, inviteLink: data.invite_link }
}

export interface GetGroupsArgs {
  phoneNumberId: string
  accessToken: string
}

export type GroupInfo = {
  id: string
  subject: string
  description?: string
  invite_link?: string
  participant_count?: number
  created_at?: string
}

/**
 * List all WhatsApp groups for a phone number.
 */
export async function getGroups(args: GetGroupsArgs): Promise<GroupInfo[]> {
  const { phoneNumberId, accessToken } = args
  const url = `${META_GROUPS_API_BASE}/${phoneNumberId}/groups?fields=id,subject,description,invite_link,participant_count,created_at`
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!response.ok) {
    await throwMetaError(response, `Fetch groups failed: ${response.status}`)
  }
  const data = await response.json()
  return data.data ?? []
}

export interface RemoveGroupMemberArgs {
  phoneNumberId: string
  accessToken: string
  groupId: string
  /** The phone number in E.164 format (e.g. 15551234567). */
  phone: string
}

/**
 * Remove a member from a WhatsApp group.
 * Only the group creator can remove members.
 */
export async function removeGroupMember(
  args: RemoveGroupMemberArgs
): Promise<void> {
  const { phoneNumberId, accessToken, groupId, phone } = args
  const url = `${META_GROUPS_API_BASE}/${phoneNumberId}/groups/${groupId}/members`
  const response = await fetch(url, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      phone_number: phone,
    }),
  })
  if (!response.ok) {
    await throwMetaError(response, `Remove member failed: ${response.status}`)
  }
}

export interface DeleteGroupArgs {
  phoneNumberId: string
  accessToken: string
  groupId: string
}

/**
 * Delete a WhatsApp group. Only the group creator can delete.
 */
export async function deleteGroup(args: DeleteGroupArgs): Promise<void> {
  const { phoneNumberId, accessToken, groupId } = args
  const url = `${META_GROUPS_API_BASE}/${phoneNumberId}/groups/${groupId}`
  const response = await fetch(url, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!response.ok) {
    await throwMetaError(response, `Delete group failed: ${response.status}`)
  }
}
