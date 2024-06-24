import commandsBroadcastHere from "@/assets/discord/commands/commandsBroadcastHere";
import commandsInviteURL from "@/assets/discord/commands/commandsInviteURL";
import commandsOpenAi from "@/assets/discord/commands/commandsOpenAi";
import commandsToAudio from "@/assets/discord/commands/commandsToAudio";

const commands = [
	// Commands
	...commandsBroadcastHere,
	...commandsInviteURL,
	...commandsOpenAi,
	// ...commandsRhymeJail,
	...commandsToAudio,
];

export default commands;
