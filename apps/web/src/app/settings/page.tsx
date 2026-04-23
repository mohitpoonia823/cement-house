'use client'
import { AppShell }   from '@/components/layout/AppShell'
import { Card }       from '@/components/ui/Card'
import { useAuthStore } from '@/store/auth'
import { api } from '@/lib/api'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useStaff, useCreateStaff, useUpdateStaff, useDeleteStaff } from '@/hooks/useStaff'
import { useState, useEffect } from 'react'

function useSettings() {
  return useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get('/api/settings').then(r => r.data.data),
  })
}

const PERMISSION_OPTIONS = [
  { id: 'orders', label: 'Orders' },
  { id: 'customers', label: 'Customers' },
  { id: 'ledger', label: 'Khata / Ledger' },
  { id: 'inventory', label: 'Inventory' },
  { id: 'delivery', label: 'Delivery' }
]

export default function SettingsPage() {
  const { user, login, token } = useAuthStore()
  const qc = useQueryClient()
  const { data, isLoading } = useSettings()

  // Business form
  const [bizEdit, setBizEdit]   = useState(false)
  const [bizName, setBizName]   = useState('')
  const [bizCity, setBizCity]   = useState('')
  const [bizAddr, setBizAddr]   = useState('')
  const [bizPhone, setBizPhone] = useState('')
  const [bizGstin, setBizGstin] = useState('')
  const [bizError, setBizError] = useState('')
  const [bizOk, setBizOk]       = useState(false)

  // Profile form
  const [profEdit, setProfEdit]   = useState(false)
  const [profName, setProfName]   = useState('')
  const [profPhone, setProfPhone] = useState('')
  const [profError, setProfError] = useState('')
  const [profOk, setProfOk]       = useState(false)

  // Password form
  const [showPw, setShowPw]     = useState(false)
  const [curPw, setCurPw]       = useState('')
  const [newPw, setNewPw]       = useState('')
  const [pwError, setPwError]   = useState('')
  const [pwOk, setPwOk]         = useState(false)

  // Reminders form
  const [remEdit, setRemEdit]   = useState(false)
  const [remEnabled, setRemEnabled] = useState(true)
  const [remSoft, setRemSoft]   = useState(7)
  const [remFollow, setRemFollow] = useState(15)
  const [remFirm, setRemFirm]   = useState(30)
  const [remError, setRemError] = useState('')
  const [remOk, setRemOk]       = useState(false)

  // Staff form
  const [staffFormOpen, setStaffFormOpen] = useState(false)
  const [staffEditId, setStaffEditId]     = useState<string|null>(null)
  const [staffName, setStaffName]         = useState('')
  const [staffPhone, setStaffPhone]       = useState('')
  const [staffPassword, setStaffPassword] = useState('')
  const [staffPerms, setStaffPerms]       = useState<Set<string>>(new Set())
  const [staffError, setStaffError]       = useState('')
  
  const { data: staffList, isLoading: sLoading } = useStaff()
  const createStaff = useCreateStaff()
  const updateStaff = useUpdateStaff()
  const deleteStaff = useDeleteStaff()

  useEffect(() => {
    if (data?.business) {
      setBizName(data.business.name ?? '')
      setBizCity(data.business.city ?? '')
      setBizAddr(data.business.address ?? '')
      setBizPhone(data.business.phone ?? '')
      setBizGstin(data.business.gstin ?? '')
      setRemEnabled(data.business.remindersEnabled ?? true)
      setRemSoft(data.business.reminderSoftDays ?? 7)
      setRemFollow(data.business.reminderFollowDays ?? 15)
      setRemFirm(data.business.reminderFirmDays ?? 30)
    }
    if (data?.user) {
      setProfName(data.user.name ?? '')
      setProfPhone(data.user.phone ?? '')
    }
  }, [data])

  const updateBiz = useMutation({
    mutationFn: (d: any) => api.patch('/api/settings/business', d).then(r => r.data.data),
    onSuccess: (biz) => {
      qc.invalidateQueries({ queryKey: ['settings'] })
      setBizEdit(false)
      setBizOk(true)
      setTimeout(() => setBizOk(false), 3000)
      // Update auth store so sidebar reflects new name
      if (token && user) {
        login(token, { ...user, businessName: biz.name, businessCity: biz.city })
      }
    },
    onError: (err: any) => setBizError(err.response?.data?.error ?? 'Failed'),
  })

  const updateProf = useMutation({
    mutationFn: (d: any) => api.patch('/api/settings/profile', d).then(r => r.data.data),
    onSuccess: (u) => {
      qc.invalidateQueries({ queryKey: ['settings'] })
      setProfEdit(false)
      setProfOk(true)
      setTimeout(() => setProfOk(false), 3000)
      if (token && user) {
        login(token, { ...user, name: u.name })
      }
    },
    onError: (err: any) => setProfError(err.response?.data?.error ?? 'Failed'),
  })

  const changePw = useMutation({
    mutationFn: (d: any) => api.post('/api/settings/change-password', d).then(r => r.data),
    onSuccess: () => {
      setShowPw(false)
      setCurPw(''); setNewPw('')
      setPwOk(true)
      setTimeout(() => setPwOk(false), 3000)
    },
    onError: (err: any) => setPwError(err.response?.data?.error ?? 'Failed'),
  })

  const updateRem = useMutation({
    mutationFn: (d: any) => api.patch('/api/settings/reminders', d).then(r => r.data.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings'] })
      setRemEdit(false)
      setRemOk(true)
      setTimeout(() => setRemOk(false), 3000)
    },
    onError: (err: any) => setRemError(err.response?.data?.error ?? 'Failed'),
  })

  const inputCls = "w-full text-sm px-3 py-2 border border-stone-200 dark:border-stone-700 rounded-lg bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
  const saveBtnCls = "text-xs px-4 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium"
  const cancelBtnCls = "text-xs px-3 py-1.5 border border-stone-200 dark:border-stone-700 rounded-lg hover:bg-stone-50 dark:hover:bg-stone-800 text-stone-600"
  const editBtnCls = "text-xs text-blue-600 hover:underline font-medium"
  const successCls = "text-xs text-green-600 bg-green-50 dark:bg-green-950 rounded-lg px-3 py-2"

  if (isLoading) return <AppShell><div className="text-xs text-stone-400">Loading…</div></AppShell>

  function handleStaffSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStaffError('')
    const data = { name: staffName, phone: staffPhone, permissions: Array.from(staffPerms) }
    if (staffEditId) {
      updateStaff.mutate({ id: staffEditId, ...data }, {
        onSuccess: () => { setStaffFormOpen(false); setStaffEditId(null) },
        onError: (err: any) => setStaffError(err.response?.data?.error ?? 'Failed')
      })
    } else {
      if (staffPassword.length < 6) return setStaffError('Password min 6 info')
      createStaff.mutate({ ...data, password: staffPassword }, {
        onSuccess: () => { setStaffFormOpen(false) },
        onError: (err: any) => setStaffError(err.response?.data?.error ?? 'Failed')
      })
    }
  }

  function handleStaffEdit(u: any) {
    setStaffEditId(u.id)
    setStaffName(u.name)
    setStaffPhone(u.phone)
    setStaffPassword('')
    setStaffPerms(new Set(u.permissions ?? []))
    setStaffFormOpen(true)
  }

  return (
    <AppShell>
      <div className="max-w-xl space-y-5">

        {/* Business Info */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <div className="text-xs font-medium text-stone-500 uppercase tracking-wide">Business info</div>
            {!bizEdit && user?.role === 'OWNER' && (
              <button onClick={() => { setBizEdit(true); setBizError('') }} className={editBtnCls}>Edit</button>
            )}
          </div>
          {bizOk && <div className={successCls + ' mb-3'}>✓ Business details updated</div>}
          {bizEdit ? (
            <form onSubmit={e => { e.preventDefault(); setBizError(''); updateBiz.mutate({ name: bizName, city: bizCity, address: bizAddr || undefined, phone: bizPhone || undefined, gstin: bizGstin || undefined }) }}
              className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-stone-500 mb-1">Business name *</label>
                  <input value={bizName} onChange={e => setBizName(e.target.value)} required className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs text-stone-500 mb-1">City *</label>
                  <input value={bizCity} onChange={e => setBizCity(e.target.value)} required className={inputCls} />
                </div>
              </div>
              <div>
                <label className="block text-xs text-stone-500 mb-1">Address</label>
                <input value={bizAddr} onChange={e => setBizAddr(e.target.value)} placeholder="Full address (optional)" className={inputCls} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-stone-500 mb-1">WhatsApp / Phone</label>
                  <input value={bizPhone} onChange={e => setBizPhone(e.target.value)} placeholder="9876543210" className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs text-stone-500 mb-1">GSTIN</label>
                  <input value={bizGstin} onChange={e => setBizGstin(e.target.value)} placeholder="Optional" className={inputCls} />
                </div>
              </div>
              {bizError && <div className="text-xs text-red-600">{bizError}</div>}
              <div className="flex gap-2">
                <button type="submit" disabled={updateBiz.isPending} className={saveBtnCls}>
                  {updateBiz.isPending ? 'Saving…' : 'Save changes'}
                </button>
                <button type="button" onClick={() => setBizEdit(false)} className={cancelBtnCls}>Cancel</button>
              </div>
            </form>
          ) : (
            <div className="space-y-2.5 text-sm">
              {[
                ['Business name', data?.business?.name],
                ['City',          data?.business?.city],
                ['Address',       data?.business?.address],
                ['Phone',         data?.business?.phone],
                ['GSTIN',         data?.business?.gstin],
              ].map(([l, v]) => (
                <div key={l as string} className="flex justify-between">
                  <span className="text-stone-500">{l}</span>
                  <span className="text-stone-800 dark:text-stone-200 font-medium">{(v as string) || '—'}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* User Profile */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <div className="text-xs font-medium text-stone-500 uppercase tracking-wide">Your profile</div>
            {!profEdit && (
              <button onClick={() => { setProfEdit(true); setProfError('') }} className={editBtnCls}>Edit</button>
            )}
          </div>
          {profOk && <div className={successCls + ' mb-3'}>✓ Profile updated</div>}
          {profEdit ? (
            <form onSubmit={e => { e.preventDefault(); setProfError(''); updateProf.mutate({ name: profName, phone: profPhone }) }}
              className="space-y-3">
              <div>
                <label className="block text-xs text-stone-500 mb-1">Full name *</label>
                <input value={profName} onChange={e => setProfName(e.target.value)} required className={inputCls} />
              </div>
              <div>
                <label className="block text-xs text-stone-500 mb-1">Phone *</label>
                <input value={profPhone} onChange={e => setProfPhone(e.target.value)} maxLength={10} required className={inputCls} />
              </div>
              <div className="text-xs text-stone-400">Role: {data?.user?.role} (cannot be changed here)</div>
              {profError && <div className="text-xs text-red-600">{profError}</div>}
              <div className="flex gap-2">
                <button type="submit" disabled={updateProf.isPending} className={saveBtnCls}>
                  {updateProf.isPending ? 'Saving…' : 'Save'}
                </button>
                <button type="button" onClick={() => setProfEdit(false)} className={cancelBtnCls}>Cancel</button>
              </div>
            </form>
          ) : (
            <div className="space-y-2.5 text-sm">
              <div className="flex justify-between">
                <span className="text-stone-500">Name</span>
                <span className="text-stone-800 dark:text-stone-200 font-medium">{data?.user?.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-500">Phone</span>
                <span className="text-stone-800 dark:text-stone-200 font-medium">{data?.user?.phone}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-500">Role</span>
                <span className="text-stone-800 dark:text-stone-200 font-medium">{data?.user?.role}</span>
              </div>
            </div>
          )}
        </Card>

        {/* Change Password */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <div className="text-xs font-medium text-stone-500 uppercase tracking-wide">Security</div>
            {!showPw && (
              <button onClick={() => { setShowPw(true); setPwError('') }} className={editBtnCls}>Change password</button>
            )}
          </div>
          {pwOk && <div className={successCls + ' mb-3'}>✓ Password changed successfully</div>}
          {showPw ? (
            <form onSubmit={e => { e.preventDefault(); setPwError(''); changePw.mutate({ currentPassword: curPw, newPassword: newPw }) }}
              className="space-y-3">
              <div>
                <label className="block text-xs text-stone-500 mb-1">Current password *</label>
                <input type="password" value={curPw} onChange={e => setCurPw(e.target.value)} required className={inputCls} />
              </div>
              <div>
                <label className="block text-xs text-stone-500 mb-1">New password * (min 6 chars)</label>
                <input type="password" value={newPw} onChange={e => setNewPw(e.target.value)} minLength={6} required className={inputCls} />
              </div>
              {pwError && <div className="text-xs text-red-600">{pwError}</div>}
              <div className="flex gap-2">
                <button type="submit" disabled={changePw.isPending} className={saveBtnCls}>
                  {changePw.isPending ? 'Changing…' : 'Change password'}
                </button>
                <button type="button" onClick={() => { setShowPw(false); setCurPw(''); setNewPw('') }} className={cancelBtnCls}>Cancel</button>
              </div>
            </form>
          ) : (
            <div className="text-xs text-stone-400">Click "Change password" to update your login password</div>
          )}
        </Card>

        {/* Reminder Rules */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <div className="text-xs font-medium text-stone-500 uppercase tracking-wide">Reminder rules</div>
            {!remEdit && (
              <button onClick={() => { setRemEdit(true); setRemError('') }} className={editBtnCls}>Edit</button>
            )}
          </div>
          {remOk && <div className={successCls + ' mb-3'}>✓ Reminder rules updated</div>}
          {remEdit ? (
            <form onSubmit={e => { e.preventDefault(); setRemError(''); updateRem.mutate({ remindersEnabled: remEnabled, reminderSoftDays: remSoft, reminderFollowDays: remFollow, reminderFirmDays: remFirm }) }}
              className="space-y-3">
              <label className="flex items-center gap-2 mb-2 text-sm text-stone-800 dark:text-stone-200">
                <input type="checkbox" checked={remEnabled} onChange={e => setRemEnabled(e.target.checked)}
                  className="rounded border-stone-300 text-blue-600 focus:ring-blue-500" />
                Enable automated payment reminders
              </label>

              {remEnabled && (
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs text-stone-500 mb-1">Soft (days)</label>
                    <input type="number" value={remSoft} onChange={e => setRemSoft(Number(e.target.value))} required min={1} className={inputCls} />
                  </div>
                  <div>
                    <label className="block text-xs text-stone-500 mb-1">Follow-up (days)</label>
                    <input type="number" value={remFollow} onChange={e => setRemFollow(Number(e.target.value))} required min={1} className={inputCls} />
                  </div>
                  <div>
                    <label className="block text-xs text-stone-500 mb-1">Firm (days)</label>
                    <input type="number" value={remFirm} onChange={e => setRemFirm(Number(e.target.value))} required min={1} className={inputCls} />
                  </div>
                </div>
              )}

              {remError && <div className="text-xs text-red-600">{remError}</div>}
              <div className="flex gap-2 mt-2">
                <button type="submit" disabled={updateRem.isPending} className={saveBtnCls}>
                  {updateRem.isPending ? 'Saving…' : 'Save changes'}
                </button>
                <button type="button" onClick={() => setRemEdit(false)} className={cancelBtnCls}>Cancel</button>
              </div>
            </form>
          ) : (
            <div className="space-y-2.5 text-sm">
              <div className="flex justify-between items-center mb-3">
                <span className="text-stone-500">Auto-reminders</span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-medium tracking-wide uppercase ${data?.business?.remindersEnabled ? 'bg-green-100 text-green-700 dark:bg-green-900/30' : 'bg-stone-100 text-stone-500 dark:bg-stone-800'}`}>
                  {data?.business?.remindersEnabled ? 'Enabled' : 'Disabled'}
                </span>
              </div>
              {data?.business?.remindersEnabled && (
                <div className="text-xs text-stone-500 space-y-1">
                  <div>{data?.business?.reminderSoftDays} days → Soft WhatsApp reminder</div>
                  <div>{data?.business?.reminderFollowDays} days → Follow-up reminder</div>
                  <div>{data?.business?.reminderFirmDays} days → Firm notice</div>
                  <div className="mt-2 text-stone-400">Auto-runs every evening at 8:00 PM</div>
                </div>
              )}
            </div>
          )}
        </Card>

        {/* Staff Management (Owner Only) */}
        {user?.role === 'OWNER' && (
          <Card>
            <div className="flex items-center justify-between mb-4">
              <div className="text-xs font-medium text-stone-500 uppercase tracking-wide">Staff / Munim settings</div>
              {!staffFormOpen && (
                <button onClick={() => { 
                  setStaffEditId(null); setStaffName(''); setStaffPhone(''); setStaffPassword(''); setStaffPerms(new Set()); setStaffError(''); setStaffFormOpen(true);
                }} className={editBtnCls}>+ Add Munim</button>
              )}
            </div>

            {staffFormOpen ? (
              <form onSubmit={handleStaffSubmit} className="space-y-3 mb-4 border border-stone-200 dark:border-stone-800 rounded-lg p-3">
                <div className="text-xs font-medium text-stone-500 uppercase mb-2">
                  {staffEditId ? 'Edit Munim' : 'New Munim'}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-stone-500 mb-1">Name *</label>
                    <input value={staffName} onChange={e => setStaffName(e.target.value)} required className={inputCls} />
                  </div>
                  <div>
                    <label className="block text-xs text-stone-500 mb-1">Phone *</label>
                    <input value={staffPhone} onChange={e => setStaffPhone(e.target.value)} required minLength={10} maxLength={10} className={inputCls} />
                  </div>
                </div>
                {!staffEditId && (
                  <div>
                    <label className="block text-xs text-stone-500 mb-1">Password *</label>
                    <input type="password" value={staffPassword} onChange={e => setStaffPassword(e.target.value)} required minLength={6} className={inputCls} />
                  </div>
                )}
                
                <div>
                  <label className="block text-xs text-stone-500 mb-2 mt-3">Access Permissions</label>
                  <div className="flex flex-wrap gap-2 text-xs">
                    {PERMISSION_OPTIONS.map(opt => {
                      const has = staffPerms.has(opt.id);
                      return (
                        <button key={opt.id} type="button" onClick={() => setStaffPerms(p => { const n = new Set(p); has ? n.delete(opt.id) : n.add(opt.id); return n; })}
                          className={`px-3 py-1.5 rounded-full border transition-colors ${has ? 'bg-blue-600 text-white border-blue-600' : 'border-stone-200 dark:border-stone-700 text-stone-600 dark:text-stone-300'}`}>
                          {opt.label}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {staffError && <div className="text-xs text-red-600 mt-2">{staffError}</div>}
                
                <div className="flex gap-2 mt-4">
                  <button type="submit" disabled={createStaff.isPending || updateStaff.isPending} className={saveBtnCls}>
                    {createStaff.isPending || updateStaff.isPending ? 'Saving…' : 'Save Staff'}
                  </button>
                  <button type="button" onClick={() => setStaffFormOpen(false)} className={cancelBtnCls}>Cancel</button>
                </div>
              </form>
            ) : null}

            {/* List Staff */}
            <div className="space-y-2">
              {sLoading ? <div className="text-xs">Loading…</div> : (staffList ?? []).filter((u:any) => u.isActive).map((u: any) => (
                <div key={u.id} className="flex justify-between items-center py-2 border-b border-stone-50 dark:border-stone-800 last:border-0 text-sm">
                  <div>
                    <div className="font-medium text-stone-800 dark:text-stone-200">{u.name} <span className="text-stone-400 text-xs ml-1 font-normal">{u.phone}</span></div>
                    <div className="text-[10px] text-stone-500 mt-0.5">
                      {u.permissions?.length > 0 ? u.permissions.join(', ') : 'No permissions'}
                    </div>
                  </div>
                  <div className="flex gap-3 text-xs">
                    <button onClick={() => handleStaffEdit(u)} className={editBtnCls}>Edit</button>
                    <button onClick={() => { if(confirm(`Remove ${u.name}?`)) deleteStaff.mutate(u.id) }} className="text-red-500 hover:underline">Remove</button>
                  </div>
                </div>
              ))}
              {(staffList ?? []).filter((u:any)=>u.isActive).length === 0 && !staffFormOpen && (
                <div className="text-xs text-stone-500 italic">No Munims added yet.</div>
              )}
            </div>
          </Card>
        )}
      </div>
    </AppShell>
  )
}
