import { bold, EmbedBuilder, inlineCode } from '@oldschoolgg/discord';
import { ECombatOption, type IGuild } from '@oldschoolgg/schemas';
import {
	cleanString,
	formatDuration,
	hexToDecimal,
	isValidHexColor,
	miniID,
	removeFromArr,
	stringMatches,
	Time,
	uniqueArr
} from '@oldschoolgg/toolkit';
import { Bank, type ItemBank, Items } from 'oldschooljs';

import type { activity_type_enum } from '@/prisma/main/enums.js';
import { choicesOf, itemOption } from '@/discord/index.js';
import { MessageBuilder } from '@/discord/MessageBuilder.js';
import { bankFlags } from '@/lib/canvas/bankImage.js';
import { CanvasModule } from '@/lib/canvas/CanvasModule.js';
import { ItemIconPacks } from '@/lib/canvas/iconPacks.js';
import { OSRSCanvas } from '@/lib/canvas/OSRSCanvas.js';
import { BitField, BitFieldData, PerkTier } from '@/lib/constants.js';
import { Eatables } from '@/lib/data/eatables.js';
import { CombatOptionsArray } from '@/lib/minions/data/combatConstants.js';
import { birdhouseSeeds } from '@/lib/skilling/skills/hunter/birdHouseTrapping.js';
import { autoslayChoices, slayerMasterChoices } from '@/lib/slayer/constants.js';
import { setDefaultAutoslay, setDefaultSlayerMaster } from '@/lib/slayer/slayerUtil.js';
import { BankSortMethods, isValidBankSortMethod } from '@/lib/sorts.js';
import { parseBank } from '@/lib/util/parseStringBank.js';
import { isValidNickname, patronMsg } from '@/lib/util/smallUtils.js';
import { toggleBitfield } from '@/lib/util.js';

type ExtendedBitFieldDataa = (typeof BitFieldData)[BitField] & {
	bit: BitField;
	canToggle?: (
		user: MUser,
		interaction?: MInteraction
	) => Promise<{ result: false; message: string } | { result: true; message?: string }>;
};

const configBitFieldOverrides: Partial<Record<BitField, Partial<ExtendedBitFieldDataa>>> = {
	[BitField.ShowTripLootValue]: {
		name: 'Show Trip Loot Value Summary',
		userConfigurable: true,
		bit: BitField.ShowTripLootValue,
		canToggle: async user => {
			if ((await user.fetchPerkTier()) < PerkTier.Two) {
				return {
					result: false,
					message: patronMsg(PerkTier.Two)
				};
			}
			return { result: true };
		}
	},
	[BitField.SelfGamblingLocked]: {
		name: 'Lock Self From Gambling',
		userConfigurable: true,
		bit: BitField.SelfGamblingLocked,
		canToggle: async (user, interaction) => {
			if (user.bitfield.includes(BitField.SelfGamblingLocked) && user.user.gambling_lockout_expiry) {
				const timeRemaining = user.user.gambling_lockout_expiry.getTime() - Date.now();
				if (timeRemaining < Time.Year) {
					if (user.user.gambling_lockout_expiry.getTime() > Date.now()) {
						return {
							result: false,
							message: `You cannot toggle this off for another ${formatDuration(
								timeRemaining
							)}, you locked yourself from gambling!`
						};
					}
				}
				return { result: true, message: 'Your Gambling lockout time has expired.' };
			} else if (interaction) {
				const durations = [
					{ display: '1 day', duration: Time.Day },
					{ display: '7 days', duration: Time.Day * 7 },
					{ display: '1 month', duration: Time.Month },
					{ display: '6 months', duration: Time.Month * 6 },
					{ display: '1 year', duration: Time.Year }
				];
				await interaction.defer();

				const choice = await globalClient.pickStringWithButtons({
					interaction,
					options: durations.map(d => ({ label: d.display, id: d.display })),
					content: `${user}, This will lockout your ability to gamble for the specified time. Choose carefully!`
				});

				const pickedDuration = durations.find(d => stringMatches(d.display, choice?.choice.label ?? ''));

				if (pickedDuration) {
					await user.update({ gambling_lockout_expiry: new Date(Date.now() + pickedDuration.duration) });
					return {
						result: true,
						message: `Locking out gambling for ${formatDuration(pickedDuration.duration)}`
					};
				}
				return { result: false, message: 'Cancelled.' };
			}
			return { result: true };
		}
	}
};

const userBitToggles: ExtendedBitFieldDataa[] = Object.entries(BitFieldData)
	.map(([bit, data]) => {
		const bitField = Number(bit) as BitField;
		return {
			...data,
			bit: bitField,
			...configBitFieldOverrides[bitField]
		};
	})
	.filter(toggle => toggle.userConfigurable);

async function handleToggle(user: MUser, name: string, interaction?: MInteraction): Promise<string> {
	const toggle = userBitToggles.find(i => stringMatches(i.name, name));
	if (!toggle) return 'Invalid toggle name.';
	let messageExtra = '';
	if (toggle.canToggle) {
		const toggleResult = await toggle.canToggle(user, interaction);
		if (!toggleResult.result) {
			return toggleResult.message;
		} else if (toggleResult.message) {
			messageExtra = toggleResult.message;
		}
	}
	return (await toggleBitfield(user, toggle.bit, toggle.name)) + ' ' + messageExtra;
}

async function favFoodConfig(
	user: MUser,
	itemToAdd: string | undefined,
	itemToRemove: string | undefined,
	reset: boolean
): Promise<string> {
	if (reset) {
		await user.update({ favorite_food: [] });
		return 'Cleared all favorite food.';
	}
	const currentFavorites = user.user.favorite_food;
	const item = Items.getItem(itemToAdd ?? itemToRemove);
	const currentItems = `Your current favorite food is: ${
		currentFavorites.length === 0 ? 'None' : currentFavorites.map(i => Items.itemNameFromId(i)).join(', ')
	}.`;
	if (!item) return currentItems;
	if (!Eatables.some(i => i.id === item.id)) return "That's not a valid item.";

	if (itemToAdd) {
		if (currentFavorites.includes(item.id)) return 'This item is already favorited.';
		await user.update({ favorite_food: [...currentFavorites, item.id] });
		return `You favorited ${item.name}.`;
	}
	if (itemToRemove) {
		if (!currentFavorites.includes(item.id)) return 'This item is not favorited.';
		await user.update({ favorite_food: removeFromArr(currentFavorites, item.id) });
		return `You unfavorited ${item.name}.`;
	}
	return currentItems;
}

async function favItemConfig(
	user: MUser,
	itemToAdd: string | undefined,
	itemToRemove: string | undefined,
	manyToAdd: string | undefined,
	reset: boolean
) {
	if (reset) {
		await user.update({ favoriteItems: [] });
		return 'Cleared all favorite items.';
	}
	const currentFavorites = user.user.favoriteItems;
	const limit = ((await user.fetchPerkTier()) + 1) * 100;
	if (manyToAdd) {
		const items = parseBank({ inputStr: manyToAdd, noDuplicateItems: true }).filter(
			i => !currentFavorites.includes(i.id)
		);
		if (items.length === 0) return 'No valid items were given.';
		const newFavs = uniqueArr([...currentFavorites, ...items.items().map(i => i[0].id)]);
		if (newFavs.length > limit) {
			return `You can't favorite that many items, you can favorite a maximum of ${limit}.`;
		}
		await user.update({
			favoriteItems: newFavs
		});
		return `Added ${items
			.items()
			.map(i => i[0].name)
			.join(', ')} to your favorite items, you now have ${newFavs.length} favorite items.`;
	}
	const item = Items.getItem(itemToAdd ?? itemToRemove);
	const currentItems = `Your current favorite items are: ${
		currentFavorites.length === 0
			? 'None'
			: currentFavorites
					.map(i => Items.itemNameFromId(i))
					.join(', ')
					.slice(0, 1500)
	}.`;

	if (!item) return currentItems;
	if (itemToAdd) {
		if (currentFavorites.length >= limit) {
			return `You can't favorite anymore items, you can favorite a maximum of ${limit}.`;
		}
		if (currentFavorites.includes(item.id)) return 'This item is already favorited.';
		await user.update({ favoriteItems: [...currentFavorites, item.id] });
		return `You favorited ${item.name}.`;
	}
	if (itemToRemove) {
		if (!currentFavorites.includes(item.id)) return 'This item is not favorited.';
		await user.update({ favoriteItems: removeFromArr(currentFavorites, item.id) });
		return `You unfavorited ${item.name}.`;
	}
	return currentItems;
}

async function favAlchConfig(
	user: MUser,
	itemToAdd: string | undefined,
	itemToRemove: string | undefined,
	manyToAdd: string | undefined,
	reset: boolean
) {
	if (reset) {
		await user.update({ favorite_alchables: [] });
		return 'Cleared all favorite alchables.';
	}
	const currentFavorites = user.user.favorite_alchables;
	if (manyToAdd) {
		const items = parseBank({ inputStr: manyToAdd, noDuplicateItems: true })
			.filter(i => i.highalch !== undefined && i.highalch > 1)
			.filter(i => !currentFavorites.includes(i.id));
		if (items.length === 0) return 'No valid items were given.';
		const newFavs = uniqueArr([...currentFavorites, ...items.items().map(i => i[0].id)]);
		await user.update({
			favorite_alchables: newFavs
		});
		return `Added ${items
			.items()
			.map(i => i[0].name)
			.join(', ')} to your favorites.`;
	}

	const removeItem = itemToRemove ? Items.getItem(itemToRemove) : null;
	const addItem = itemToAdd ? Items.getItem(itemToAdd) : null;
	const item = removeItem || addItem;

	if (!item) {
		if (currentFavorites.length === 0) {
			return 'You have no favorited alchable items.';
		}
		return `Your current favorite alchable items are: ${currentFavorites.map(i => Items.itemNameFromId(i)).join(', ')}.`;
	}

	if (!item.highalch) return "That item isn't alchable.";

	const action = removeItem ? 'remove' : 'add';
	const isAlreadyFav = currentFavorites.includes(item.id);

	if (action === 'remove') {
		if (!isAlreadyFav) return 'That item is not favorited.';
		await user.update({
			favorite_alchables: removeFromArr(currentFavorites, item.id)
		});
		return `Removed ${item.name} from your favorite alchable items.`;
	}
	if (isAlreadyFav) return 'That item is already favorited.';
	await user.update({
		favorite_alchables: uniqueArr([...currentFavorites, item.id])
	});
	return `Added ${item.name} to your favorite alchable items.`;
}

async function favBhSeedsConfig(
	user: MUser,
	itemToAdd: string | undefined,
	itemToRemove: string | undefined,
	reset: boolean
) {
	if (reset) {
		await user.update({ favorite_bh_seeds: [] });
		return 'Cleared all favorite birdhouse seeds.';
	}

	const currentFavorites = user.user.favorite_bh_seeds;
	if (itemToAdd || itemToRemove) {
		const item = Items.getItem(itemToAdd ?? itemToRemove);
		if (!item) return "That item doesn't exist.";
		if (!birdhouseSeeds.some(seed => seed.item.id === item.id)) return "That item can't be used in birdhouses.";
		if (itemToAdd) {
			if (currentFavorites.includes(item.id)) return 'This item is already favorited.';
			await user.update({ favorite_bh_seeds: [...currentFavorites, item.id] });
			return `You favorited ${item.name}.`;
		}
		if (itemToRemove) {
			if (!currentFavorites.includes(item.id)) return 'This item is not favorited.';
			await user.update({ favorite_bh_seeds: removeFromArr(currentFavorites, item.id) });
			return `You unfavorited ${item.name}.`;
		}
	}

	const currentItems = `Your current favorite items are: ${
		currentFavorites.length === 0 ? 'None' : currentFavorites.map(i => Items.itemNameFromId(i)).join(', ')
	}.`;
	return currentItems;
}

async function bankSortConfig(
	user: MUser,
	sortMethod: string | undefined,
	addWeightingBank: string | undefined,
	removeWeightingBank: string | undefined,
	resetWeightingBank: string | undefined
): CommandResponse {
	const currentMethod = user.user.bank_sort_method;
	const currentWeightingBank = new Bank(user.user.bank_sort_weightings as ItemBank);

	if (!sortMethod && !addWeightingBank && !removeWeightingBank && !resetWeightingBank) {
		const sortStr = currentMethod
			? `Your current bank sort method is ${inlineCode(currentMethod)}.`
			: 'You have not set a bank sort method.';
		const weightingBankStr = currentWeightingBank.toString();
		const response = new MessageBuilder().setContent(sortStr);
		if (weightingBankStr.length < 500) {
			response.addContent(`\n**Weightings:**${weightingBankStr}`);
		} else {
			response.addBankImage({
				bank: currentWeightingBank.filter(_it => CanvasModule.allItemIdsWithSprite.has(_it.id)),
				title: 'Bank Sort Weightings',
				user
			});
		}
		return response;
	}

	if (sortMethod) {
		if (!isValidBankSortMethod(sortMethod)) {
			return `That's not a valid bank sort method. Valid methods are: ${BankSortMethods.join(', ')}.`;
		}
		await user.update({
			bank_sort_method: sortMethod
		});

		return `Your bank sort method is now ${inlineCode(sortMethod)}.`;
	}

	const newBank = currentWeightingBank.clone();
	const inputStr = addWeightingBank ?? removeWeightingBank ?? '';
	const inputBank = parseBank({
		inputStr,
		noDuplicateItems: true
	});

	if (addWeightingBank) newBank.add(inputBank);
	else if (removeWeightingBank) newBank.remove(inputBank);
	else if (resetWeightingBank && resetWeightingBank === 'reset') newBank.clear();

	await user.update({
		bank_sort_weightings: newBank.toJSON()
	});

	return bankSortConfig(user, undefined, undefined, undefined, undefined);
}

async function bgColorConfig(user: MUser, hex?: string) {
	const currentColor = user.user.bank_bg_hex;

	const embed = new EmbedBuilder();

	if (hex === 'reset') {
		await user.update({
			bank_bg_hex: null
		});
		return 'Reset your bank background color.';
	}

	if (!hex) {
		if (!currentColor) {
			return 'You have no background color set.';
		}
		return {
			embeds: [
				embed
					.setColor(hexToDecimal(currentColor))
					.setDescription(`Your current background color is \`${currentColor}\`.`)
			]
		};
	}

	hex = hex.toUpperCase();
	if (!isValidHexColor(hex)) {
		return "That's not a valid hex color. It needs to be 7 characters long, starting with '#', for example: #4e42f5 - use this to pick one: <https://www.google.com/search?q=hex+color+picker>";
	}

	await user.update({
		bank_bg_hex: hex
	});

	return {
		embeds: [embed.setColor(hexToDecimal(hex)).setDescription(`Your background color is now \`${hex}\``)]
	};
}

const NAMED_HEX_PRESETS: Record<string, string> = {
	purple: '#AC7FFF',
	gold: '#FFB800',
	cyan: '#00FFFF',
	green: '#00FF80',
	red: '#FF4444',
	crimson: '#DC143C',
	pink: '#FF66CC',
	white: '#FFFFFF',
	orange: '#FF981F',
	blue: '#4E82F5',
	yellow: '#FFFF00',
	lime: '#32CD32',
	teal: '#008080',
	aqua: '#00D8FF',
	magenta: '#FF00FF',
	violet: '#8A2BE2',
	indigo: '#4B0082',
	coral: '#FF7F50',
	salmon: '#FA8072',
	silver: '#C0C0C0',
	gray: '#808080',
	black: '#000000',
	emerald: '#50C878',
	mint: '#98FF98'
};

const HEX_COLOR_ERROR_MSG =
	"That's not a valid hex color. Provide a 6-character hex code (such as #4e42f5 or 4e42f5), a preset color (e.g. gold, cyan, crimson, green, purple), or 'reset'.";

async function colorAutocomplete({ value }: StringAutoComplete) {
	const query = value?.trim().toLowerCase() ?? '';
	const options = [
		...Object.entries(NAMED_HEX_PRESETS).map(([name, hex]) => ({
			name: `${name.charAt(0).toUpperCase() + name.slice(1)} (${hex})`,
			value: name
		})),
		{ name: 'Reset to default', value: 'reset' }
	];

	const filtered = query
		? options.filter(opt => opt.name.toLowerCase().includes(query) || opt.value.includes(query))
		: options;

	if (query) {
		const candidate = (query.startsWith('#') ? query : `#${query}`).toUpperCase();
		if (isValidHexColor(candidate)) {
			return [{ name: `Custom hex (${candidate})`, value: candidate }, ...filtered].slice(0, 25);
		}
	}

	return filtered.slice(0, 25);
}

function parseHexColorInput(
	input?: string
): { type: 'empty' } | { type: 'reset' } | { type: 'valid'; hex: string } | { type: 'invalid' } {
	if (!input) return { type: 'empty' };
	const trimmed = input.trim().toLowerCase();
	if (trimmed === 'reset' || trimmed === 'default' || trimmed === 'none') {
		return { type: 'reset' };
	}
	if (NAMED_HEX_PRESETS[trimmed]) {
		return { type: 'valid', hex: NAMED_HEX_PRESETS[trimmed] };
	}
	const withHash = trimmed.startsWith('#') ? trimmed.toUpperCase() : `#${trimmed.toUpperCase()}`;
	if (!isValidHexColor(withHash)) {
		return { type: 'invalid' };
	}
	return { type: 'valid', hex: withHash };
}

async function generateOutlinePreview(hex: string) {
	await CanvasModule.ensureInit();
	const canvas = new OSRSCanvas({ width: 96, height: 64 });
	const ctx = canvas.ctx;
	ctx.fillStyle = '#393939';
	ctx.fillRect(0, 0, canvas.width, canvas.height);
	await canvas.drawItemIDSprite({
		itemID: Items.getOrThrow('Twisted bow').id,
		x: 32,
		y: 16,
		outline: { outlineColor: hex, alpha: 1 },
		quantity: 1,
		textColor: hex
	});
	return canvas.toScaledOutput(2);
}

async function uniqueOutlineColorConfig(user: MUser, hex?: string) {
	if ((await user.fetchPerkTier()) < PerkTier.Two) {
		return patronMsg(PerkTier.Two);
	}
	const parsed = parseHexColorInput(hex);
	const embed = new EmbedBuilder();
	if (parsed.type === 'empty') {
		const current = user.user.unique_outline_hex;
		if (!current) {
			return 'You have no custom unique item outline color set (default: `#AC7FFF`).';
		}
		const preview = await generateOutlinePreview(current);
		return {
			embeds: [
				embed
					.setColor(hexToDecimal(current))
					.setDescription(`Your current unique item outline color is \`${current}\`.`)
					.setImage('attachment://outline-preview.png')
			],
			files: [{ buffer: preview, name: 'outline-preview.png' }]
		};
	}
	if (parsed.type === 'reset') {
		await user.update({ unique_outline_hex: null });
		return 'Reset your unique item outline color back to default (`#AC7FFF`).';
	}
	if (parsed.type === 'invalid') {
		return HEX_COLOR_ERROR_MSG;
	}
	await user.update({ unique_outline_hex: parsed.hex });
	const preview = await generateOutlinePreview(parsed.hex);
	return {
		embeds: [
			embed
				.setColor(hexToDecimal(parsed.hex))
				.setDescription(`Your unique item outline color is now \`${parsed.hex}\`.`)
				.setImage('attachment://outline-preview.png')
		],
		files: [{ buffer: preview, name: 'outline-preview.png' }]
	};
}

async function bankTitleColorConfig(user: MUser, hex?: string) {
	if ((await user.fetchPerkTier()) < PerkTier.Three) {
		return patronMsg(PerkTier.Three);
	}
	const parsed = parseHexColorInput(hex);
	const embed = new EmbedBuilder();
	if (parsed.type === 'empty') {
		const current = user.user.bank_title_hex;
		if (!current) {
			return 'You have no custom bank title color set (default OSRS orange).';
		}
		return {
			embeds: [
				embed.setColor(hexToDecimal(current)).setDescription(`Your current bank title color is \`${current}\`.`)
			]
		};
	}
	if (parsed.type === 'reset') {
		await user.update({ bank_title_hex: null });
		return 'Reset your bank title color back to default.';
	}
	if (parsed.type === 'invalid') {
		return HEX_COLOR_ERROR_MSG;
	}
	await user.update({ bank_title_hex: parsed.hex });
	return {
		embeds: [
			embed.setColor(hexToDecimal(parsed.hex)).setDescription(`Your bank title color is now \`${parsed.hex}\`.`)
		]
	};
}

async function defaultBankFlagConfig(user: MUser, flag?: string) {
	if ((await user.fetchPerkTier()) < PerkTier.Three) {
		return patronMsg(PerkTier.Three);
	}
	if (!flag) {
		return user.user.default_bank_flag
			? `Your current default \`/bank\` flag is \`${user.user.default_bank_flag}\`.`
			: 'You have no default `/bank` flag set.';
	}
	if (flag === 'none') {
		await user.update({ default_bank_flag: null });
		return 'Cleared your default `/bank` flag.';
	}
	if (!bankFlags.includes(flag as (typeof bankFlags)[number])) {
		return 'Invalid bank flag.';
	}
	await user.update({ default_bank_flag: flag });
	return `Your default \`/bank\` flag is now \`${flag}\`.`;
}

async function handleChannelEnable(
	guildSettings: IGuild,
	guildId: string,
	channelId: string,
	choice: 'enable' | 'disable'
) {
	const isDisabled = guildSettings.staff_only_channels.includes(channelId);

	if (choice === 'disable') {
		if (isDisabled) return 'This channel is already disabled.';

		await Cache.updateGuild(guildId, {
			staff_only_channels: [...guildSettings.staff_only_channels, channelId]
		});

		return 'Channel disabled. Staff of this server can still use commands in this channel.';
	}
	if (!isDisabled) return 'This channel is already enabled.';

	await Cache.updateGuild(guildId, {
		staff_only_channels: guildSettings.staff_only_channels.filter(i => i !== channelId)
	});

	return 'Channel enabled. Anyone can use commands in this channel now.';
}

async function handlePetMessagesEnable(
	guildSettings: IGuild,
	guildId: string,
	channelId: string,
	choice: 'enable' | 'disable'
) {
	if (choice === 'enable') {
		if (guildSettings.petchannel) {
			return 'Pet Messages are already enabled in this guild.';
		}
		await Cache.updateGuild(guildId, {
			petchannel: channelId
		});
		return 'Enabled Pet Messages in this guild.';
	}
	if (guildSettings.petchannel === null) {
		return "Pet Messages aren't enabled, so you can't disable them.";
	}
	await Cache.updateGuild(guildId, {
		petchannel: null
	});
	return 'Disabled Pet Messages in this guild.';
}

async function handleCommandEnable(
	guildSettings: IGuild,
	guildId: string,
	commandName: string,
	choice: 'enable' | 'disable'
) {
	const command = globalClient.allCommands.find(i => i.name.toLowerCase() === commandName.toLowerCase());
	if (!command) return "That's not a valid command.";

	if (choice === 'enable') {
		if (!guildSettings.disabled_commands.includes(commandName)) {
			return "That command isn't disabled.";
		}
		await Cache.updateGuild(guildId, {
			disabled_commands: guildSettings.disabled_commands.filter(i => i !== command.name)
		});

		return `Successfully enabled the \`${commandName}\` command.`;
	}

	if (guildSettings.disabled_commands.includes(command.name)) {
		return 'That command is already disabled.';
	}
	await Cache.updateGuild(guildId, {
		disabled_commands: [...guildSettings.disabled_commands, command.name]
	});

	return `Successfully disabled the \`${command.name}\` command.`;
}

async function handleCombatOptions(user: MUser, command: 'add' | 'remove' | 'list' | 'help', option?: string) {
	if (!command || (command && command === 'list')) {
		// List enabled combat options:
		const cbOpts = user.user.combat_options.map(o => CombatOptionsArray.find(coa => coa?.id === o)?.name);
		return `Your current combat options are:\n${cbOpts.join('\n')}\n\nTry: \`/config user combat_options help\``;
	}

	if (command === 'help' || !option || !['add', 'remove'].includes(command)) {
		return `Changes your Combat Options. Usage: \`/config user combat_options [add/remove/list] always cannon\`\n\nList of possible options:\n${CombatOptionsArray.map(
			coa => `**${coa?.name}**: ${coa?.desc}`
		).join('\n')}`;
	}

	const newcbopt = CombatOptionsArray.find(
		item => stringMatches(option, item.name) || item.aliases?.some(alias => stringMatches(alias, option))
	);
	if (!newcbopt) return 'Cannot find matching option. Try: `/config user combat_options help`';

	const currentStatus = user.user.combat_options.includes(newcbopt.id);

	const nextBool = command !== 'remove';

	if (currentStatus === nextBool) {
		return `"${newcbopt.name}" is already ${currentStatus ? 'enabled' : 'disabled'} for you.`;
	}

	let combatOptions = [...user.user.combat_options];
	// If enabling Ice Barrage, make sure burst isn't also enabled:
	if (
		nextBool &&
		newcbopt.id === ECombatOption.AlwaysIceBarrage &&
		combatOptions.includes(ECombatOption.AlwaysIceBurst)
	) {
		combatOptions = removeFromArr(combatOptions, ECombatOption.AlwaysIceBurst);
	}
	// If enabling Ice Burst, make sure barrage isn't also enabled:
	if (
		nextBool &&
		newcbopt.id === ECombatOption.AlwaysIceBurst &&
		combatOptions.includes(ECombatOption.AlwaysIceBarrage)
	) {
		combatOptions = removeFromArr(combatOptions, ECombatOption.AlwaysIceBarrage);
	}
	if (nextBool && !combatOptions.includes(newcbopt.id)) {
		await user.update({
			combat_options: [...combatOptions, newcbopt.id]
		});
	} else if (!nextBool && combatOptions.includes(newcbopt.id)) {
		await user.update({
			combat_options: removeFromArr(combatOptions, newcbopt.id)
		});
	} else {
		return 'Error processing command. This should never happen, please report bug.';
	}

	return `${newcbopt.name} is now ${nextBool ? 'enabled' : 'disabled'} for you.`;
}

async function handleRSN(user: MUser, newRSN: string) {
	const { RSN } = user.user;
	if (!newRSN && RSN) {
		return `Your current RSN is: \`${RSN}\``;
	}

	if (!newRSN && !RSN) {
		return "You don't have an RSN set. You can set one like this: `/config user set_rsn <username>`";
	}

	newRSN = newRSN.toLowerCase();
	if (!newRSN.match('^[A-Za-z0-9]{1}[A-Za-z0-9 -_\u00A0]{0,11}$')) {
		return 'That username is not valid.';
	}

	if (RSN === newRSN) {
		return `Your RSN is already set to \`${RSN}\``;
	}

	await user.update({
		RSN: newRSN
	});
	if (RSN !== null) {
		return `Changed your RSN from \`${RSN}\` to \`${newRSN}\``;
	}
	return `Your RSN has been set to: \`${newRSN}\`.`;
}

function pinnedTripLimit(perkTier: number) {
	if (perkTier >= PerkTier.Eight) return 12;
	if (perkTier === PerkTier.Seven) return 10;
	if (perkTier === PerkTier.Six) return 8;
	if (perkTier === PerkTier.Five) return 6;
	if (perkTier === PerkTier.Four) return 4;
	if (perkTier === PerkTier.Three) return 3;
	if (perkTier === PerkTier.Two) return 2;
	return 1;
}
export async function pinTripCommand(user: MUser, tripId: string | undefined, customName: string | undefined) {
	if (!tripId) return 'Invalid trip.';
	const id = Number(tripId);
	if (!id || Number.isNaN(id)) return 'Invalid trip.';
	const trip = await prisma.activity.findFirst({ where: { id, user_id: BigInt(user.id) } });
	if (!trip) return 'Invalid trip.';

	if (customName && (!isValidNickname(customName) || customName.length >= 32)) {
		return 'Invalid custom name.';
	}

	const limit = pinnedTripLimit(await user.fetchPerkTier());
	const currentPinnedTripsCount = await prisma.pinnedTrip.count({ where: { user_id: user.id } });
	if (currentPinnedTripsCount >= limit) {
		return `You cannot have more than ${limit}x pinned trips, unpin one first. Your limit is ${limit}, you can get up to 4 by being a patron.`;
	}

	await prisma.pinnedTrip.create({
		data: {
			id: miniID(7),
			emoji_id: null,
			custom_name: customName,
			activity: {
				connect: {
					id: trip.id
				}
			},
			user: {
				connect: {
					id: user.id
				}
			},
			activity_type: trip.type,
			data: trip.data as object
		}
	});

	return `You pinned a ${trip.type} trip. You can now see it in your buttons.`;
}

async function unpinTripCommand(user: MUser, tripId: string | undefined) {
	const trip = await prisma.pinnedTrip.findFirst({ where: { id: tripId, user_id: user.id } });
	if (!trip) return 'Invalid trip.';
	await prisma.pinnedTrip.delete({ where: { id: trip.id } });
	return `You unpinned a ${trip.activity_type} trip.`;
}

export const configCommand = defineCommand({
	name: 'config',
	description: 'Commands configuring settings and options.',
	options: [
		{
			type: 'SubcommandGroup',
			name: 'server',
			description: 'Change settings for your server.',
			options: [
				{
					type: 'Subcommand',
					name: 'channel',
					description: 'Enable or disable commands in this channel.',
					options: [
						{
							type: 'String',
							name: 'choice',
							description: 'Enable or disable commands for this channel.',
							required: true,
							choices: [
								{ name: 'Enable', value: 'enable' },
								{ name: 'Disable', value: 'disable' }
							]
						}
					]
				},
				{
					type: 'Subcommand',
					name: 'pet_messages',
					description: 'Enable or disable Pet Messages in this server.',
					options: [
						{
							type: 'String',
							name: 'choice',
							description: 'Enable or disable Pet Messages for this server.',
							required: true,
							choices: [
								{ name: 'Enable', value: 'enable' },
								{ name: 'Disable', value: 'disable' }
							]
						}
					]
				},
				{
					type: 'Subcommand',
					name: 'command',
					description: 'Enable or disable a command in your server.',
					options: [
						{
							type: 'String',
							name: 'command',
							description: 'The command you want to enable/disable.',
							required: true,
							autocomplete: async ({ value }: StringAutoComplete) => {
								return globalClient.allCommands
									.map(i => ({ name: i.name, value: i.name }))
									.filter(i => (!value ? true : i.name.toLowerCase().includes(value.toLowerCase())));
							}
						},
						{
							type: 'String',
							name: 'choice',
							description: 'Whether you want to enable or disable this command.',
							required: true,
							choices: [
								{ name: 'Enable', value: 'enable' },
								{ name: 'Disable', value: 'disable' }
							]
						}
					]
				}
			]
		},
		{
			type: 'SubcommandGroup',
			name: 'user',
			description: 'Change settings for your account.',
			options: [
				{
					type: 'Subcommand',
					name: 'toggle',
					description: 'Toggle different settings on and off.',
					options: [
						{
							type: 'String',
							name: 'name',
							description: 'The setting you want to toggle on/off.',
							required: true,
							autocomplete: async ({ value, user }: StringAutoComplete) => {
								const bitfield = user.bitfield;
								return userBitToggles
									.filter(i => {
										if ((!i.userConfigurable || i.protected) && !user.isAdmin()) return false;
										if (!value) return true;
										return cleanString(i.name).includes(cleanString(value));
									})
									.map(i => ({
										name: `${i.name} (Currently ${bitfield.includes(i.bit) ? 'On' : 'Off'})`,
										value: i.name
									}));
							}
						}
					]
				},
				{
					type: 'Subcommand',
					name: 'combat_options',
					description: 'Change combat options.',
					options: [
						{
							type: 'String',
							name: 'action',
							description: 'The action you want to perform.',
							required: true,
							choices: [
								{ name: 'Add', value: 'add' },
								{ name: 'Remove', value: 'remove' },
								{ name: 'List', value: 'list' },
								{ name: 'Help', value: 'help' }
							]
						},
						{
							type: 'String',
							name: 'input',
							description: 'The option you want to add/remove.',
							required: false,
							autocomplete: async ({ value }: StringAutoComplete) => {
								return CombatOptionsArray.filter(i =>
									!value ? true : i.name.toLowerCase().includes(value.toLowerCase())
								).map(i => ({ name: i.name, value: i.name }));
							}
						}
					]
				},
				{
					type: 'Subcommand',
					name: 'set_rsn',
					description: 'Set your RuneScape username in the bot.',
					options: [
						{
							type: 'String',
							name: 'username',
							description: 'Your RuneScape username.',
							required: true
						}
					]
				},
				{
					type: 'Subcommand',
					name: 'bg_color',
					description: 'Set a custom color for transparent bank backgrounds.',
					options: [
						{
							type: 'String',
							name: 'color',
							description: 'The color in hex format.',
							required: false
						}
					]
				},
				{
					type: 'Subcommand',
					name: 'unique_outline_color',
					description: 'Set a custom hex color for new Collection Log item outlines.',
					options: [
						{
							type: 'String',
							name: 'color',
							description: 'Pick a preset color, enter any 6-char hex code (e.g. #4e42f5), or type reset.',
							required: false,
							autocomplete: colorAutocomplete
						}
					]
				},
				{
					type: 'Subcommand',
					name: 'bank_title_color',
					description: 'Set a custom hex color for your /bank title text.',
					options: [
						{
							type: 'String',
							name: 'color',
							description: 'Pick a preset color, enter any 6-char hex code (e.g. #4e42f5), or type reset.',
							required: false,
							autocomplete: colorAutocomplete
						}
					]
				},
				{
					type: 'Subcommand',
					name: 'default_bank_flag',
					description: 'Set a default flag applied to /bank.',
					options: [
						{
							type: 'String',
							name: 'flag',
							description: 'The bank flag to apply by default, or none to clear.',
							required: false,
							choices: ['none', ...bankFlags].map(f => ({ name: f, value: f }))
						}
					]
				},
				{
					type: 'Subcommand',
					name: 'bank_sort',
					description: 'Change the way your bank is sorted.',
					options: [
						{
							type: 'String',
							name: 'sort_method',
							description: 'The way items in your bank should be sorted.',
							required: false,
							choices: choicesOf(BankSortMethods)
						},
						{
							type: 'String',
							name: 'add_weightings',
							description: "Add custom weightings for extra bank sorting (e.g. '1 trout, 5 coal')",
							required: false
						},
						{
							type: 'String',
							name: 'remove_weightings',
							description: "Remove weightings for extra bank sorting (e.g. '1 trout, 5 coal')",
							required: false
						},
						{
							type: 'String',
							name: 'reset_weightings',
							description: "Type 'reset' to confirm you want to delete ALL of your bank weightings.",
							required: false
						}
					]
				},
				{
					type: 'Subcommand',
					name: 'favorite_alchs',
					description: 'Manage your favorite alchables.',
					options: [
						{
							...itemOption(item => item.highalch !== undefined && item.highalch > 10),
							name: 'add',
							description: 'Add an item to your favorite alchables.',
							required: false
						},
						{
							...itemOption(item => item.highalch !== undefined && item.highalch > 10),
							name: 'remove',
							description: 'Remove an item from your favorite alchables.',
							required: false
						},
						{
							type: 'String',
							name: 'add_many',
							description: 'Add many to your favorite alchables at once.',
							required: false
						},
						{
							type: 'Boolean',
							name: 'reset',
							description: 'Reset all of your favorite alchs',
							required: false
						}
					]
				},
				{
					type: 'Subcommand',
					name: 'favorite_bh_seeds',
					description: 'Manage your favorite birdhouse seeds.',
					options: [
						{
							type: 'String',
							name: 'add',
							description: 'Add an item to your favorite birdhouse seeds.',
							required: false,
							autocomplete: async ({ value }: StringAutoComplete) => {
								return birdhouseSeeds
									.filter(i => (!value ? true : stringMatches(i.item.name, value)))
									.map(i => ({
										name: `${i.item.name}`,
										value: i.item.id.toString()
									}));
							}
						},
						{
							type: 'String',
							name: 'remove',
							description: 'Remove an item from your favorite birdhouse seeds.',
							required: false,
							autocomplete: async ({ value, user }: StringAutoComplete) => {
								return birdhouseSeeds
									.filter(i => {
										if (!user.user.favorite_bh_seeds.includes(i.item.id)) return false;
										return !value ? true : stringMatches(i.item.name, value);
									})
									.map(i => ({
										name: `${i.item.name}`,
										value: i.item.id.toString()
									}));
							}
						},
						{
							type: 'Boolean',
							name: 'reset',
							description: 'Reset all of your favorite birdhouse seeds.',
							required: false
						}
					]
				},
				{
					type: 'Subcommand',
					name: 'favorite_food',
					description: 'Manage your favorite food.',
					options: [
						{
							type: 'String',
							name: 'add',
							description: 'Add an item to your favorite food.',
							required: false,
							autocomplete: async ({ value }: StringAutoComplete) => {
								return Eatables.filter(
									i => !value || i.name.toLowerCase().includes(value.toLowerCase())
								).map(i => ({
									name: `${i.name}`,
									value: i.id.toString()
								}));
							}
						},
						{
							type: 'String',
							name: 'remove',
							description: 'Remove an item from your favorite food.',
							required: false,
							autocomplete: async ({ value, user }: StringAutoComplete) => {
								return Eatables.filter(i => {
									if (!user.user.favorite_food.includes(i.id)) return false;
									return !value ? true : i.name.toLowerCase().includes(value.toLowerCase());
								}).map(i => ({
									name: `${i.name}`,
									value: i.id.toString()
								}));
							}
						},
						{
							type: 'Boolean',
							name: 'reset',
							description: 'Reset all of your favorite foods',
							required: false
						}
					]
				},
				{
					type: 'Subcommand',
					name: 'favorite_items',
					description: 'Manage your favorite items.',
					options: [
						{
							...itemOption(),
							name: 'add',
							description: 'Add an item to your favorite items.',
							required: false
						},
						{
							...itemOption(),
							name: 'remove',
							description: 'Remove an item from your favorite items.',
							required: false
						},
						{
							type: 'String',
							name: 'add_many',
							description: 'Add many items to your favorite items at once.',
							required: false
						},
						{
							type: 'Boolean',
							name: 'reset',
							description: 'Reset all of your favorite items',
							required: false
						}
					]
				},
				{
					type: 'Subcommand',
					name: 'slayer',
					description: 'Manage your Slayer options',
					options: [
						{
							type: 'String',
							name: 'master',
							description: 'Choose default slayer master',
							required: false,
							choices: slayerMasterChoices
						},
						{
							type: 'String',
							name: 'autoslay',
							description: 'Set default autoslay mode',
							required: false,
							choices: autoslayChoices
						}
					]
				},
				{
					type: 'Subcommand',
					name: 'pin_trip',
					description: 'Pin a trip so you can easily repeat it whenever you want.',
					options: [
						{
							type: 'String',
							name: 'trip',
							description: 'The trip you want to pin.',
							required: false,
							autocomplete: async ({ user }: StringAutoComplete) => {
								const res = await prisma.$queryRawUnsafe<
									{ type: activity_type_enum; data: object; id: number; finish_date: string }[]
								>(`
SELECT DISTINCT ON (activity.type) activity.type, activity.data, activity.id, activity.finish_date
FROM activity
WHERE finish_date > now() - INTERVAL '14 days'
AND user_id = '${user.id}'::bigint
ORDER BY activity.type, finish_date DESC
LIMIT 20;
;`);
								return res.map(i => ({
									name: `${i.type} (Finished ${formatDuration(
										Date.now() - new Date(i.finish_date).getTime()
									)} ago)`,
									value: i.id.toString()
								}));
							}
						},
						{
							type: 'String',
							required: false,
							name: 'custom_name',
							description: 'Custom name for the button (optional).'
						},
						{
							type: 'String',
							name: 'unpin_trip',
							description: 'The trip you want to unpin.',
							required: false,
							autocomplete: async ({ user }: StringAutoComplete) => {
								const res = await prisma.pinnedTrip.findMany({ where: { user_id: user.id } });
								return res.map(i => ({
									name: `${i.activity_type}${i.custom_name ? `- ${i.custom_name}` : ''}`,
									value: i.id.toString()
								}));
							}
						}
					]
				},
				{
					type: 'Subcommand',
					name: 'icon_pack',
					description: 'Change your icon pack',
					options: [
						{
							type: 'String',
							name: 'name',
							description: 'The icon pack you want to use.',
							required: true,
							choices: ['Default', ...Object.values(ItemIconPacks).map(i => i.name)].map(i => ({
								name: i,
								value: i
							}))
						}
					]
				}
			]
		}
	],
	run: async ({ options, user, userId, guildId, channelId, interaction }) => {
		if (options.server) {
			if (!guildId) return 'This command can only be run in servers.';
			const member = await globalClient.fetchMember({ guildId, userId });
			const hasPerms = await globalClient.memberHasPermissions(member, ['BAN_MEMBERS']);
			if (!hasPerms) {
				return "You need to have 'Ban Member' permissions to change settings for this server.";
			}
			const guildSettings = await Cache.getGuild(guildId);

			if (options.server.channel) {
				return handleChannelEnable(guildSettings, guildId, channelId, options.server.channel.choice);
			}
			if (options.server.pet_messages) {
				return handlePetMessagesEnable(guildSettings, guildId, channelId, options.server.pet_messages.choice);
			}
			if (options.server.command) {
				return handleCommandEnable(
					guildSettings,
					guildId,
					options.server.command.command,
					options.server.command.choice
				);
			}
		}
		if (options.user) {
			const {
				toggle,
				combat_options,
				set_rsn,
				bg_color,
				bank_sort,
				favorite_alchs,
				favorite_food,
				favorite_items,
				favorite_bh_seeds,
				slayer,
				pin_trip,
				icon_pack,
				unique_outline_color,
				bank_title_color,
				default_bank_flag
			} = options.user;
			if (icon_pack) {
				if (icon_pack.name) {
					if (icon_pack.name === 'Default') {
						if (user.user.icon_pack_id) {
							await user.update({
								icon_pack_id: null
							});
							return 'Your icon pack is now set to default.';
						}
						return 'Your icon pack is already set to default.';
					}

					const pack = Object.values(ItemIconPacks).find(i => i.name === icon_pack.name);
					if (!pack) return 'Invalid icon pack.';

					if (!user.user.store_bitfield.includes(pack.storeBitfield)) {
						return 'You do not own this icon pack.';
					}
					await user.update({
						icon_pack_id: pack.id
					});
					return `Your icon pack is now set to ${bold(pack.name)}.`;
				}
			}

			if (toggle) {
				return handleToggle(user, toggle.name, interaction);
			}
			if (combat_options) {
				return handleCombatOptions(user, combat_options.action, combat_options.input);
			}
			if (set_rsn) {
				return handleRSN(user, set_rsn.username);
			}
			if (bg_color) {
				return bgColorConfig(user, bg_color.color);
			}
			if (unique_outline_color) {
				return uniqueOutlineColorConfig(user, unique_outline_color.color);
			}
			if (bank_title_color) {
				return bankTitleColorConfig(user, bank_title_color.color);
			}
			if (default_bank_flag) {
				return defaultBankFlagConfig(user, default_bank_flag.flag);
			}
			if (bank_sort) {
				return bankSortConfig(
					user,
					bank_sort.sort_method,
					bank_sort.add_weightings,
					bank_sort.remove_weightings,
					bank_sort.reset_weightings
				);
			}
			if (favorite_alchs) {
				return favAlchConfig(
					user,
					favorite_alchs.add,
					favorite_alchs.remove,
					favorite_alchs.add_many,
					Boolean(favorite_alchs.reset)
				);
			}
			if (favorite_food) {
				return favFoodConfig(user, favorite_food.add, favorite_food.remove, Boolean(favorite_food.reset));
			}
			if (favorite_items) {
				return favItemConfig(
					user,
					favorite_items.add,
					favorite_items.remove,
					favorite_items.add_many,
					Boolean(favorite_items.reset)
				);
			}
			if (favorite_bh_seeds) {
				return favBhSeedsConfig(
					user,
					favorite_bh_seeds.add,
					favorite_bh_seeds.remove,
					Boolean(favorite_bh_seeds.reset)
				);
			}
			if (slayer) {
				if (slayer.autoslay) {
					const { message } = await setDefaultAutoslay(user, slayer.autoslay);
					return message;
				}
				if (slayer.master) {
					const { message } = await setDefaultSlayerMaster(user, slayer.master);
					return message;
				}
			}
			if (pin_trip) {
				if (pin_trip.trip) {
					return pinTripCommand(user, pin_trip.trip, pin_trip.custom_name);
				}
				if (pin_trip.unpin_trip) {
					return unpinTripCommand(user, pin_trip.unpin_trip);
				}
				return 'You need to provide a trip to pin or unpin.';
			}
		}
		return 'Invalid command.';
	}
});
