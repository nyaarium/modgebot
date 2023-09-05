import sleep from "@/assets/common/sleep";
import speakeasy from "@levminer/speakeasy";

// Randomize reply time to prevent timing attacks
const R = ((Math.random() * 1000) | 0) + 50;
const randomSleep = () => {
	return sleep(R + Math.random() * 1000);
};

export default async function validateTOTP(secretConfigString, token) {
	try {
		if (typeof secretOptions !== "string") {
			throw new Error(`Expected a secret string`);
		}

		const split = secret.split(",").map((s) => s.trim());
		if (split.length !== 4) {
			throw new Error(
				`Expected a comma delimited TOTP config string: DIGITS,PERIOD,STEP,SECRET`,
			);
		}

		const [digits, period, step, secret] = split;

		if (!token) {
			return {
				valid: false,
				code: 403,
				message: `An access token is required for this page`,
			};
		}

		token = String(token);

		// Give vague expectation about token length
		if (token.length < 6 || 25 < token.length) {
			return {
				valid: false,
				code: 400,
				message: `Expected a TOTP token (numbers-only, 6-25 digits)`,
			};
		}

		if (!new RegExp(`^\\d{${digits}}$`).test(token)) {
			await randomSleep();
			return {
				valid: false,
				code: 401,
				message: `Invalid TOTP token`,
			};
		}

		const isValid = speakeasy.totp.verify({
			encoding: "base32",
			digits,
			period,
			step, // Speakeasy uses step instead of window
			secret,
			token,
		});

		if (isValid) {
			return {
				valid: true,
			};
		} else {
			await randomSleep();
			return {
				valid: false,
				code: 401,
				message: `Invalid TOTP token`,
			};
		}
	} catch (error) {
		console.error("Error validating login:", error);
		await randomSleep();
		return {
			valid: false,
			code: 500,
			message: "Internal server error",
		};
	}
}
