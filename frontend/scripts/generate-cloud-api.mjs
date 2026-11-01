import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
} from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const frontendRoot = resolve(scriptDirectory, "..");
const specPath = resolve(
  frontendRoot,
  process.env.CLOUD_OPENAPI_SPEC ?? "src/app/api/contracts/cloud/openapi.yaml",
);
const outputPath = resolve(frontendRoot, "src/app/api/generated/cloud");
const configPath = resolve(frontendRoot, "openapi/cloud-generator-config.yaml");
const generatorVersion = "v7.26.0";
const checkOnly = process.argv.includes("--check");

const relativeSpecPath = relative(frontendRoot, specPath);
if (
  relativeSpecPath === ".." ||
  relativeSpecPath.startsWith(`..${sep}`) ||
  relativeSpecPath.startsWith("/")
) {
  console.error(
    "CLOUD_OPENAPI_SPEC must point to a file inside the frontend directory because Docker mounts only that directory.",
  );
  process.exit(1);
}

if (!existsSync(specPath)) {
  console.error(
    [
      "Cloud OpenAPI contract is not available.",
      "Expected a revision-pinned provider export at:",
      relativeSpecPath,
      "Track the provider export prerequisite in:",
      "https://github.com/Vault-Web/cloud-page/issues/192",
      "Do not substitute a live /v3/api-docs endpoint or a mutable main/latest URL.",
    ].join("\n"),
  );
  process.exit(1);
}

if (!existsSync(configPath)) {
  throw new Error(`OpenAPI Generator config not found: ${configPath}`);
}

// Keep the temporary output on the same filesystem as the checked-in client so
// the final directory swap works on Windows as well as Unix-like systems.
const temporaryRoot = mkdtempSync(join(frontendRoot, ".cloud-openapi-"));
const generatedPath = join(temporaryRoot, "generated");
mkdirSync(generatedPath, { recursive: true });

const dockerArgs = [
  "run",
  "--rm",
  ...(typeof process.getuid === "function"
    ? ["--user", `${process.getuid()}:${process.getgid()}`]
    : []),
  "-v",
  `${frontendRoot}:/local`,
  "-v",
  `${temporaryRoot}:/output`,
  `openapitools/openapi-generator-cli:${generatorVersion}`,
  "generate",
  "-g",
  "typescript-angular",
  "-i",
  `/local/${relativeSpecPath.split(sep).join("/")}`,
  "-c",
  "/local/openapi/cloud-generator-config.yaml",
  "-o",
  "/output/generated",
  "--global-property",
  "apiTests=false,modelTests=false,apiDocs=false,modelDocs=false",
];

const collectFiles = (root) => {
  const files = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolute = join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(absolute);
      } else if (entry.isFile()) {
        files.push(relative(root, absolute).split(sep).join("/"));
      }
    }
  };
  visit(root);
  return files.sort();
};

try {
  const result = spawnSync("docker", dockerArgs, {
    cwd: frontendRoot,
    stdio: "inherit",
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.exitCode = result.status ?? 1;
  } else if (
    !existsSync(generatedPath) ||
    collectFiles(generatedPath).length === 0
  ) {
    console.error(
      "OpenAPI Generator completed without producing client files.",
    );
    process.exitCode = 1;
  } else if (checkOnly) {
    if (!existsSync(outputPath)) {
      console.error(
        "Generated Cloud client is missing. Run npm run api:generate.",
      );
      process.exitCode = 1;
    } else {
      const expected = collectFiles(outputPath);
      const actual = collectFiles(generatedPath);
      const changed = [...new Set([...expected, ...actual])].filter(
        (file) =>
          !existsSync(join(outputPath, file)) ||
          !existsSync(join(generatedPath, file)) ||
          !readFileSync(join(outputPath, file)).equals(
            readFileSync(join(generatedPath, file)),
          ),
      );

      if (changed.length > 0) {
        console.error(
          "Generated Cloud client is stale. Changed files:\n" +
            changed.map((file) => ` - ${file}`).join("\n"),
        );
        process.exitCode = 1;
      } else {
        console.log("Generated Cloud client is up to date.");
      }
    }
  } else {
    const backupPath = `${outputPath}.backup-${process.pid}`;
    let movedExistingOutput = false;

    try {
      mkdirSync(dirname(outputPath), { recursive: true });
      if (existsSync(outputPath)) {
        renameSync(outputPath, backupPath);
        movedExistingOutput = true;
      }

      renameSync(generatedPath, outputPath);

      if (movedExistingOutput) {
        rmSync(backupPath, { recursive: true, force: true });
      }
    } catch (error) {
      // Restore the previous generated client if installing the new one fails.
      if (existsSync(outputPath)) {
        rmSync(outputPath, { recursive: true, force: true });
      }
      if (movedExistingOutput && existsSync(backupPath)) {
        renameSync(backupPath, outputPath);
      }
      throw error;
    }
  }
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true });
}
