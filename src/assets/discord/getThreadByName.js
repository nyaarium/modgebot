import getChannel from "@/assets/discord/getChannel";

export default async function getThreadByName(
	client,
	guildId,
	channelName,
	threadName,
) {
	const forums = await getChannel(client, guildId, channelName);
	const resThreads = await forums.threads.fetch();
	const threads = resThreads.threads;
	const thread = threads.find((thread) => thread.name === threadName);
	return thread;
}
