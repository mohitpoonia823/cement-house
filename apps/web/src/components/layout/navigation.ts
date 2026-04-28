export const navItems = [
  { label: 'nav.overview', href: '/dashboard', group: 'command' },
  { label: 'nav.orders', href: '/orders', group: 'operations', permissionId: 'orders' },
  { label: 'nav.customers', href: '/customers', group: 'operations', permissionId: 'customers' },
  { label: 'nav.inventory', href: '/inventory', group: 'operations', permissionId: 'inventory' },
  { label: 'nav.delivery', href: '/delivery', group: 'operations', permissionId: 'delivery' },
  { label: 'nav.khata', href: '/khata', group: 'finance', permissionId: 'ledger' },
  { label: 'nav.reports', href: '/reports', group: 'insights' },
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
  '/delivery': 'title.deliveryBoard',
  '/reports': 'title.businessReports',
  '/tickets': 'title.supportTickets',
  '/settings': 'title.workspaceSettings',
}
