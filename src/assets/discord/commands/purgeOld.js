import pause from "@/assets/common/pause";
import getChannel from "@/assets/discord/getChannel";
import { SnowflakeUtil } from "discord.js";
import moment from "moment-timezone";

// const command = new SlashCommandBuilder()
// 	.setName(`purgeold`)
// 	.setDescription(`Purges all messages older than 3 months ago.`)
// 	.setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
// 	.addChannelOption((option) =>
// 		option
// 			.setName("channel")
// 			.setRequired(true)
// 			.setDescription("The channel to clean."),
// 	);

// export default {
// 	data: command.toJSON(),
// 	execute,
// };

export default async function purgeOld(client, config) {
	const channel = await getChannel(
		client,
		config.guildId,
		config.channelName,
	);

	console.log(`[purgeold] [${channel.name}]  Starting cleanup.`);

	const stats = {
		total: 0,
		done: false,
	};
	do {
		await purge(channel, config, stats);
	} while (!stats.done);

	if (stats.total) {
		console.log(
			`[purgeold] [${channel.name}]  Done! ${stats.total} messages have been deleted.`,
		);
	}
}

async function purge(channel, config, stats) {
	const dateBefore = moment();
	dateBefore.subtract(config.olderThan ?? { months: 3 });

	const snowflakeBefore = SnowflakeUtil.generate({
		timestamp: dateBefore.toDate(),
	});

	const res = await channel.messages.fetch({
		limit: 100,
		before: snowflakeBefore,
	});

	const messagesToDelete = [];

	res.map((message) => {
		const user = message.author; // id, tag, username

		if (
			config.protected.includes(user.id) ||
			config.protected.includes(user.tag) ||
			config.protected.includes(message.id)
		) {
			return;
		} else {
			messagesToDelete.push(message);
		}
	});

	stats.done = !messagesToDelete.length;

	if (messagesToDelete.length) {
		console.log(
			`[purgeold] [${channel.name}]  Found ${messagesToDelete.length} to delete.`,
		);
	}

	for (const message of messagesToDelete) {
		const user = message.author; // id, tag

		const content = message.content;
		const date = moment(message.createdTimestamp).format("MM/DD/YYYY");
		let summary = content.replace(/\s+/g, " ");
		if (64 < summary.length) {
			summary = `${summary.slice(0, 64 - 3)}...`;
		} else {
			summary = `${summary}`;
		}
		console.log(` * [${date}] <${user.tag}> ${summary}`);

		await message.delete();
		stats.total++;

		await pause(5250);
	}
}
