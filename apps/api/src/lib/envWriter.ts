import fs from "node:fs";
import path from "node:path";

const ENV_PATH = path.resolve(process.cwd(), ".env");

/**
 * Updates (or appends) a single KEY=value line in the .env file this process was started
 * with, so a runtime credential update (see routes/clipping.ts's session-cookie endpoint)
 * survives a restart, not just the current process's in-memory env object.
 */
export function updateEnvVar(key: string, value: string): void {
  let content = "";
  try {
    content = fs.readFileSync(ENV_PATH, "utf-8");
  } catch {
    content = "";
  }

  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, "m");

  if (pattern.test(content)) {
    content = content.replace(pattern, line);
  } else {
    if (content.length > 0 && !content.endsWith("\n")) content += "\n";
    content += `${line}\n`;
  }

  fs.writeFileSync(ENV_PATH, content, "utf-8");
}
