import path from "node:path";

const toRelative = (dir) => (files) =>
  files.map((file) => `"${path.relative(path.resolve(dir), file)}"`);

export default {
  "frontend/**/*.{ts,tsx}": (files) => [
    `pnpm --dir frontend exec eslint --fix ${toRelative("frontend")(files).join(" ")}`,
    `pnpm --dir frontend exec prettier --write ${toRelative("frontend")(files).join(" ")}`,
  ],
  "frontend/**/*.css": (files) =>
    `pnpm --dir frontend exec prettier --write ${toRelative("frontend")(files).join(" ")}`,
  "backend/**/*.ts": (files) => [
    `pnpm --dir backend exec eslint --fix ${toRelative("backend")(files).join(" ")}`,
    `pnpm --dir backend exec prettier --write ${toRelative("backend")(files).join(" ")}`,
  ],
};
