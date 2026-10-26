import { MathRNG } from 'node-rng';
import { Bank, convertLVLtoXP, itemID } from 'oldschooljs';
import { describe, expect, it, vi } from 'vitest';

import { MessageBuilder } from '@/discord/MessageBuilder.js';
import { BitField, MAX_XP } from '@/lib/constants.js';
import { QuestID } from '@/lib/minions/data/quests.js';
import { stealables } from '@/lib/skilling/skills/thieving/stealables.js';
import type { handleTripFinish } from '@/lib/util/handleTripFinish.js';
import { pickpocketTask } from '@/tasks/minions/pickpocketActivity.js';
import { createTestUser } from '../util.js';

describe('Steal Command', async () => {
	it('should reject invalid steal targets', async () => {
		const user = await createTestUser();
		const res = await user.runCommand('steal', { name: 'not-real' });
		expect(res).toContain('That is not a valid NPC/Stall to pickpocket or steal from');
	});

	it('should require thieving level for chests', async () => {
		const user = await createTestUser();
		await user.update({ skills_thieving: convertLVLtoXP(1) });
		const res = await user.runCommand('steal', { name: '50 coin chest', quantity: 1 });
		expect(res).toContain('needs 43 Thieving to steal from a 50 coin chest.');
	});

	it('should allow stealing from chests', async () => {
		const user = await createTestUser();
		await user.update({ skills_thieving: convertLVLtoXP(99) });
		const res = await user.runCommand('steal', { name: '10 coin chest', quantity: 5 });
		expect(res).toContain('is now going to steal from a 10 coin chest 5x times');
	});

	it('should require prayer level for Rogues Castle chest', async () => {
		const user = await createTestUser();
		await user.update({ skills_thieving: convertLVLtoXP(99), skills_prayer: convertLVLtoXP(1) });
		const res = await user.runCommand('steal', { name: "Rogues' Castle chest", quantity: 1 });
		expect(res).toContain("needs 43 Prayer to steal from a Rogues' Castle chest.");
	});

	it('should require potions for Rogues Castle chest', async () => {
		const user = await createTestUser();
		await user.update({ skills_thieving: convertLVLtoXP(99), skills_prayer: convertLVLtoXP(99) });
		const res = await user.runCommand('steal', { name: "Rogues' Castle chest", quantity: 1 });
		expect(res).toContain("to keep Protect from Melee active while stealing from Rogues' Castle chest.");
	});

	it('should use blighted restores before prayer potions for Rogues Castle chest', async () => {
		const user = await createTestUser(new Bank({ 'Blighted super restore(4)': 1, 'Prayer potion(4)': 100 }));
		await user.update({ skills_thieving: convertLVLtoXP(99), skills_prayer: convertLVLtoXP(99) });
		const res = await user.runCommand('steal', { name: "Rogues' Castle chest", quantity: 193 });
		expect(res).toContain("is now going to steal from a Rogues' Castle chest 193x times");
		expect(res).toContain('Blighted super restore(4)');
		expect(res).toContain('Prayer potion(4)');
	});

	it('should allow pickpocketing NPCs', async () => {
		const user = await createTestUser(new Bank({ Trout: 50 }));
		await user.update({ skills_thieving: convertLVLtoXP(99) });
		const res = await user.runCommand('steal', { name: 'Man', quantity: 5 });
		expect(res).toContain('is now going to pickpocket a Man 5x times');
	});

	it('should respect rune-supplying equipment for Shadow Veil', async () => {
		const user = await createTestUser(new Bank({ Trout: 50, 'Cosmic rune': 10 }), {
			skills_thieving: convertLVLtoXP(99),
			skills_magic: convertLVLtoXP(99),
			finished_quest_ids: [QuestID.AKingdomDivided]
		});

		await user.equip('mage', [itemID('Lava battlestaff')]);
		const costTracker = vi.spyOn(ClientSettings, 'updateBankSetting');

		const res = await user.runCommand('steal', {
			name: 'Man',
			quantity: 1,
			shadow_veil: true
		});
		const trackedCosts = costTracker.mock.calls
			.filter(([key]) => key === 'economyStats_thievingCost')
			.map(([, bank]) => new Bank(bank));

		costTracker.mockRestore();

		expect(trackedCosts).toHaveLength(1);
		expect(trackedCosts[0].amount('Cosmic rune')).toBe(5);
		expect(trackedCosts[0].amount('Earth rune')).toBe(0);
		expect(trackedCosts[0].amount('Fire rune')).toBe(0);

		const foodConsumed = 50 - user.bank.amount('Trout');
		expect(trackedCosts[0].amount('Trout')).toBe(foodConsumed);

		expect(res).toContain('is now going to pickpocket a Man');
		expect(res).toContain('1 Shadow Veil casts');
		await user.bankAmountMatch('Cosmic rune', 5);
		await user.bankAmountMatch('Earth rune', 0);
		await user.bankAmountMatch('Fire rune', 0);
	});
	it('should preserve necklace charges when protection is disabled', async () => {
		const roll = vi.spyOn(MathRNG, 'percentChance').mockImplementation(percent => percent === 25);

		try {
			const enabledUser = await createTestUser(new Bank({ Trout: 50 }), {
				skills_thieving: convertLVLtoXP(99),
				dodgy_necklace_charges: 10
			});

			const enabledResult = await enabledUser.runCommand('steal', {
				name: 'Hero',
				quantity: 1
			});

			expect(enabledResult).toContain('is now going to pickpocket');
			expect(enabledUser.user.dodgy_necklace_charges).toBe(9);

			const disabledUser = await createTestUser(new Bank({ Trout: 50 }), {
				skills_thieving: convertLVLtoXP(99),
				dodgy_necklace_charges: 10
			});

			await disabledUser.update({
				bitfield: { push: BitField.DisableDodgyNecklace }
			});

			const disabledResult = await disabledUser.runCommand('steal', {
				name: 'Hero',
				quantity: 1
			});

			expect(disabledResult).toContain('is now going to pickpocket');
			expect(disabledUser.user.dodgy_necklace_charges).toBe(10);
		} finally {
			roll.mockRestore();
		}
	});
	it('should show Shadow Veil casts at max Magic XP without a zero-charge notice', async () => {
		const user = await createTestUser(new Bank(), {
			skills_thieving: convertLVLtoXP(99),
			skills_magic: MAX_XP,
			dodgy_necklace_charges: 0
		});
		const finish = vi.fn<typeof handleTripFinish>();
		const target = stealables.find(npc => npc.name === 'Man')!;

		await pickpocketTask.run(
			{
				type: 'Pickpocket',
				userID: user.id,
				channelId: '1111111111111111',
				monsterID: target.id,
				quantity: 1,
				successfulQuantity: 0,
				damageTaken: 0,
				xpReceived: 0,
				duration: 1200,
				shadowVeilCasts: 1,
				dodgyNecklaceChargesUsed: 0,
				dodgyNecklaceChargesRemaining: 0
			},
			{ user, handleTripFinish: finish as typeof handleTripFinish, rng: MathRNG }
		);

		expect(finish).toHaveBeenCalledTimes(1);
		const result = finish.mock.calls[0][0];
		if (!('message' in result)) {
			throw new Error('Expected an object containing the trip message');
		}

		if (!(result.message instanceof MessageBuilder)) {
			throw new Error('Expected a MessageBuilder');
		}
		const message = await result.message.build();
		expect(message.content).toContain('Shadow Veil: 1 casts.');
		expect(message.content).not.toContain('Dodgy necklace:');
		expect(message.content).not.toContain('No dodgy necklace charges available');
		expect(message.content).not.toContain('charges have run out');
		expect(Number(user.user.skills_magic)).toBe(MAX_XP);
		finish.mockClear();

		await pickpocketTask.run(
			{
				type: 'Pickpocket',
				userID: user.id,
				channelId: '1111111111111111',
				monsterID: target.id,
				quantity: 1,
				successfulQuantity: 0,
				damageTaken: 0,
				xpReceived: 0,
				duration: 1200,
				shadowVeilCasts: 0,
				dodgyNecklaceChargesUsed: 1,
				dodgyNecklaceChargesRemaining: 0
			},
			{ user, handleTripFinish: finish as typeof handleTripFinish, rng: MathRNG }
		);

		expect(finish).toHaveBeenCalledTimes(1);
		const depletedResult = finish.mock.calls[0][0];
		if (!('message' in depletedResult)) {
			throw new Error('Expected an object containing the trip message');
		}

		if (!(depletedResult.message instanceof MessageBuilder)) {
			throw new Error('Expected a MessageBuilder');
		}
		const depletedMessage = await depletedResult.message.build();
		expect(depletedMessage.content).toContain('Dodgy necklace: consumed 1 charges; 0 charges remaining.');
		expect(depletedMessage.content).toContain('Your dodgy necklace charges have run out.');
		expect(depletedMessage.content).not.toContain('Shadow Veil:');
	});
});
