import createPromise from "@/assets/common/createPromise";
import fetchJSON from "@/assets/common/fetchJSON";
import pause from "@/assets/common/pause";
import linodeStatus from "@/assets/linode/linodeStatus";
import linodeWaitReady from "@/assets/linode/linodeWaitReady";
import moment from "moment-timezone";

export default function linodeResize(secretKey, linodeId, plan) {
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

	// Overall promise
	const completionPromise = createPromise();

	// Task promise: Migration queued
	const queuePromise = createPromise();
	completionPromise.queue = queuePromise.promise;

	// Task promise: Migration started
	const migrationPromise = createPromise();
	completionPromise.migration = migrationPromise.promise;

	// Task promise: Migration finished
	const resizePromise = createPromise();
	completionPromise.resize = resizePromise.promise;

	const performResize = async () => {
		let linodeReturnStatus = null;

		// Wait if Linode is busy
		const linodeReadyPromise = linodeWaitReady(secretKey, linodeId)
			.then((res) => {
				linodeReturnStatus = res;
			})
			.catch((error) => {
				queuePromise.reject(error);
				migrationPromise.reject(error);
				resizePromise.reject(error);
				completionPromise.reject(error);
				throw error;
			});

		console.log(`SECTION Pre Check`);
		await linodeReadyPromise;

		// Check plan
		if (linodeReturnStatus.type === plan) {
			// Already done!

			console.log(
				`linodeResize(`,
				linodeId,
				`) ::`,
				`${linodeReturnStatus.status}, Nothing to do! <3`,
			);

			console.log(`
			queuePromise.resolve();
			migrationPromise.resolve();
			resizePromise.resolve();
			completionPromise.resolve(linodeReturnStatus);
			`);
			queuePromise.resolve();
			migrationPromise.resolve();
			resizePromise.resolve();
			completionPromise.resolve(linodeReturnStatus);
			return;
		}

		console.log(`SECTION 1 Start`);

		// Do migration

		const beginResizePromise = fetchJSON(
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
		)
			.then((reply) => {
				if (!reply.ok) {
					console.log(
						`linodeResize(`,
						linodeId,
						`) ::`,
						reply.json?.errors,
					);

					const json = reply.json.errors[0];
					const error = new Error(json.reason);
					error.json = json;
					throw error;
				}

				console.log(`
				queuePromise.resolve();
				`);
				queuePromise.resolve();
			})
			.catch((error) => {
				queuePromise.reject(error);
				migrationPromise.reject(error);
				resizePromise.reject(error);
				completionPromise.reject(error);
				throw error;
			});

		console.log(`SECTION 1 End`);
		await beginResizePromise;
		console.log(`SECTION 2 Start`);

		// Wait until resizing starts (up to 10 minute queue)
		try {
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

			console.log(`
			migrationPromise.resolve();
			`);
			migrationPromise.resolve();
		} catch (error) {
			migrationPromise.reject(error);
			resizePromise.reject(error);
			completionPromise.reject(error);
		}

		console.log(`SECTION 2 End. Begin wait loop`);

		try {
			// Wait until resizing is done
			linodeReturnStatus = await linodeWaitReady(secretKey, linodeId);
			console.log(
				`linodeStatus(${linodeId}) :: Linode ready. ${linodeReturnStatus.status}`,
			);
			console.log(linodeReturnStatus);
			console.log(`linodeResize(`, linodeId, `) ::`, `Finished`);

			console.log(`
			resizePromise.resolve();
			completionPromise.resolve(linodeReturnStatus);
			`);
			resizePromise.resolve();
			completionPromise.resolve(linodeReturnStatus);
		} catch (error) {
			resizePromise.reject(error);
			completionPromise.reject(error);
		}

		console.log(`SECTION Done!`);
	};

	performResize();
	return completionPromise;
}
