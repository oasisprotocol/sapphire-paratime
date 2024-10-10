import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { rimraf } from "rimraf";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const EXTRACT_CODE_RX = /\`\`\`(?<lang>\w+)\s*(?<content>[\s\S]*?)\`\`\`/gm;

function extractCode(markdown: string) {
	return Array.from(markdown.matchAll(EXTRACT_CODE_RX), (_) => {
		return {
			lang: _.groups?.lang,
			content: _.groups?.content,
		};
	});
}

const TEST_DIR = join(process.cwd(), "test-modules");

describe("README.md", async () => {
	beforeAll(async () => {
		await mkdir(TEST_DIR, { recursive: true });
	});
	afterAll(async () => {
		await rimraf(TEST_DIR);
	});
	for (const [index, c] of extractCode(
		await readFile("./README.md", "utf8"),
	).entries()) {
		const content = c.content;
		if (content) {
			it(`Code snippet #${index + 1}`, async () => {
				const fileName = join(TEST_DIR, `example_${index + 1}.ts`);
				await writeFile(fileName, content);
				console.log(fileName, content);
				await expect(import(fileName)).resolves.not.toThrow();
			});
		}
	}
});
