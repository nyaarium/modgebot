const { createServer } = require("http");
const { parse } = require("url");
const next = require("next");
const { default: nodeFetch } = require("node-fetch");

const dev = process.env.NODE_ENV !== "production";
if (dev) {
	const dotenv = require("dotenv");
	dotenv.config();
}

const port = parseInt(process.env.PORT, 10) || (dev ? 3000 : 80);

const app = next({ dev, hostname: "0.0.0.0", port });
const handle = app.getRequestHandler();

if (!process.env.DATA_PATH) {
	throw new Error(`Expected environment variable DATA_PATH`);
}

function routeHandler(req, res, parsedUrl, next) {
	const { pathname } = parsedUrl;

	if (!/^\/api\//.test(pathname)) {
		return res.destroy();
	} else {
		return handle(req, res, parsedUrl);
	}
}

app.prepare()
	.then(() => {
		createServer((req, res) => {
			const parsedUrl = parse(req.url, true);
			try {
				return routeHandler(req, res, parsedUrl, () => {
					return handle(req, res, parsedUrl);
				});
			} catch (error) {
				console.log(`⛔ `, `Error in route:`, parsedUrl.pathname);
				console.error(error);
				res.statusCode = 500;
				res.end("Internal server error");
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

process.once("SIGINT", (code) => {
	console.log(`SIGINT received`);
	process.exit();
});

process.once("SIGTERM", (code) => {
	console.log(`SIGTERM received`);
	process.exit();
});

// Some services are written under the ES6 src/ directory. This initializes them once.
// The service initialization piggybacks off the health check.
async function initOnce() {
	try {
		console.log(` ℹ️ `, `Running first time health-check`);
		const res = await nodeFetch(
			`http://localhost:${port}/api/health-check`,
		);

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
