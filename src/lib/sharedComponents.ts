import { ButtonBuilder, ButtonStyle, ComponentType } from '@oldschoolgg/discord';

const buttonSource = [
	{
		label: 'Wiki',
		emoji: '1560873226731651143',
		url: 'https://wiki.oldschool.gg/'
	},
	{
		label: 'Patreon',
		emoji: '1560872627629985992',
		url: 'https://www.patreon.com/cw/WizardAlabastor'
	},
	{
		label: 'Support Server',
		emoji: '1560872610794053773',
		url: 'https://www.discord.gg/ob'
	},
	{
		label: 'Bot Invite',
		emoji: '1560872610794053773',
		url: 'http://www.oldschool.gg/invite/osb'
	}
];

export const informationalButtons: ButtonBuilder[] = buttonSource.map(i =>
	new ButtonBuilder().setLabel(i.label).setEmoji({ id: i.emoji }).setURL(i.url).setStyle(ButtonStyle.Link)
);
export const mahojiInformationalButtons = buttonSource.map(
	i =>
		new ButtonBuilder({
			type: ComponentType.Button,
			label: i.label,
			emoji: { id: i.emoji },
			style: ButtonStyle.Link,
			url: i.url
		})
);

export const minionBuyButton = new ButtonBuilder()
	.setCustomId('BUY_MINION')
	.setLabel('Buy Minion')
	.setStyle(ButtonStyle.Success);
