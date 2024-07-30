/** Renames `.js` files in the /lib/cjs folder to `.cjs` to appease ESM clients. */

import { promises as fs } from "node:fs";
import url from "node:url";

process.chdir(url.fileURLToPath(`${import.meta.url}/../../dist/_cjs`));
for (const filename of await fs.readdir(".")) {
	if (!/\.js$/.test(filename)) continue;
	const cjs = await fs.readFile(filename, "utf-8");
	await fs.writeFile(
		filename.replace(/\.js$/, ".cjs"),
		cjs.replaceAll(/require\("(.\/[\w_\-.]+)\.js"\)/g, 'require("$1.cjs")'),
	);
	await fs.unlink(filename);
}
