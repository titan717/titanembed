import { fileURLToPath } from "node:url";
const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));
export const alias = {
  "@titan/core": r("./packages/core/src"),
  "@titan/ui-common": r("./packages/ui-common/src"),
  "@titan/ui-tv": r("./packages/ui-tv/src"),
  "@titan/ui-mobile": r("./packages/ui-mobile/src"),
  "@titan/sdk": r("./packages/sdk/src"),
  "@titan/sources": r("./packages/sources/src"),
  "@titan/embed": r("./packages/embed/src")
};
