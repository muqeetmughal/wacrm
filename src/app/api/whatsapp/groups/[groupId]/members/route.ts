import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { removeGroupMember } from '@/lib/whatsapp/meta-api'
import { decrypt } from '@/lib/whatsapp/encryption'

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ groupId: string }> },
) {
  try {
    const { groupId } = await params

    if (!groupId) {
      return NextResponse.json(
        { error: 'Group ID is required' },
        { status: 400 },
      )
    }

    const body = await request.json()
    const { phone } = body

    if (!phone || typeof phone !== 'string') {
      return NextResponse.json(
        { error: 'phone is required (E.164 format)' },
        { status: 400 },
      )
    }

    const supabase = await createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: config, error: configError } = await supabase
      .from('whatsapp_config')
      .select('*')
      .eq('user_id', user.id)
      .single()

    if (configError || !config) {
      return NextResponse.json(
        {
          error:
            'WhatsApp not configured. Connect your WhatsApp Business account in Settings first.',
        },
        { status: 400 },
      )
    }

    if (!config.phone_number_id) {
      return NextResponse.json(
        {
          error:
            'Phone number ID missing. Re-connect your account in Settings.',
        },
        { status: 400 },
      )
    }

    const accessToken = decrypt(config.access_token)

    // Verify the group belongs to this user
    const { data: group, error: groupError } = await supabase
      .from('waba_groups')
      .select('id')
      .eq('waba_group_id', groupId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (groupError) {
      return NextResponse.json(
        { error: `Failed to lookup group: ${groupError.message}` },
        { status: 500 },
      )
    }

    if (!group) {
      return NextResponse.json(
        { error: 'Group not found' },
        { status: 404 },
      )
    }

    // Remove from Meta first
    await removeGroupMember({
      phoneNumberId: config.phone_number_id,
      accessToken,
      groupId,
      phone,
    })

    // Remove from local DB
    const { error: deleteError } = await supabase
      .from('group_members')
      .delete()
      .eq('waba_group_id', groupId)
      .eq('user_id', user.id)
      .eq('phone', phone)

    if (deleteError) {
      console.error('Error deleting group member from DB:', deleteError)
      return NextResponse.json(
        {
          error: `Removed from WhatsApp group but failed to update local DB: ${deleteError.message}`,
        },
        { status: 500 },
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in group member DELETE:', error)
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to remove group member',
      },
      { status: 500 },
    )
  }
}
