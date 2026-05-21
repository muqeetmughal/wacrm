import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { deleteGroup } from '@/lib/whatsapp/meta-api'
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

    // Delete from Meta first
    await deleteGroup({
      phoneNumberId: config.phone_number_id,
      accessToken,
      groupId,
    })

    // Delete members from local DB (no FK cascade from waba_groups)
    const { error: membersDeleteError } = await supabase
      .from('group_members')
      .delete()
      .eq('waba_group_id', groupId)
      .eq('user_id', user.id)

    if (membersDeleteError) {
      console.error('Error deleting group members from DB:', membersDeleteError)
    }

    // Delete group from local DB
    const { error: deleteError } = await supabase
      .from('waba_groups')
      .delete()
      .eq('waba_group_id', groupId)
      .eq('user_id', user.id)

    if (deleteError) {
      return NextResponse.json(
        {
          error: `Deleted from WhatsApp but failed to remove from local DB: ${deleteError.message}`,
        },
        { status: 500 },
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in group DELETE:', error)
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Failed to delete group',
      },
      { status: 500 },
    )
  }
}
