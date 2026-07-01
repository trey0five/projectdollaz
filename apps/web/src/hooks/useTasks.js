// ─────────────────────────────────────────────────────────────────────────────
// useTasks — Phase 3 Workflow v1 (the generic TASK engine). School-scoped (NOT
// period-scoped). Same await-BEFORE-setState pattern as usePolicies (microtask
// defer + cancelled flag) so it is react-hooks/set-state-in-effect safe.
//
// Workflow is CORE (never a licensed module), so — unlike usePolicies — there is
// NO notLicensed state (there is no MODULE_NOT_LICENSED 402 for tasks). Only
// notEntitled (the base SUBSCRIPTION_REQUIRED paused state) applies. `filters`
// (status/assignee) re-loads the list on change; members are fetched for the
// assignee picker (owner/accountant only — viewers read assignee names off each
// task and don't need the picker).
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect, useCallback } from 'react'
import { tasksApi, schoolsApi, isPaymentRequired } from '../lib/api.js'

export function useTasks(schoolId, filters = {}, canEdit = false) {
  const [tasks, setTasks] = useState([])
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notEntitled, setNotEntitled] = useState(false)

  const { status, assigneeUserId } = filters

  const load = useCallback(
    async (sid) => {
      setError('')
      setNotEntitled(false)
      try {
        const params = {}
        if (status) params.status = status
        if (assigneeUserId) params.assigneeUserId = assigneeUserId
        const res = await tasksApi.list(sid, params)
        setTasks(res.data?.tasks ?? [])
      } catch (e) {
        if (isPaymentRequired(e)) {
          setNotEntitled(true)
          setTasks([])
        } else {
          setError('Could not load your tasks.')
          setTasks([])
        }
      } finally {
        setLoading(false)
      }
    },
    [status, assigneeUserId],
  )

  useEffect(() => {
    let cancelled = false
    Promise.resolve().then(() => {
      if (cancelled) return
      if (schoolId) {
        setLoading(true)
        load(schoolId)
      } else {
        setTasks([])
        setLoading(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [schoolId, load])

  // Assignee options — only editors can fetch the members roster (the endpoint is
  // owner/accountant-only). Fetched once per school; failures degrade silently to
  // an empty picker (a viewer never calls this).
  useEffect(() => {
    let cancelled = false
    Promise.resolve().then(async () => {
      if (cancelled || !schoolId || !canEdit) {
        if (!canEdit) setMembers([])
        return
      }
      try {
        const res = await schoolsApi.members(schoolId)
        if (!cancelled) setMembers((res.data ?? []).filter((m) => m.status === 'active'))
      } catch {
        if (!cancelled) setMembers([])
      }
    })
    return () => {
      cancelled = true
    }
  }, [schoolId, canEdit])

  const refresh = useCallback(
    () => (schoolId ? load(schoolId) : Promise.resolve()),
    [schoolId, load],
  )

  // Penny confirm-then-create: a create_task apply broadcasts 'penny:data-changed'
  // with key 'tasks'; re-pull the list so a task Penny just created shows up here
  // without a manual reload (mirrors AnalyticsDashboard / CAP section listeners).
  useEffect(() => {
    const onDataChanged = (e) => {
      if (e?.detail?.key === 'tasks') refresh()
    }
    window.addEventListener('penny:data-changed', onDataChanged)
    return () => window.removeEventListener('penny:data-changed', onDataChanged)
  }, [refresh])

  const create = useCallback(
    async (body) => {
      if (!schoolId) return
      await tasksApi.create(schoolId, body)
      await load(schoolId)
    },
    [schoolId, load],
  )

  const update = useCallback(
    async (taskId, body) => {
      if (!schoolId) return
      await tasksApi.update(schoolId, taskId, body)
      await load(schoolId)
    },
    [schoolId, load],
  )

  const complete = useCallback(
    async (taskId) => {
      if (!schoolId) return
      await tasksApi.complete(schoolId, taskId)
      await load(schoolId)
    },
    [schoolId, load],
  )

  const remove = useCallback(
    async (taskId) => {
      if (!schoolId) return
      await tasksApi.remove(schoolId, taskId)
      await load(schoolId)
    },
    [schoolId, load],
  )

  return { tasks, members, loading, error, notEntitled, refresh, create, update, complete, remove }
}
