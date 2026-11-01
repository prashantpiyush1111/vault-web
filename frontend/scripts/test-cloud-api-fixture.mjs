import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const frontendRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const fixturePath = join(
  frontendRoot,
  "openapi/fixtures/cloud-generator-v1.yaml",
);
const generator = join(frontendRoot, "scripts/generate-cloud-api.mjs");
const target = join(frontendRoot, "src/app/api/generated/cloud");
const sandbox = mkdtempSync(join(tmpdir(), "cloud-api-fixture-"));
const changedFixtureDirectory = mkdtempSync(
  join(frontendRoot, ".cloud-openapi-fixture-"),
);
const originalTarget = join(sandbox, "original-target");
const snapshot = join(sandbox, "first-run");
const env = { ...process.env, CLOUD_OPENAPI_SPEC: fixturePath };

const run = (args, expectedStatus = 0) => {
  const result = spawnSync(process.execPath, [generator, ...args], {
    cwd: frontendRoot,
    env,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== expectedStatus) {
    throw new Error(
      `Expected exit code ${expectedStatus}, got ${result.status}`,
    );
  }
};

const files = (directory) => {
  const found = [];
  const visit = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile()) found.push(path.slice(directory.length + 1));
    }
  };
  visit(directory);
  return found.sort();
};

const sameTree = (left, right) => {
  const leftFiles = files(left);
  const rightFiles = files(right);
  return (
    JSON.stringify(leftFiles) === JSON.stringify(rightFiles) &&
    leftFiles.every((file) =>
      readFileSync(join(left, file)).equals(readFileSync(join(right, file))),
    )
  );
};

try {
  if (existsSync(target)) {
    cpSync(target, originalTarget, { recursive: true });
  }
  try {
    rmSync(target, { recursive: true, force: true });
    run([]);
    cpSync(target, snapshot, { recursive: true });

    run([]);
    if (!sameTree(snapshot, target)) {
      throw new Error("Repeated fixture generation produced different output.");
    }

    const staleFile = files(target)[0];
    if (!staleFile) {
      throw new Error("Fixture generation produced no files.");
    }
    writeFileSync(join(target, staleFile), "\n// intentionally stale\n", {
      flag: "a",
    });
    run(["--check"], 1);

    const changedFixture = readFileSync(fixturePath, "utf8").replace(
      /  \/widgets\/\{id\}:\n[\s\S]*?(?=components:)/,
      "",
    );
    const changedPath = join(changedFixtureDirectory, "cloud-generator-v2.yaml");
    writeFileSync(changedPath, changedFixture);
    env.CLOUD_OPENAPI_SPEC = changedPath;

    run([]);
    if (
      files(target).some((file) => file.toLowerCase().includes("getwidget"))
    ) {
      throw new Error("Regeneration retained the removed getWidget API file.");
    }
    run(["--check"]);
  } finally {
    rmSync(target, { recursive: true, force: true });
    if (existsSync(originalTarget)) {
      cpSync(originalTarget, target, { recursive: true });
    }
  }

  console.log("Cloud OpenAPI fixture generation regression test passed.");
} finally {
  rmSync(sandbox, { recursive: true, force: true });
  rmSync(changedFixtureDirectory, { recursive: true, force: true });
}
