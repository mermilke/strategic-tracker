// Integration tests for row-level security. These exercise the real Postgres
// policies against a local Supabase stack: they create users in different roles,
// sign in as each, and assert what each can and cannot read or write. This is
// coverage that unit tests cannot provide, since RLS is enforced in the database.
//
// Run with: npm run test:integration (requires `npx supabase start` first).

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { adminClient, resetDb, createUser, signInAs } from './helpers'

const WEEK = '2026-06-01'

let admin
let manager, dr1, dr2
let obj1, sub1, obj2, sub2
let managerClient, drClient1, drClient2

beforeAll(async () => {
  admin = adminClient()
  await resetDb(admin)

  manager = await createUser(admin, 'manager', 'Manager One')
  dr1 = await createUser(admin, 'direct_report', 'Report One')
  dr2 = await createUser(admin, 'direct_report', 'Report Two')

  // Fixtures are built with the service role, which bypasses RLS. dr1 owns one
  // objective/sub/check-in; dr2 owns another, so we can prove cross-report isolation.
  ;({ data: obj1 } = await admin.from('strategic_objectives')
    .insert({ owner_id: dr1.id, title: 'Report One objective' }).select().single())
  ;({ data: sub1 } = await admin.from('sub_objectives')
    .insert({ objective_id: obj1.id, title: 'Report One sub' }).select().single())
  ;({ data: obj2 } = await admin.from('strategic_objectives')
    .insert({ owner_id: dr2.id, title: 'Report Two objective' }).select().single())
  ;({ data: sub2 } = await admin.from('sub_objectives')
    .insert({ objective_id: obj2.id, title: 'Report Two sub' }).select().single())

  await admin.from('weekly_checkins')
    .insert({ sub_objective_id: sub1.id, submitted_by: dr1.id, week_start: WEEK, status: 'on_track' })
  await admin.from('weekly_checkins')
    .insert({ sub_objective_id: sub2.id, submitted_by: dr2.id, week_start: WEEK, status: 'on_track' })

  managerClient = await signInAs(manager.email)
  drClient1 = await signInAs(dr1.email)
  drClient2 = await signInAs(dr2.email)
}, 60000)

afterAll(async () => {
  if (admin) await resetDb(admin)
})

describe('strategic_objectives RLS', () => {
  it('a manager sees every objective', async () => {
    const { data, error } = await managerClient.from('strategic_objectives').select('id')
    expect(error).toBeNull()
    expect(data.map((o) => o.id).sort()).toEqual([obj1.id, obj2.id].sort())
  })

  it('a direct report sees only objectives they own', async () => {
    const { data, error } = await drClient1.from('strategic_objectives').select('id')
    expect(error).toBeNull()
    expect(data.map((o) => o.id)).toEqual([obj1.id])
  })
})

describe('sub_objectives RLS', () => {
  it('a direct report sees only sub-objectives under their own objectives', async () => {
    const { data, error } = await drClient1.from('sub_objectives').select('id')
    expect(error).toBeNull()
    expect(data.map((s) => s.id)).toEqual([sub1.id])
  })
})

describe('weekly_checkins RLS', () => {
  it('a manager sees every check-in', async () => {
    const { data, error } = await managerClient.from('weekly_checkins').select('id')
    expect(error).toBeNull()
    expect(data).toHaveLength(2)
  })

  it('a direct report sees only their own check-ins', async () => {
    const { data, error } = await drClient1.from('weekly_checkins').select('id, submitted_by')
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
    expect(data.every((c) => c.submitted_by === dr1.id)).toBe(true)
  })

  it('a report cannot submit a check-in attributed to another user', async () => {
    const { error } = await drClient1.from('weekly_checkins').insert({
      sub_objective_id: sub1.id, submitted_by: dr2.id, week_start: '2026-06-08', status: 'on_track',
    })
    expect(error).not.toBeNull()
  })

  it('a report cannot submit a check-in on a sub-objective they do not own', async () => {
    const { error } = await drClient1.from('weekly_checkins').insert({
      sub_objective_id: sub2.id, submitted_by: dr1.id, week_start: '2026-06-08', status: 'on_track',
    })
    expect(error).not.toBeNull()
  })

  it('a report can submit a check-in on their own sub-objective', async () => {
    const { error } = await drClient1.from('weekly_checkins').insert({
      sub_objective_id: sub1.id, submitted_by: dr1.id, week_start: '2026-06-15', status: 'on_track',
    })
    expect(error).toBeNull()
  })
})

describe('users RLS', () => {
  it('any authenticated user can read the user directory (the manager dashboard needs it)', async () => {
    const { data, error } = await drClient1.from('users').select('id')
    expect(error).toBeNull()
    expect(data).toHaveLength(3)
  })
})
