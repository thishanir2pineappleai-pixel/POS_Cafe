// Validate source ownership without starting services or connecting to databases.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const serviceRoot = path.join(root, 'backend/services');
const errors = [];
const names = new Set();
const excluded = new Set(['node_modules', 'generated', 'uploads', '.git']);
function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    if (excluded.has(entry.name)) return [];
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}
function inside(parent, target) {
  const relative = path.relative(parent, target);
  return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative));
}
const services = fs.readdirSync(serviceRoot).filter(name => name.endsWith('-service'));
const packages = ['frontend', 'backend', 'backend/shared', 'backend/gateway', ...services.map(name => 'backend/services/' + name)];
for (const folder of packages) {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, folder, 'package.json'), 'utf8'));
  if (!manifest.name || names.has(manifest.name)) errors.push('Missing or duplicate package name: ' + folder);
  names.add(manifest.name);
}
for (const name of services) {
  const dir = path.join(serviceRoot, name);
  for (const required of ['prisma/schema.prisma', 'prisma/migrations', 'prisma.config.js', 'repositories', 'routes/v1', 'package.json']) {
    if (!fs.existsSync(path.join(dir, required))) errors.push(name + ': missing ' + required);
  }
  for (const file of walk(dir).filter(file => file.endsWith('.js') && !file.split(path.sep).includes('tests'))) {
    const source = fs.readFileSync(file, 'utf8');
    for (const match of source.matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)/g)) {
      const ref = match[1];
      if (ref.startsWith('.') && !inside(dir, path.resolve(path.dirname(file), ref))) {
        errors.push(path.relative(root, file) + ': import escapes service: ' + ref);
      }
      if (ref.startsWith('@pos-cafe/') && !ref.startsWith('@pos-cafe/shared/')) {
        errors.push(path.relative(root, file) + ': direct business package import: ' + ref);
      }
    }
    if (file.includes(path.sep + 'repositories' + path.sep) && file.endsWith('Routes.js')) errors.push('Route inside repositories: ' + file);
    if (file.includes(path.sep + 'middleware' + path.sep) && file.endsWith('Repository.js')) errors.push('Repository inside middleware: ' + file);
  }
}
if (errors.length) {
  process.stderr.write(errors.join('\n') + '\n');
  process.exitCode = 1;
} else {
  process.stdout.write('Architecture checks passed: ' + packages.length + ' packages, ' + services.length + ' service boundaries.\n');
}
