import { codexList } from "./list.js";
import { codexFx } from "./_codex.js";

// "codex-<pacote>/<id>": game (64 recriacoes), ultimate, mass, scale, twist, armory
export const codexEffects = Object.fromEntries(codexList.map((row) => ["codex-" + row[1] + "/" + row[0], codexFx(row)]));
export const codexPacks = ["game", "ultimate", "mass", "scale", "twist", "armory"];
