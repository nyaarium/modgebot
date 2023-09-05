const { createServer } = require("http");
const { parse } = require("url");
const next = require("next");

const dev = process.env.NODE_ENV !== "production";

const port = parseInt(process.env.PORT, 10) || (dev ? 3000 : 80);

const app = next({ dev, hostname: "0.0.0.0", port });
const handle = app.getRequestHandler();

app.prepare()
	.then(() => {
		createServer(async (req, res) => {
			try {
				const parsedUrl = parse(req.url, true);
				const { pathname, query } = parsedUrl;

				if (!/^\/api\//.test(pathname)) {
					return res.destroy();
				} else {
					await handle(req, res, parsedUrl);
				}
			} catch (error) {
				console.log(`⛔ `, `Error occurred handling`, req.url);
				console.error(error);
				res.statusCode = 500;
				res.end("internal server error");
			}
		})
			.once("error", (error) => {
				console.log(`⛔ `, `Error starting server`);
				console.error(error);
				process.exit(1);
			})
			.listen(port, async () => {
				try {
					await initOnce();

					console.log(` ℹ️ `, `Ready on http://0.0.0.0:${port}`);
				} catch (error) {
					console.log(`⛔ `, `Error starting server`);
					console.error(error);
					process.exit(1);
				}
			});
	})
	.catch((error) => {
		console.log(`⛔ `, `Error starting server`);
		console.error(error);
		process.exit(1);
	});

// Some services are written under the ES6 src/ directory. This initializes them once.
// The service initialization piggybacks off the health check.
async function initOnce() {
	try {
		console.log(` ℹ️ `, `Running first time health-check`);
		const res = await fetch(`http://localhost:${port}/api/health-check`);

		if (res.status !== 200) {
			console.log(res.status, res.statusText);
			throw new Error(`Health check failed`);
		}
	} catch (error) {
		console.log(`⛔ `, `Error initiating health-check`);
		console.error(error);
		process.exit(1);
	}
}

process.once("SIGINT", function (code) {
	console.log(`SIGINT received`);
	process.exit();
});

process.once("SIGTERM", function (code) {
	console.log(`SIGTERM received`);
	process.exit();
});
