import { SUPPORT_PROJECT_MSG } from '@/lib/constants.js';
import { mahojiInformationalButtons } from '@/lib/sharedComponents.js';
import { fetchUserStats } from '@/lib/util/fetchUserStats.js';

export async function minionBuyCommand(user: MUser, ironman: boolean): CommandResponse {
	if (user.hasMinion) return 'You already have a minion!';

	await user.update({
		minion_hasBought: true,
		minion_bought_date: new Date(),
		minion_ironman: Boolean(ironman)
	});

	// Ensure user has a userStats row
	await fetchUserStats(user.id);

	return {
		content: `You have successfully got yourself a minion, and you're ready to use the bot now! Please check out the links below for information you should read.

<:ironman:1560872573145710613> You can make your new minion an Ironman by using the command: \`/minion ironman\`.

🧑‍⚖️ **Rules:** You must follow the server's simple rules, breaking any rule can result in a permanent ban - and "I didn't know the rules" is not a valid excuse, read them here: <#1529773213922627584>

<:patreonLogo:1560872627629985992> **Patreon:** ${SUPPORT_PROJECT_MSG} ❤️

Please click the buttons below for important links.`,
		components: mahojiInformationalButtons
	};
}
