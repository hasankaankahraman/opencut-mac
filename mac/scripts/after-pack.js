// Copies the Next standalone server into OpenCut.app/Contents/Resources/server,
// keeping bun's relative symlinks intact (Node resolves packages through them).
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

exports.default = async function afterPack(context) {
	const source = path.resolve(__dirname, "..", "..", "apps", "web", ".next", "standalone");
	if (!fs.existsSync(path.join(source, "apps", "web", "server.js"))) {
		throw new Error(`No standalone server at ${source}. Run "bun run prepare-server" first.`);
	}

	const appName = `${context.packager.appInfo.productFilename}.app`;
	const target = path.join(context.appOutDir, appName, "Contents", "Resources", "server");
	fs.rmSync(target, { recursive: true, force: true });
	execFileSync("cp", ["-R", source, target]);

	const broken = execFileSync("find", [target, "-type", "l", "!", "-exec", "test", "-e", "{}", ";", "-print"])
		.toString()
		.trim();
	if (broken) throw new Error(`Broken symlinks in server bundle:\n${broken}`);
};
