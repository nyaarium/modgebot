export default async function getChannel(client, guildId, channelId) {
	const guild = await client.guilds.fetch(guildId);
	const channels = await guild.channels.fetch();

	const channel = channels.find(
		(channel) => channel.id == channelId || channel.name == channelId,
	);

	return channel;
}
