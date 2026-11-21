import { formatDurationWithTimestamp, parseDuration, Time } from '@oldschoolgg/toolkit';
import type { Bank } from 'oldschooljs';

import { BitField } from '@/lib/constants.js';
import { QuestID } from '@/lib/minions/data/quests.js';
import type { MoonKeyHalfCatchRate } from '@/lib/skilling/types.js';

export function formatTripDuration(user: MUser, durationMs: number): string {
	const showTimestamp = user.bitfield.includes(BitField.DisableDynamicTimestamp);

	return formatDurationWithTimestamp(durationMs, user.perkTier, showTimestamp);
}

export const tripDurationOption = {
	type: 'String',
	name: 'duration',
	description: 'The duration of the trip (e.g. 30m, 1h), rounded to the nearest completion.',
	required: false
} as const;

export function calcDurationAndQuantity({
	durationInput,
	singleTime,
	maxTripLength
}: {
	durationInput?: string;
	singleTime: number;
	maxTripLength: number;
}): { quantity: number; duration: number } | string {
	const maxQuantity = Math.floor(maxTripLength / singleTime);
	if (!durationInput) {
		const quantity = Math.max(1, maxQuantity);
		return { quantity, duration: quantity * singleTime };
	}

	const parsedDuration = parseDuration(durationInput);
	if (parsedDuration <= 0 || Number.isNaN(parsedDuration)) {
		return 'Invalid duration provided. Examples of valid durations: 30m, 1h.';
	}

	if (parsedDuration > maxTripLength) {
		return `Your maximum trip length is ${Math.floor(maxTripLength / Time.Minute)} minutes.`;
	}

	const quantity = Math.max(1, Math.min(maxQuantity, Math.round(parsedDuration / singleTime)));
	return { quantity, duration: quantity * singleTime };
}

const MOON_KEY_ONE_IN_PER_MINUTE = 60;

export function rollForMoonKeyHalf({
	rng,
	user,
	duration,
	loot,
	quantity,
	perCatchRate
}: {
	rng: RNGProvider;
	user: MUser | boolean;
	duration: number;
	loot: Bank;
	quantity?: number;
	perCatchRate?: MoonKeyHalfCatchRate;
}) {
	if (typeof user === 'boolean' && !user) return;
	if (typeof user !== 'boolean' && !user.user.finished_quest_ids.includes(QuestID.ChildrenOfTheSun)) return;
	if (perCatchRate) {
		const { numerator, denominator } = perCatchRate;
		if (numerator > 0 && denominator > 0 && (quantity ?? 0) > 0) {
			for (let i = 0; i < (quantity ?? 0); i++) {
				if (numerator >= denominator || rng.randInt(1, denominator) <= numerator) {
					loot.add('Loop half of key (moon key)');
				}
			}
		}
		return;
	}
	const minutes = duration / Time.Minute;
	const fullMinutes = Math.floor(minutes);
	const remainderMinutes = minutes - fullMinutes;

	for (let i = 0; i < fullMinutes; i++) {
		if (rng.roll(MOON_KEY_ONE_IN_PER_MINUTE)) {
			loot.add('Loop half of key (moon key)');
		}
	}

	if (remainderMinutes > 0) {
		const percentChance = (remainderMinutes / MOON_KEY_ONE_IN_PER_MINUTE) * 100;
		if (percentChance > 0 && rng.percentChance(percentChance)) {
			loot.add('Loop half of key (moon key)');
		}
	}
}
