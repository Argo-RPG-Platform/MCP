// Prepends #!/usr/bin/env node to dist/index.js so it works as an npm binary.
// tsc strips shebangs, so we add it back here.
import { readFileSync, writeFileSync } from "node:fs";

const file = "dist/index.js";
const content = readFileSync(file, "utf8");
if (!content.startsWith("#!")) {
  writeFileSync(file, "#!/usr/bin/env node\n" + content);
}
