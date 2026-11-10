// Pi picks a default model from provider credentials in the environment, which would make footer
// assertions depend on the developer's shell. Tests run as if no provider were configured.
const CREDENTIAL = /API_KEY|_TOKEN$|ACCESS_KEY|SECRET|CREDENTIALS|^AWS_PROFILE$/i;

for (const key of Object.keys(process.env)) {
	if (CREDENTIAL.test(key)) delete process.env[key];
}
