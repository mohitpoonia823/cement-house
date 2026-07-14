// Starter knowledge base — a ready-made FAQ set derived from the app's own
// features and navigation, so the Super Admin begins with a full, useful KB to
// skim and refine instead of authoring from a blank page. Seeding is idempotent
// and matches on title, so re-running never creates duplicates.

export interface StarterKbEntry {
  title: string
  category: string
  content: string
}

export const STARTER_KB_ENTRIES: StarterKbEntry[] = [
  {
    title: 'What is NexaHub and what can it do?',
    category: 'Getting started',
    content:
      'NexaHub is a business management app for Indian shopkeepers and distributors. It handles orders and billing, customers and their udhaar (Khata), inventory, suppliers and payables, expenses, GST, and reports — all in one place. It works in the browser and can be installed as an app on phone or desktop, in English, Hindi, or Hinglish.',
  },
  {
    title: 'How do I add a customer?',
    category: 'Customers',
    content:
      'Go to Customers and use the New button (or Customers > New). Enter the customer name, phone number, and city, then save. The customer will then be available when creating orders and will have their own Khata (ledger) page.',
  },
  {
    title: 'How do I create a new order or bill?',
    category: 'Orders',
    content:
      'Tap "+ New order" in the top bar (or open Orders > New). Choose the customer, add the items with quantity and price, and save. The order is recorded against that customer; if it is on credit it automatically shows up in their Khata.',
  },
  {
    title: 'How do I record a payment received from a customer?',
    category: 'Payments',
    content:
      'Open the Khata section and select the customer, then add a payment (receipt) entry with the amount and payment mode (Cash, UPI, Cheque). The customer\'s outstanding balance updates automatically. You can also add a reference like a UPI transaction id or cheque number.',
  },
  {
    title: 'What is Khata?',
    category: 'Payments',
    content:
      'Khata is the customer ledger (udhaar/credit book). It tracks credit you give to each customer and the payments they make, and shows a running outstanding balance per customer. Credit from orders and payments received both appear here.',
  },
  {
    title: 'How do I manage my inventory and stock?',
    category: 'Inventory',
    content:
      'Open Inventory to see your materials/products with their stock levels and buying/selling prices. You can add new items and update prices there. Stock reduces as you sell and increases when you add purchases.',
  },
  {
    title: 'How do I add stock from a supplier bill?',
    category: 'Inventory',
    content:
      'Go to Imported Bills and upload a photo of the supplier\'s purchase bill. The app\'s scanner reads the bill and extracts the item lines automatically. Review the extracted items and confirm to add them to Inventory — much faster than typing each line.',
  },
  {
    title: 'How do I track suppliers and what I owe them?',
    category: 'Suppliers',
    content:
      'Open Suppliers to see your suppliers and payables (the amounts you owe). Record purchases and payments to suppliers so your outstanding balance with each supplier stays accurate.',
  },
  {
    title: 'How do I record shop expenses?',
    category: 'Finance',
    content:
      'Use Cash & Expenses to record shop expenses and cash movements. Keeping expenses updated makes your Financials and profit figures accurate.',
  },
  {
    title: 'Where can I see profit and financial reports?',
    category: 'Reports',
    content:
      'Financials shows your profit/loss and financial summary, and Reports gives detailed analytics across sales, dues, and stock. For specific numbers about your business, open these screens rather than expecting exact figures in chat.',
  },
  {
    title: 'How does GST billing work?',
    category: 'GST',
    content:
      'When GST billing is enabled for your workspace, the GST section provides GST invoices and tax reports. If you do not see GST, it may not be enabled for your plan or business type.',
  },
  {
    title: 'How do I manage deliveries?',
    category: 'Delivery',
    content:
      'When transport management is enabled, the Delivery board lets you dispatch and track deliveries for your orders. If you do not see Delivery, the feature may not be turned on for your workspace.',
  },
  {
    title: 'How do I add staff members and control their access?',
    category: 'Settings',
    content:
      'Only the business owner can do this. Go to Settings and open the staff section to add a staff member (munim). You can set permissions per staff member so they only access the parts of the app you allow.',
  },
  {
    title: 'How do I change the language?',
    category: 'Getting started',
    content:
      'Use the language dropdown in the top bar to switch between English, Hindi, and Hinglish. The whole app, including this assistant, follows your selected language.',
  },
  {
    title: 'How do I install the app on my phone or computer?',
    category: 'Getting started',
    content:
      'Tap "Install App" in the top bar. On Android/desktop your browser will offer to install it. On iPhone/iPad, tap the browser Share button and choose "Add to Home Screen". After installing, NexaHub opens like a normal app.',
  },
  {
    title: 'My free trial ended and the workspace is locked. What do I do?',
    category: 'Subscription',
    content:
      'When the free trial ends the workspace locks until you activate a paid plan. The business owner should open Settings > Subscription and choose a plan (BASIC, PRO, or ENTERPRISE), billed monthly or yearly, then complete payment. Access unlocks automatically once payment succeeds.',
  },
  {
    title: 'What payment methods are supported for subscription?',
    category: 'Subscription',
    content:
      'Subscription payments go through Razorpay secure checkout, which supports card, UPI, netbanking, and wallets. After a successful payment the plan activates and the workspace unlocks automatically.',
  },
  {
    title: 'Who can manage the subscription and settings?',
    category: 'Subscription',
    content:
      'Only the business OWNER can manage the subscription, staff, and workspace settings. Staff (munim) accounts have access limited to the permissions the owner grants them.',
  },
  {
    title: 'The AI could not answer my question. How do I reach a person?',
    category: 'Support',
    content:
      'On the Tickets page use the "Need Help" form to raise a ticket to the support team, or click "Send to support team" in the assistant chat to forward your conversation. A human will reply in the same ticket thread.',
  },
]
