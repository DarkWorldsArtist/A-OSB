import { uniqueArr } from './array.js';
import { relativeTimestamp } from './datetime.js';
import { PerkTier } from './misc.js';

export const RoboChimpBit = {
	Admin: 1,
	Moderator: 2,
	Trusted: 3,
	WikiContributor: 4,
	Contributor: 5,
	BothBotsMaxedFreeTierOnePerks: 6,
	HasPermanentTierOne: 7,
	HasEverBeenPatron: 14,
	SupportStaff: 15,
	PatronTier1: 17,
	PatronTier2: 18,
	PatronTier3: 19,
	PatronTier4: 20,
	PatronTier5: 21,
	PatronTier6: 22,
	PatronTier7: 23,
	OriginalSupporter: 24,
	BonusMinute: 25
} as const;

export type RoboChimpBit = (typeof RoboChimpBit)[keyof typeof RoboChimpBit];
export type RoboChimpBitDescription = {
	description: string;
};
export const roboChimpBitData: Record<RoboChimpBit, RoboChimpBitDescription> = {
	[RoboChimpBit.Admin]: { description: 'Admin' },
	[RoboChimpBit.Moderator]: { description: 'Moderator' },
	[RoboChimpBit.SupportStaff]: { description: 'Support Staff' },
	[RoboChimpBit.Trusted]: { description: 'Trusted' },
	[RoboChimpBit.WikiContributor]: { description: 'Wiki Contributor' },
	[RoboChimpBit.Contributor]: { description: 'Contributor' },
	[RoboChimpBit.BothBotsMaxedFreeTierOnePerks]: { description: 'Maxed patron perks for both bots' },
	[RoboChimpBit.HasPermanentTierOne]: { description: 'Has permanent Tier 1 perks' },
	[RoboChimpBit.HasEverBeenPatron]: { description: 'Has been a patron before' },
	[RoboChimpBit.PatronTier1]: { description: 'Tier 1 patron' },
	[RoboChimpBit.PatronTier2]: { description: 'Tier 2 patron' },
	[RoboChimpBit.PatronTier3]: { description: 'Tier 3 patron' },
	[RoboChimpBit.PatronTier4]: { description: 'Tier 4 patron' },
	[RoboChimpBit.PatronTier5]: { description: 'Tier 5 patron' },
	[RoboChimpBit.PatronTier6]: { description: 'Tier 6 patron' },
	[RoboChimpBit.PatronTier7]: { description: 'Tier 7 patron' },
	[RoboChimpBit.OriginalSupporter]: { description: 'Original Supporter' },
	[RoboChimpBit.BonusMinute]: { description: 'Bonus minute' }
};

export type PatronTier = {
	id?: string;
	bit: number;
	perkTier: PerkTier;
	number: number;
};

type PerkTierExpiry = {
	date: Date;
	ttl: bigint;
};

export type PatreonPerk = {
	tier: PerkTier;
	source: 'patreon';
	bit: number;
	patronTier: number;
};

export type TimedPatronPerk = {
	tier: PerkTier;
	source: 'timed';
	expires: PerkTierExpiry;
};

export type LocalPerk = {
	tier: PerkTier;
	source: 'courtesy' | 'legacy';
};

export type PerkTierEntitlement = PatreonPerk | TimedPatronPerk | LocalPerk;

export type PerkTierInput = {
	patreonBits: number[] | null | undefined;
	premiumTier?: PerkTier | number | null;
	premiumExpiry?: bigint | number | Date | null;
	premiumEntitlements?: Array<{
		tier: PerkTier | number | null | undefined;
		expiry: bigint | number | Date | null | undefined;
	}>;
};

export type PerkTierOptions = {
	courtesyTier?: PerkTier | number | null;
	legacyTier?: PerkTier | number | null;
	now?: number;
};

export const patronTiers: PatronTier[] = [
	{ bit: RoboChimpBit.PatronTier7, perkTier: PerkTier.Seven, number: 7 },
	{ bit: RoboChimpBit.PatronTier6, perkTier: PerkTier.Seven, number: 6 },
	{ bit: RoboChimpBit.PatronTier5, perkTier: PerkTier.Six, number: 5 },
	{ bit: RoboChimpBit.PatronTier4, perkTier: PerkTier.Five, number: 4 },
	{ bit: RoboChimpBit.PatronTier3, perkTier: PerkTier.Four, number: 3 },
	{ bit: RoboChimpBit.PatronTier2, perkTier: PerkTier.Three, number: 2 },
	{ bit: RoboChimpBit.PatronTier1, perkTier: PerkTier.Two, number: 1 }
];

export const paidTiers: PatronTier[] = patronTiers;
export const allPatronBits: number[] = patronTiers.map(tier => tier.bit);

function normalizeExpiry(expiry: bigint | number | Date | null | undefined): number | null {
	if (expiry instanceof Date) return expiry.getTime();
	if (typeof expiry === 'bigint') return Number(expiry);
	if (typeof expiry === 'number') return expiry;
	return null;
}

function bestTier(details: PerkTierEntitlement[]): PerkTierEntitlement | null {
	return (
		[...details].sort((a, b) => {
			if (b.tier !== a.tier) return b.tier - a.tier;
			const order: Record<PerkTierEntitlement['source'], number> = {
				patreon: 4,
				timed: 3,
				courtesy: 2,
				legacy: 1
			};
			return order[b.source] - order[a.source];
		})[0] ?? null
	);
}

export function getPatronTierLabel(tier: Pick<PatronTier, 'number'>): string {
	return `Tier ${tier.number} Patron`;
}

export function getUserPaidTiers(bits: number[] | null | undefined): PatronTier[] {
	if (!bits) return [];
	return patronTiers.filter(tier => bits.includes(tier.bit));
}

export function formatUserPaidTiers(bits: number[] | null | undefined): string {
	const labels = uniqueArr(
		getUserPaidTiers(bits)
			.sort((a, b) => {
				if (b.perkTier !== a.perkTier) return b.perkTier - a.perkTier;
				return b.number - a.number;
			})
			.map(getPatronTierLabel)
	);
	return labels.length === 0 ? 'None' : labels.join(', ');
}

function timedEntitlements(user: PerkTierInput, now = Date.now()) {
	const temporaryEntitlement =
		user.premiumTier && user.premiumExpiry ? [{ tier: user.premiumTier, expiry: user.premiumExpiry }] : [];
	const entitlements = [...(user.premiumEntitlements ?? []), ...temporaryEntitlement];

	return entitlements.filter((timed, index) => {
		const expiry = normalizeExpiry(timed.expiry);
		if (!timed.tier || !expiry || expiry <= now) return false;
		return entitlements.findIndex(other => other.tier === timed.tier && other.expiry === timed.expiry) === index;
	});
}

export function hasPatronPerkTier(
	user: PerkTierInput,
	minimumTier: PerkTier | number,
	now: number = Date.now()
): boolean {
	if (patronTiers.some(tier => tier.perkTier >= minimumTier && user.patreonBits?.includes(tier.bit))) return true;

	return timedEntitlements(user, now).some(timed => {
		const expiry = normalizeExpiry(timed.expiry);
		if (!timed.tier || !expiry) return false;
		return timed.tier >= minimumTier && expiry > now;
	});
}

export function getPerkTierDetails(user: PerkTierInput, options: PerkTierOptions = {}): PerkTierEntitlement[] {
	const now = options.now ?? Date.now();
	const details: PerkTierEntitlement[] = getUserPaidTiers(user.patreonBits).map(tier => ({
		tier: tier.perkTier,
		source: 'patreon',
		bit: tier.bit,
		patronTier: tier.number
	}));

	for (const timed of timedEntitlements(user, now)) {
		const timedExpiry = normalizeExpiry(timed.expiry);
		if (timed.tier && timedExpiry && timedExpiry > now) {
			details.push({
				tier: timed.tier as PerkTier,
				source: 'timed',
				expires: {
					date: new Date(timedExpiry),
					ttl: BigInt(Math.max(0, timedExpiry - now))
				}
			});
		}
	}

	if (options.courtesyTier && options.courtesyTier > 0) {
		details.push({ tier: options.courtesyTier as PerkTier, source: 'courtesy' });
	}

	if (options.legacyTier && options.legacyTier > 0) {
		details.push({ tier: options.legacyTier as PerkTier, source: 'legacy' });
	}

	return details.sort((a, b) => b.tier - a.tier);
}

export function getPerkTierEx(user: PerkTierInput, options?: PerkTierOptions): PerkTier {
	return bestTier(getPerkTierDetails(user, options))?.tier ?? PerkTier.Zero;
}

export function getPerkTierDisplay(user: PerkTierInput, options?: PerkTierOptions): string {
	const details = getPerkTierDetails(user, options);
	const patreonTier = Math.max(
		PerkTier.Zero,
		...details.filter(tier => tier.source === 'patreon').map(tier => tier.tier)
	);
	const timedTiers = details.filter((tier): tier is TimedPatronPerk => tier.source === 'timed');
	const timed = timedTiers[0];
	const courtesyTier = Math.max(
		PerkTier.Zero,
		...details.filter(tier => tier.source === 'courtesy').map(tier => tier.tier)
	);
	const legacyTier = Math.max(
		PerkTier.Zero,
		...details.filter(tier => tier.source === 'legacy').map(tier => tier.tier)
	);

	if (timed && timed.tier > patreonTier && timed.tier >= courtesyTier && timed.tier >= legacyTier) {
		return timedTiers
			.map((tier, index) => {
				const tierLabel = `Tier ${tier.tier - 1}`;
				return `Temporary: ${index === 0 ? `**${tierLabel}**` : tierLabel} (Expires: ${relativeTimestamp(tier.expires.date)})`;
			})
			.join(', ');
	}

	if (courtesyTier > patreonTier && courtesyTier > (timed?.tier ?? PerkTier.Zero) && courtesyTier >= legacyTier) {
		return `**Courtesy** __Tier ${courtesyTier - 1}__`;
	}

	if (legacyTier > patreonTier && legacyTier > (timed?.tier ?? PerkTier.Zero) && legacyTier > courtesyTier) {
		return `🔴 **Legacy** __Tier ${legacyTier - 1}__`;
	}

	const paidTierDisplay = formatUserPaidTiers(user.patreonBits);
	if (paidTierDisplay !== 'None') return paidTierDisplay;

	return 'None';
}
