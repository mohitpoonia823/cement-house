import type { CapabilityFeatureKey, CapabilityModuleKey } from '@/lib/tenant-capabilities'

export interface NavItem {
  label: string
  href: string
  group: 'command' | 'operations' | 'finance' | 'insights' | 'workspace'
  permissionId?: string
  moduleKey?: CapabilityModuleKey
  featureKey?: CapabilityFeatureKey
}

export const navItems: NavItem[] = [
  { label: 'nav.overview', href: '/dashboard', group: 'command' },
  { label: 'nav.orders', href: '/orders', group: 'operations', permissionId: 'orders', moduleKey: 'orders' },
  { label: 'nav.customers', href: '/customers', group: 'operations', permissionId: 'customers', moduleKey: 'customers' },
  { label: 'nav.inventory', href: '/inventory', group: 'operations', permissionId: 'inventory', moduleKey: 'inventory' },
  { label: 'nav.importedBills', href: '/imported-bills', group: 'operations', permissionId: 'inventory', moduleKey: 'inventory' },
  { label: 'nav.delivery', href: '/delivery', group: 'operations', permissionId: 'delivery', moduleKey: 'delivery', featureKey: 'transportManagement' },
  { label: 'nav.khata', href: '/khata', group: 'finance', permissionId: 'ledger', moduleKey: 'payments' },
  { label: 'nav.reports', href: '/reports', group: 'insights', moduleKey: 'reports' },
  { label: 'nav.tickets', href: '/tickets', group: 'workspace' },
  { label: 'nav.settings', href: '/settings', group: 'workspace' },
]

export const groupLabels: Record<string, string> = {
  command: 'group.command',
  operations: 'group.operations',
  finance: 'group.finance',
  insights: 'group.insights',
  workspace: 'group.workspace',
}

export const pageTitles: Record<string, string> = {
  '/dashboard': 'nav.overview',
  '/orders': 'title.orderOperations',
  '/orders/new': 'title.newOrder',
  '/khata': 'title.khataCollections',
  '/customers': 'title.customerIntelligence',
  '/customers/new': 'title.newCustomer',
  '/inventory': 'title.inventoryControl',
  '/imported-bills': 'title.importedBills',
  '/delivery': 'title.deliveryBoard',
  '/reports': 'title.businessReports',
  '/tickets': 'title.supportTickets',
  '/settings': 'title.workspaceSettings',
}
