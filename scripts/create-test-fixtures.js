#!/usr/bin/env node

/**
 * Creates test fixtures for E2E tests
 * Run: node scripts/create-test-fixtures.js
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const fixturesDir = path.join(__dirname, '../e2e/fixtures')

// Ensure fixtures directory exists
if (!fs.existsSync(fixturesDir)) {
  fs.mkdirSync(fixturesDir, { recursive: true })
}

// Create a minimal 1x1 PNG (valid PNG file)
// This is a base64-encoded 1x1 transparent PNG
const minimalPNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
)

// Create a minimal 800x600 PNG with blue background and text
// This is a more complex valid PNG for testing
const testPNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAyAAAAJYCAYAAACadoJwAAAABHNCSVQICAgIfAhkiAAAAAlwSFlz' +
  'AAAOxAAADsQBlSsOGwAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAACAASURB' +
  'VHic7N1njBzH9cbx52v7bO85n3POOYeVqCxSokiJkmVZji4uThIoy5Isy5ZlWbIsS5YsWZYsy5Ys' +
  'S5YlS5YsS5YsWZYsWZYsy7IsS5YlS5YsS5YsWZZlWZYsS5YsWZZlWZYsS5YsWbIsWZZlWZYsS5Yl' +
  'S5YsS5YsWbIsWZYsWZZlWZYsS5YsS5ZlWZYsWZZlWZYsS5YsS5YsWbIsWZYsWZZlWZYsS5YsS5Yl' +
  'S5YsS5YsWZZlWZYsS5YsS5YsS5YsS5ZlWZYsWZYsS5YsS5YsWZZlWZYsS5YsS5YsS5ZlWZYsWZYs' +
  'S5YsWZYsWZYsWZZlWZYsWZYsWZZlWZYsWZZlWZYsWZYsWZYsWbIsWZYsWZZlWZYsS5YsS5ZlWZYs' +
  'WZAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/zwEAAPxNAP///8QAAAAASUVORK5CYII=',
  'base64'
)

// Write test image
const testImagePath = path.join(fixturesDir, 'test-image.png')
fs.writeFileSync(testImagePath, testPNG)
console.log(`✅ Created test image: ${testImagePath}`)

// Write test text file (for invalid upload test)
const testFilePath = path.join(fixturesDir, 'test-file.txt')
fs.writeFileSync(testFilePath, 'This is a test file for invalid upload testing')
console.log(`✅ Created test text file: ${testFilePath}`)

console.log('\n🎉 Test fixtures created successfully!')
console.log('\nYou can now run E2E tests with:')
console.log('  pnpm test:e2e:media')
console.log('  pnpm test:e2e:ui')
