import { fetchJson } from "@/assets/common/fetchJson";
import pause from "@/assets/common/pause";
import linodeStatus from "@/assets/linode/linodeStatus";
import linodeWaitReady from "@/assets/linode/linodeWaitReady";
import moment from "moment-timezone";

export default async function linodeResize(secretKey, linodeId, plan) {
	if (!secretKey) {
		throw new Error(
			`linodeResize(secretKey, linodeId) :: Expected an access key`,
		);
	}
	if (!linodeId) {
		throw new Error(
			`linodeResize(secretKey, linodeId, plan) :: Expected a linode ID`,
		);
	}
	if (!plan) {
		throw new Error(
			`linodeResize(secretKey, linodeId, plan) :: Expected a new plan`,
		);
	}

	console.log(`SECTION 1 - Try migration`);

	let retryMigrationCount = 5;
	while (1) {
		try {
			console.log(`Checking status`);

			// Wait if Linode is busy
			const linodeReturnStatus = await linodeWaitReady(
				secretKey,
				linodeId,
			);

			// Check plan
			if (linodeReturnStatus.type === plan) {
				// Already done!

				console.log(
					`linodeResize(`,
					linodeId,
					`) ::`,
					`${linodeReturnStatus.status}, Nothing to do! <3`,
				);

				return;
			}

			console.log(`Start migration`);

			// Try starting migration
			await fetchJson(
				`https://api.linode.com/v4/linode/instances/${linodeId}/resize`,
				{
					type: plan,
					allow_auto_disk_resize: false,
				},
				{
					headers: {
						Authorization: `Bearer ${secretKey}`,
					},
				},
			);

			break;
		} catch (error) {
			const reason = error.json?.errors?.[0]?.reason;
			if (reason && /Linode busy/.test(reason)) {
				if (0 < retryMigrationCount) {
					console.log(
						`${reason} Retrying ${retryMigrationCount} more times.`,
					);

					retryMigrationCount--;
					await pause(5000);
				} else {
					throw error;
				}
			}

			throw error;
		}
	}

	console.log(`SECTION 2 - Wait until resizing starts`);

	// Wait until resizing starts (up to 10 minute queue)
	const timeoutDate = moment().add(10, "minutes");
	while (1) {
		if (moment().isBefore(timeoutDate)) {
			const linodeRes = await linodeStatus(secretKey, linodeId);
			if (linodeRes.status === "resizing") {
				break;
			} else {
				await pause(5000);
			}
		} else {
			const json = {
				reason: `Linode could not resize for some reason.`,
			};
			console.log(`linodeResize(`, linodeId, `) ::`, json.reason);
			const error = new Error(json.reason);
			error.json = json;
			throw error;
		}
	}

	console.log(`SECTION 3 - Wait until resizing is done`);

	const linodeNewStatus = await linodeWaitReady(secretKey, linodeId);
	console.log(
		`linodeStatus(${linodeId}) :: Linode ready. ${linodeNewStatus.status}`,
	);
}
