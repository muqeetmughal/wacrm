import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createGroup, getGroups } from '@/lib/whatsapp/meta-api'
import { decrypt } from '@/lib/whatsapp/encryption'

export async function GET() {
  try {
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

    if (!config.waba_id || !config.phone_number_id) {
      return NextResponse.json(
        {
          error:
            'WABA ID or Phone Number ID missing. Re-connect your account in Settings.',
        },
        { status: 400 },
      )
    }

    const accessToken = decrypt(config.access_token)

    // Fetch local groups
    const { data: localGroups, error: localError } = await supabase
      .from('waba_groups')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (localError) {
      return NextResponse.json(
        { error: `Failed to fetch local groups: ${localError.message}` },
        { status: 500 },
      )
    }

    // Fetch groups from Meta
    let metaGroups: { id: string; subject: string; description?: string; invite_link?: string; created_at?: string }[] = []
    try {
      metaGroups = await getGroups({ phoneNumberId: config.phone_number_id, accessToken })
    } catch (err) {
      console.error('Failed to fetch groups from Meta:', err)
    }

    // Upsert any Meta groups not in local DB
    if (metaGroups.length > 0) {
      const localGroupIds = new Set(localGroups.map(g => g.waba_group_id))
      const toUpsert = metaGroups.filter(mg => !localGroupIds.has(mg.id))

      for (const mg of toUpsert) {
        await supabase.from('waba_groups').upsert(
          {
            user_id: user.id,
            waba_group_id: mg.id,
            subject: mg.subject,
            description: mg.description ?? null,
            invite_link: mg.invite_link ?? null,
          },
          {
            onConflict: 'user_id, waba_group_id',
            ignoreDuplicates: false,
          },
        )
      }
    }

    // Re-fetch merged list
    const { data: mergedGroups, error: mergedError } = await supabase
      .from('waba_groups')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (mergedError) {
      return NextResponse.json(
        { error: `Failed to fetch groups: ${mergedError.message}` },
        { status: 500 },
      )
    }

    // Attach member counts
    const wabaGroupIds = mergedGroups.map(g => g.waba_group_id)
    const { data: memberRows } = await supabase
      .from('group_members')
      .select('waba_group_id')
      .eq('user_id', user.id)
      .in('waba_group_id', wabaGroupIds)

    const memberCounts: Record<string, number> = {}
    if (memberRows) {
      for (const row of memberRows) {
        memberCounts[row.waba_group_id] = (memberCounts[row.waba_group_id] ?? 0) + 1
      }
    }

    const groupsWithCounts = mergedGroups.map(g => ({
      ...g,
      member_count: memberCounts[g.waba_group_id] ?? 0,
    }))

    return NextResponse.json({ groups: groupsWithCounts })
  } catch (error) {
    console.error('Error in WhatsApp groups GET:', error)
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Failed to fetch groups',
      },
      { status: 500 },
    )
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { subject, description } = body

    if (!subject || typeof subject !== 'string') {
      return NextResponse.json(
        { error: 'subject is required' },
        { status: 400 },
      )
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

    // Create group via Meta API
    const result = await createGroup({
      phoneNumberId: config.phone_number_id,
      accessToken,
      subject,
      description,
    })

    // Save to local DB
    const { data: group, error: insertError } = await supabase
      .from('waba_groups')
      .insert({
        user_id: user.id,
        waba_group_id: result.groupId,
        subject,
        description: description ?? null,
        invite_link: result.inviteLink,
      })
      .select()
      .single()

    if (insertError) {
      console.error('Error saving group to DB:', insertError)
      return NextResponse.json(
        {
          error: `Group created on WhatsApp but failed to save to DB: ${insertError.message}`,
        },
        { status: 500 },
      )
    }

    return NextResponse.json({ group })
  } catch (error) {
    console.error('Error in WhatsApp groups POST:', error)
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Failed to create group',
      },
      { status: 500 },
    )
  }
}
