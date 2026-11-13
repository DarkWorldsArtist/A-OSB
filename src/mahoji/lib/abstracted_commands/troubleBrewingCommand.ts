import { Time } from '@oldschoolgg/toolkit';

import type { MinigameActivityTaskOptionsWithNoChanges } from '@/lib/types/minions.js';
import { calcDurationAndQuantity, formatTripDuration } from '@/lib/util/minionUtils.js';

export async function troubleBrewingStartCommand(user: MUser, channelId: string, durationInput?: string) {
	const timePerGame = Time.Minute * 20;
	const maxTripLength = await user.calcMaxTripLength('TroubleBrewing');
	const trip = calcDurationAndQuantity({ durationInput, singleTime: timePerGame, maxTripLength });
	if (typeof trip === 'string') return trip;
	const { quantity, duration } = trip;

	await ActivityManager.startTrip<MinigameActivityTaskOptionsWithNoChanges>({
		quantity,
		userID: user.id,
		duration,
		type: 'TroubleBrewing',
		channelId,
		minigameID: 'trouble_brewing'
	});

	return `${user.minionName} is now doing ${quantity}x games of Trouble Brewing! It will take ${formatTripDuration(user, duration)} to finish.`;
}
