'use client'

import { useState } from 'react'
import { AppShell } from '@/components/layout/AppShell'
import { Card, SectionHeader } from '@/components/ui/Card'
import { useCreateLocation, useLocations, useUpdateLocation } from '@/hooks/useInventory'

const LOCATION_TYPES = ['STORE', 'GODOWN', 'WAREHOUSE', 'YARD'] as const

export default function LocationsSettingsPage() {
  const { data: locations, isLoading } = useLocations()
  const createLocation = useCreateLocation()
  const updateLocation = useUpdateLocation()
  const [name, setName] = useState('')
  const [type, setType] = useState<(typeof LOCATION_TYPES)[number]>('STORE')
  const [address, setAddress] = useState('')
  const [error, setError] = useState('')

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    try {
      await createLocation.mutateAsync({
        name,
        type,
        address: address || undefined,
      })
      setName('')
      setAddress('')
      setType('STORE')
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Failed to create location')
    }
  }

  async function setDefault(locationId: string) {
    await updateLocation.mutateAsync({ id: locationId, isDefault: true })
  }

  async function toggleActive(location: any) {
    await updateLocation.mutateAsync({ id: location.id, isActive: !location.isActive })
  }

  return (
    <AppShell>
      <SectionHeader
        eyebrow="Settings"
        title="Locations"
        description="Manage physical stock locations for this business."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <div className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Add location</div>
          <form onSubmit={handleCreate} className="space-y-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Location name"
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
              required
            />
            <select
              value={type}
              onChange={(e) => setType(e.target.value as any)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
            >
              {LOCATION_TYPES.map((entry) => (
                <option key={entry} value={entry}>{entry}</option>
              ))}
            </select>
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Address (optional)"
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-950"
            />
            {error ? <div className="text-xs text-red-600">{error}</div> : null}
            <button
              type="submit"
              disabled={createLocation.isPending}
              className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60 dark:bg-sky-500 dark:text-slate-950"
            >
              {createLocation.isPending ? 'Saving...' : 'Add location'}
            </button>
          </form>
        </Card>

        <Card>
          <div className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Existing locations</div>
          {isLoading ? <div className="text-sm text-slate-500">Loading...</div> : null}
          <div className="space-y-2">
            {(locations ?? []).map((location: any) => (
              <div key={location.id} className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2 dark:border-slate-800">
                <div>
                  <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                    {location.name} {location.isDefault ? <span className="text-xs text-emerald-600">(Default)</span> : null}
                  </div>
                  <div className="text-xs text-slate-500">{location.type} {location.address ? `• ${location.address}` : ''}</div>
                </div>
                <div className="flex gap-2">
                  {!location.isDefault ? (
                    <button
                      type="button"
                      onClick={() => setDefault(location.id)}
                      className="rounded-md border border-slate-300 px-2 py-1 text-xs dark:border-slate-700"
                    >
                      Make default
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => toggleActive(location)}
                    className="rounded-md border border-slate-300 px-2 py-1 text-xs dark:border-slate-700"
                  >
                    {location.isActive ? 'Deactivate' : 'Activate'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </AppShell>
  )
}
