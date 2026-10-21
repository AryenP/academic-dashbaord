import type { Page } from '@playwright/test';

// A fixed "now" inside the plan window, so screenshots and countdowns are stable:
// Thursday Oct 22 2026, 11:00 AM Pacific, during a DSC 140A study block.
export const NOW = new Date('2026-10-22T11:00:00-07:00');

export async function freezeTime(page: Page, at = NOW) {
  await page.clock.setFixedTime(at);
}

export const SIZES = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'desktop', width: 1440, height: 900 },
] as const;

export const SCHEMES = ['light', 'dark'] as const;
