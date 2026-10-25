import { calcWhatPercent, PerkTier, Time } from '@oldschoolgg/toolkit';

import { activity_type_enum } from '@/prisma/main/enums.js';
import { BitField, SkillsEnum } from '@/lib/constants.js';
import { RobochimpBitfieldEnum } from '@/lib/perkTiers.js';
import type { RobochimpUser } from '@/lib/roboChimp.js';

export function patronMaxTripBonus(perkTier: PerkTier | 0) {
	if (perkTier === PerkTier.Two) return Time.Minute * 3;
	if (perkTier === PerkTier.Three) return Time.Minute * 6;
	if (perkTier === PerkTier.Four) return Time.Minute * 15;
	if (perkTier === PerkTier.Five) return Time.Minute * 20;
	if (perkTier >= PerkTier.Six) return Time.Minute * 25;
	return 0;
}

export function calcMaxTripLengthSync(
	user: MUser,
	roboUser: Pick<RobochimpUser, 'bits' | 'premium_balance_tier' | 'premium_balance_expiry_date'>,
	activity?: activity_type_enum
) {
	let max = Time.Minute * 30;
	const perkTier = user.perkTier;
	max += patronMaxTripBonus(perkTier);
	if (roboUser.bits.includes(RobochimpBitfieldEnum.BonusMinute)) {
		max += Time.Minute;
	}
	if (
		roboUser.bits.includes(RobochimpBitfieldEnum.OriginalSupporter) ||
		user.bitfield.includes(BitField.OriginalSupporter)
	) {
		max += Time.Minute * 2;
	}

	switch (activity) {
		case activity_type_enum.SpecificQuest:
			return Time.Hour * 2;
		case activity_type_enum.Nightmare:
		case activity_type_enum.GroupMonsterKilling:
		case activity_type_enum.MonsterKilling:
		case activity_type_enum.Wintertodt:
		case activity_type_enum.Zalcano:
		case activity_type_enum.BarbarianAssault:
		case activity_type_enum.AnimatedArmour:
		case activity_type_enum.Sepulchre:
		case activity_type_enum.Pickpocket:
		case activity_type_enum.SoulWars:
		case activity_type_enum.Cyclops: {
			const hpLevel = user.skillsAsLevels.hitpoints;
			const hpPercent = calcWhatPercent(hpLevel - 10, 99 - 10);
			max += calcWhatPercent(hpPercent, Time.Minute * 5);
			break;
		}
		case activity_type_enum.Alching: {
			max *= 2;
			break;
		}
		case activity_type_enum.NightmareZone: {
			max *= 3;
			break;
		}
		default: {
			break;
		}
	}

	const sac = Number(user.user.sacrificedValue);
	const { isIronman } = user;
	const sacPercent = Math.min(100, calcWhatPercent(sac, isIronman ? 5_000_000 : 20_000_000));
	max += calcWhatPercent(sacPercent, perkTier >= PerkTier.Four ? Time.Minute * 3 : Time.Minute);
	return max;
}

export async function calcMaxTripLength(user: MUser, activity?: activity_type_enum) {
	await user.fetchPerkTier();
	return calcMaxTripLengthSync(user, await Cache.getRoboChimpUser(user.id), activity);
}
