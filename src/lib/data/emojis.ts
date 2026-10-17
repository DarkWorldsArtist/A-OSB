import { globalConfig } from '@/lib/constants.js';

export const skillEmoji = {
	runecraft: '<:runecraft:1560872697632919572>',
	firemaking: '<:firemaking:1560872488445939804>',
	thieving: '<:thieving:1560872792239513611>',
	mining: '<:mining:1560872602493390950>',
	ranged: '<:ranged:1560872667400118344>',
	construction: '<:construction:1560872230869794819>',
	smithing: '<:smithing:1560872750166577302>',
	herblore: '<:herblore:1560872542837674106>',
	attack: '<:attack:1560873192640487494>',
	strength: '<:strength:1560872783012040754>',
	defence: '<:defence:1560872441868189806>',
	fishing: '<:fishing:1560872498625777795>',
	hitpoints: '<:hitpoints:1560872547178913833>',
	total: '<:xp:1560872809322905683>',
	overall: '<:xp:1560872809322905683>',
	magic: '<:magic:1560872598571581560>',
	crafting: '<:crafting:1560872437829337189>',
	agility: '<:agility:630911040355565568>',
	fletching: '<:fletching:1560872508104638465>',
	cooking: '<:cooking:1560872423442616380>',
	farming: '<:farming:1560872483459170425>',
	slayer: '<:slayer:1560872731803787307>',
	prayer: '<:prayer:1560872640795902062>',
	woodcutting: '<:woodcutting:1560872813236191333>',
	hunter: '<:hunter:1560872556041478194>',
	cml: '<:CrystalMathLabs:1560873110171811890>',
	clock: '<:ehpclock:1560874278193201202>',
	combat: '<:combat:1560873221891563542>'
};

export const EmojiId = {
	ClueScroll: '1560873105931374763',
	Farming: '1560872483459170425',
	Casket: '1560873097400160386',
	Seedpack: '1560872942500323430',
	Slayer: '1560872731803787307',
	MoneyBag: '1560873137762074805',
	BirdsNest: '1560872903610728509',
	Leagues: '1560873034573680651',
	Gear: '1560872517097488424',
	Minion: '1560872610794053773',
	MysteryBox: '1560872619081998437',
	Bank: '1560873201092001823'
};

export const ReactEmoji = globalConfig.isProduction
	? {
			Happy: 'RSHappy:1560874439707729990',
			Sad: 'RSSad:1560874448544858122',
			Gift: '🎁'
		}
	: {
			Happy: '😃',
			Sad: '😞',
			Gift: '🎁'
		};

export const miscEmojis = {
	barrowsChests: '<:Dharoks_helm:1560873703464640572>',
	hespori: '<:Bottomless_compost_bucket:1560873484740075530>',
	bryophyta: '<:Bryophytas_essence:1560873912496033832>',
	crazyArchaeologist: '<:Fedora:1560873961812660244>',
	derangedArchaeologist: '<:Fedora:1560873961812660244>',
	mimic: '<:Casket:1560873097400160386>',
	obor: '<:Hill_giant_club:1560873363159785515>'
} as const;
