import { describe, expect, test } from 'vitest';

import {
	getPerkTierDetails,
	getPerkTierDisplay,
	getPerkTierEx,
	hasPatronPerkTier,
	PerkTier,
	RoboChimpBit
} from '../src/index.js';

describe('perk tiers', () => {
	test('formats paid tiers', () => {
		expect(getPerkTierDisplay({ patreonBits: [RoboChimpBit.PatronTier3] })).toBe('Tier 3 Patron');
		expect(getPerkTierDisplay({ patreonBits: [RoboChimpBit.PatronTier1, RoboChimpBit.PatronTier3] })).toBe(
			'Tier 3 Patron, Tier 1 Patron'
		);
	});

	test('formats courtesy and empty tiers', () => {
		expect(getPerkTierDisplay({ patreonBits: [] }, { courtesyTier: PerkTier.Four })).toBe(
			'**Courtesy** __Tier 3__'
		);
		expect(getPerkTierDisplay({ patreonBits: [] })).toBe('None');
	});

	test('uses highest unexpired timed tier', () => {
		const now = 1000;
		const input = {
			patreonBits: [RoboChimpBit.PatronTier1],
			premiumTier: 5,
			premiumExpiry: now + 10_000
		};

		expect(getPerkTierEx(input, { now })).toBe(PerkTier.Five);
		expect(getPerkTierDisplay(input, { now })).toBe('Temporary: **Tier 4** (Expires: <t:11:R>)');
	});

	test('formats multiple unexpired timed tier entitlements', () => {
		const now = 1000;
		const input = {
			patreonBits: [],
			premiumEntitlements: [
				{ tier: 3, expiry: now + 20_000 },
				{ tier: 5, expiry: now + 10_000 },
				{ tier: 7, expiry: now - 1 }
			]
		};

		expect(getPerkTierEx(input, { now })).toBe(PerkTier.Five);
		expect(getPerkTierDisplay(input, { now })).toBe(
			'Temporary: **Tier 4** (Expires: <t:11:R>), Temporary: Tier 2 (Expires: <t:21:R>)'
		);
	});

	test('ignores expired timed tier', () => {
		const now = 1000;
		expect(
			getPerkTierEx(
				{
					patreonBits: [RoboChimpBit.PatronTier1],
					premiumTier: 5,
					premiumExpiry: now - 1
				},
				{ now }
			)
		).toBe(PerkTier.Two);
	});

	test('formats legacy tiers above paid tiers', () => {
		expect(getPerkTierDisplay({ patreonBits: [RoboChimpBit.PatronTier1] }, { legacyTier: 4 })).toBe(
			'🔴 **Legacy** __Tier 3__'
		);
	});

	test('returns entitlement details', () => {
		const details = getPerkTierDetails({ patreonBits: [RoboChimpBit.PatronTier3] });
		expect(details).toEqual([
			{
				tier: PerkTier.Four,
				source: 'patreon',
				bit: RoboChimpBit.PatronTier3,
				patronTier: 3
			}
		]);
	});

	test('checks hasPatronPerkTier', () => {
		expect(hasPatronPerkTier({ patreonBits: [RoboChimpBit.PatronTier3] }, PerkTier.Four)).toBe(true);
		expect(hasPatronPerkTier({ patreonBits: [RoboChimpBit.PatronTier1] }, PerkTier.Four)).toBe(false);
		expect(hasPatronPerkTier({ patreonBits: [] }, PerkTier.Two)).toBe(false);
	});
});
