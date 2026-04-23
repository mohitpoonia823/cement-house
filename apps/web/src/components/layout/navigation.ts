export const navItems = [
  { label: 'Overview', href: '/dashboard', group: 'command' },
  { label: 'Orders', href: '/orders', group: 'operations', permissionId: 'orders' },
  { label: 'Customers', href: '/customers', group: 'operations', permissionId: 'customers' },
  { label: 'Inventory', href: '/inventory', group: 'operations', permissionId: 'inventory' },
  { label: 'Delivery', href: '/delivery', group: 'operations', permissionId: 'delivery' },
  { label: 'Khata', href: '/khata', group: 'finance', permissionId: 'ledger' },
  { label: 'Reports', href: '/reports', group: 'insights' },
  { label: 'Settings', href: '/settings', group: 'workspace' },
]

export const groupLabels: Record<string, string> = {
  command: 'Command Center',
  operations: 'Operations',
  finance: 'Finance',
  insights: 'Insights',
  workspace: 'Workspace',
}

export const pageTitles: Record<string, string> = {
  '/dashboard': 'Overview',
  '/orders': 'Order operations',
  '/orders/new': 'New order',
  '/khata': 'Khata and collections',
  '/customers': 'Customer intelligence',
  '/customers/new': 'New customer',
  '/inventory': 'Inventory control',
  '/delivery': 'Delivery board',
  '/reports': 'Business reports',
  '/settings': 'Workspace settings',
}
