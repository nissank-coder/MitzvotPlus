// One version source (round 11 §5): package.json. Android reads it at build time; iOS must match.
import { readFileSync } from 'node:fs';
const version = JSON.parse(readFileSync('package.json', 'utf8')).version;
const gradle = readFileSync('android/app/build.gradle', 'utf8');
const pbx = readFileSync('ios/App/App.xcodeproj/project.pbxproj', 'utf8');
const problems = [];
if (!/versionName new groovy\.json\.JsonSlurper\(\)\.parse\(file\("\.\.\/\.\.\/package\.json"\)\)\.version/.test(gradle)) problems.push('Android versionName is not read from package.json');
if (!/versionCode\(\(System\.getenv\("BUILD_NUMBER"\)/.test(gradle)) problems.push('Android versionCode does not come from BUILD_NUMBER');
const ios = [...pbx.matchAll(/MARKETING_VERSION = ([^;]+);/g)].map((m) => m[1]);
if (ios.length === 0 || ios.some((v) => v !== version)) problems.push(`iOS MARKETING_VERSION ${ios.join('/')} ≠ package.json ${version}`);
if (problems.length) {
  console.error('Version check failed:\n  - ' + problems.join('\n  - '));
  process.exit(1);
}
console.log(`Version check passed: ${version} (Android and iOS)`);
