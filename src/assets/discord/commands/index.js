import commandsBroadcastHere from "@/assets/discord/commands/commandsBroadcastHere";
import commandsOpenAi from "@/assets/discord/commands/commandsOpenAi";
import commandsToAudio from "@/assets/discord/commands/commandsToAudio";

const commands = [
	// Commands
	...commandsBroadcastHere,
	...commandsOpenAi,
	// ...commandsRhymeJail,
	...commandsToAudio,
];

export default commands;
