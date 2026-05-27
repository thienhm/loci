import { afterEach, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const repoRoot = resolve(import.meta.dir, "..");
const scriptPath = join(repoRoot, "scripts", "package-rust-cli.sh");
const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});

async function makeTempDir(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), "loci-package-test-"));
  tempDirs.push(path);
  return path;
}

async function runPackage(target: string, binaryName = "loci") {
  const workDir = await makeTempDir();
  const binDir = join(workDir, "bin");
  const outDir = join(workDir, "dist");
  const binaryPath = join(binDir, binaryName);

  await Bun.$`mkdir -p ${binDir}`;
  await writeFile(binaryPath, "#!/usr/bin/env sh\necho loci fixture\n", {
    mode: 0o755,
  });

  const result =
    await Bun.$`${scriptPath} --target ${target} --binary ${binaryPath} --out-dir ${outDir}`.quiet();

  return {
    outDir,
    stdout: result.stdout.toString(),
  };
}

test("packages Unix targets as tar.gz with README, LICENSE, and SHA256SUMS", async () => {
  const { outDir, stdout } = await runPackage("x86_64-unknown-linux-gnu");
  const archive = join(outDir, "loci-x86_64-unknown-linux-gnu.tar.gz");
  const checksums = await readFile(join(outDir, "loci-SHA256SUMS.txt"), "utf8");
  const listing = await Bun.$`tar -tzf ${archive}`.text();

  expect(stdout).toContain("loci-x86_64-unknown-linux-gnu.tar.gz");
  expect(listing).toContain("loci/loci");
  expect(listing).toContain("loci/README.md");
  expect(listing).toContain("loci/LICENSE");
  expect(checksums).toContain("loci-x86_64-unknown-linux-gnu.tar.gz");
});

test("uses the expected archive names for every release target", async () => {
  const targets = [
    ["aarch64-apple-darwin", "loci-aarch64-apple-darwin.tar.gz", "loci"],
    ["x86_64-apple-darwin", "loci-x86_64-apple-darwin.tar.gz", "loci"],
    ["x86_64-unknown-linux-gnu", "loci-x86_64-unknown-linux-gnu.tar.gz", "loci"],
    ["aarch64-unknown-linux-gnu", "loci-aarch64-unknown-linux-gnu.tar.gz", "loci"],
    ["x86_64-pc-windows-msvc", "loci-x86_64-pc-windows-msvc.zip", "loci.exe"],
  ];

  for (const [target, archiveName, binaryName] of targets) {
    const { outDir } = await runPackage(target, binaryName);
    const checksums = await readFile(join(outDir, "loci-SHA256SUMS.txt"), "utf8");

    expect(await Bun.file(join(outDir, archiveName)).exists()).toBe(true);
    expect(checksums).toContain(archiveName);
  }
});

test("packages Windows targets as zip with loci.exe and SHA256SUMS", async () => {
  const { outDir } = await runPackage("x86_64-pc-windows-msvc", "loci.exe");
  const archive = join(outDir, "loci-x86_64-pc-windows-msvc.zip");
  const checksums = await readFile(join(outDir, "loci-SHA256SUMS.txt"), "utf8");
  const listing = await Bun.$`unzip -Z1 ${archive}`.text();

  expect(listing).toContain("loci/loci.exe");
  expect(listing).toContain("loci/README.md");
  expect(listing).toContain("loci/LICENSE");
  expect(checksums).toContain("loci-x86_64-pc-windows-msvc.zip");
});
