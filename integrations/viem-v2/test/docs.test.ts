import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { extractCode } from "@zaeny/literate";
import { rimraf } from "rimraf";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

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
		it(`Code snippet #${index + 1}`, async () => {
			const fileName = join(TEST_DIR, `example_${index + 1}.ts`);
			await writeFile(fileName, content);
			await expect(import(fileName)).resolves.not.toThrow();
		});
	}
});
