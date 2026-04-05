import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { spawnSync } from 'child_process'

const args = process.argv.slice(2)
const releaseType = args[0] || 'patch' // patch, minor, major

if (!['patch', 'minor', 'major'].includes(releaseType)) {
  console.error('Usage: bun run release [patch|minor|major]')
  process.exit(1)
}

// 1. Calculate new version from root package.json
const rootPkgPath = join(process.cwd(), 'package.json')
const rootPkg = JSON.parse(readFileSync(rootPkgPath, 'utf8'))
const currentVer = rootPkg.version
const [major, minor, patch] = currentVer.split('.').map(Number)

let newVer = ''
if (releaseType === 'major') newVer = `${major + 1}.0.0`
if (releaseType === 'minor') newVer = `${major}.${minor + 1}.0`
if (releaseType === 'patch') newVer = `${major}.${minor}.${patch + 1}`

console.log(`Bumping version: ${currentVer} -> ${newVer}...`)

// 2. Update all package.json files
const pkgPaths = [
  'package.json',
  'packages/cli/package.json',
  'packages/server/package.json',
  'packages/shared/package.json',
  'packages/web/package.json'
]

for (const p of pkgPaths) {
  const fullPath = join(process.cwd(), p)
  const pkg = JSON.parse(readFileSync(fullPath, 'utf8'))
  pkg.version = newVer
  writeFileSync(fullPath, JSON.stringify(pkg, null, 2) + '\n')
  console.log(`✓ Updated ${p}`)
}

// 3. Update CLI index.ts version
const cliIndexPath = join(process.cwd(), 'packages/cli/src/index.ts')
let cliContent = readFileSync(cliIndexPath, 'utf8')
cliContent = cliContent.replace(/\.version\('[0-9]+\.[0-9]+\.[0-9]+'\)/, `.version('${newVer}')`)
writeFileSync(cliIndexPath, cliContent)
console.log(`✓ Updated packages/cli/src/index.ts`)

// 4. Build the web UI
console.log('Building web UI...')
const buildRes = spawnSync('bun', ['run', 'build'], { stdio: 'inherit' })
if (buildRes.status !== 0) {
  console.error('Build failed! Aborting release.')
  process.exit(1)
}

// 5. Commit and tag
console.log('Committing and tagging...')
spawnSync('git', ['add', '.'], { stdio: 'inherit' })
spawnSync('git', ['commit', '-m', `chore: release v${newVer}`], { stdio: 'inherit' })
spawnSync('git', ['tag', `v${newVer}`], { stdio: 'inherit' })

console.log(`\n🎉 Release v${newVer} ready. Run:`)
console.log(`git push origin main --tags`)
