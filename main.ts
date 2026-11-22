import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const output = resolve(process.env.MAKEFUN_OUTPUT_DIR ?? '/output');
const game = join(root, 'game');
const screenshots = join(root, 'screenshots');
const dossierLibrary = join(root, 'vendor', 'makefun-game.ts');

const rootFromOutput = relative(output, root);
const outputContainsRoot = rootFromOutput === '' ||
  (rootFromOutput !== '..' && !rootFromOutput.startsWith(`..${sep}`) && !isAbsolute(rootFromOutput));
const protectedSourceDirs = [game, screenshots, join(root, 'vendor')];
if (outputContainsRoot || protectedSourceDirs.some(dir => output === dir || output.startsWith(`${dir}${sep}`))) {
  throw new Error('MAKEFUN_OUTPUT_DIR cannot contain or overwrite the source files.');
}
if (!existsSync(dossierLibrary)) {
  throw new Error('Copy vendor/makefun-game.ts unchanged from the official bounty kit.');
}
if (!existsSync(screenshots)) {
  throw new Error('Add three or four real game screenshots under screenshots/.');
}

rmSync(join(output, 'game'), { recursive: true, force: true });
rmSync(join(output, 'screenshots'), { recursive: true, force: true });
rmSync(join(output, 'dossier.json'), { force: true });
mkdirSync(output, { recursive: true });
cpSync(game, join(output, 'game'), { recursive: true });
cpSync(screenshots, join(output, 'screenshots'), { recursive: true });

const { buildDossier } = await import('./vendor/makefun-game.ts');
const dossier = buildDossier(output, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
});
writeFileSync(join(output, 'dossier.json'), dossier, 'utf8');
