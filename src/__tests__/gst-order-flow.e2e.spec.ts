import { test, expect } from '@playwright/test'

// Smoke scaffold for GST UI flow.
// Enable after Playwright is installed/configured in this repo.
test.describe('GST order flow smoke', () => {
  test.skip('NewOrderForm computes tax preview and submits non-zero tax summary', async ({ page }) => {
    await page.goto('http://localhost:3000/orders?openNewOrder=1')

    // 1) Open NewOrderForm (modal or page)
    await expect(page.getByText('Order details')).toBeVisible()

    // 2) Select customer and product with known gstRate=18
    await page.locator('select').first().selectOption({ index: 1 })
    const productSelect = page.locator('select').nth(2)
    await productSelect.selectOption({ index: 1 })

    // 3) Set qty=2
    const qtyInput = page.locator('input[type="number"]').first()
    await qtyInput.fill('2')

    // 4) Verify tax preview shows CGST + SGST non-zero
    await expect(page.getByText('Tax preview')).toBeVisible()
    const cgstValue = page.locator('text=CGST').locator('..').locator('div').last()
    const sgstValue = page.locator('text=SGST').locator('..').locator('div').last()
    await expect(cgstValue).not.toContainText('₹0')
    await expect(sgstValue).not.toContainText('₹0')

    // 5) Submit and verify created order has non-zero taxSummary
    await page.getByRole('button', { name: /save order/i }).click()
    await expect(page.getByText(/Order created successfully/i)).toBeVisible()
    await page.waitForURL(/\/orders(\/.*)?$/)
    await expect(page.locator('body')).toContainText(/CGST|SGST|GST/i)
  })
})
