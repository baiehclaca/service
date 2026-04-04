#!/usr/bin/env node
const [major] = process.versions.node.split('.').map(Number);
if (major < 20) {
  console.error(`SERVICE requires Node.js >=20. You have v${process.versions.node}.`);
  process.exit(1);
}
import('../dist/cli/index.js').catch((err) => {
  console.error('Failed to start SERVICE:', err.message);
  process.exit(1);
});
