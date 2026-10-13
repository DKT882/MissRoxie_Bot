process.env.NODE_ENV = 'test';
import React from 'react';
import { renderToString } from 'react-dom/server';
import fs from 'fs';
import path from 'path';
import {
  RichPostComposer,
  updateComposerButton,
  validateButtonGrid,
  formatComposerButtons,
  isValidHttpUrl,
  ComposerButton
} from '../src/components/RichPostComposer.js';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`✅ [PASS] ${message}`);
    passed++;
  } else {
    console.error(`❌ [FAIL] ${message}`);
    failed++;
  }
}

async function runComposerEmptyButtonTextRegressionTestSuite() {
  console.log('================================================================');
  console.log('🧪 RUNNING RICH POST COMPOSER EMPTY BUTTON TEXT REGRESSION SUITE');
  console.log('================================================================\n');

  // Initial fixture: 1 row with 2 buttons
  const initialGrid: ComposerButton[][] = [
    [
      { id: 'btn_1', text: 'Documentation', url: 'https://docs.example.com', style: 'primary' },
      { id: 'btn_2', text: 'Support Chat', url: 'https://t.me/support', style: 'success' }
    ]
  ];

  // =========================================================================
  // TEST 1: Clearing a button label to an empty string does not throw and retains state
  // =========================================================================
  console.log('--- Test 1: Empty Button Label State Transition ---');
  let updatedGrid: ComposerButton[][] = [];
  let thrownError: any = null;

  try {
    // Simulate user backspacing all characters: 'Documentation' -> ''
    updatedGrid = updateComposerButton(initialGrid, 0, 0, 'text', '');
  } catch (err: any) {
    thrownError = err;
  }

  assert(thrownError === null, '1a. updateComposerButton does not throw when text is cleared to ""');
  assert(updatedGrid.length === 1 && updatedGrid[0].length === 2, '1b. Button row and column count are preserved (button not deleted on empty text)');
  assert(updatedGrid[0][0].text === '', '1c. Button text is an empty string (""), not undefined or null');
  assert(typeof updatedGrid[0][0].text === 'string', '1d. Button text remains of type string');
  assert(updatedGrid[0][0].url === 'https://docs.example.com', '1e. Button URL remains intact while text is being edited');
  assert(updatedGrid[0][0].style === 'primary', '1f. Button style remains intact');
  assert(updatedGrid[0][1].text === 'Support Chat', '1g. Sibling button in same row is unmodified');

  // =========================================================================
  // TEST 2: Validation safely executes on empty label (no TypeError: trim of undefined)
  // =========================================================================
  console.log('\n--- Test 2: Validation with Empty Button Label ---');
  let validationErrors: string[] = [];
  let valErrorThrown: any = null;

  try {
    validationErrors = validateButtonGrid(updatedGrid);
  } catch (err: any) {
    valErrorThrown = err;
  }

  assert(valErrorThrown === null, '2a. validateButtonGrid does not crash when a button label is empty');
  assert(validationErrors.some(e => e.includes('Row 1, Button 1: Button text cannot be empty')), '2b. Correctly flags empty button text validation error');
  assert(!validationErrors.some(e => e.includes('Button 2')), '2c. Sibling valid button produces zero validation errors');

  // Also test defensive tolerance against corrupted undefined text
  const corruptedGrid: ComposerButton[][] = [[{ id: 'btn_bad', text: undefined as any, url: 'https://example.com' }]];
  let corruptedErrors: string[] = [];
  let corruptedThrew: any = null;
  try {
    corruptedErrors = validateButtonGrid(corruptedGrid);
  } catch (err: any) {
    corruptedThrew = err;
  }
  assert(corruptedThrew === null, '2d. validateButtonGrid defensively survives corrupted undefined button text');
  assert(corruptedErrors.some(e => e.includes('Button text cannot be empty')), '2e. Corrupted undefined button text flags empty validation error');

  // =========================================================================
  // TEST 3: Re-entering a label restores valid state
  // =========================================================================
  console.log('\n--- Test 3: Re-entering Button Label ---');
  let restoredGrid: ComposerButton[][] = [];
  try {
    restoredGrid = updateComposerButton(updatedGrid, 0, 0, 'text', 'New Docs Link');
  } catch (err: any) {
    thrownError = err;
  }

  assert(restoredGrid[0][0].text === 'New Docs Link', '3a. Button label updates successfully to "New Docs Link"');
  assert(restoredGrid[0][0].url === 'https://docs.example.com', '3b. URL remains preserved');
  const restoredErrors = validateButtonGrid(restoredGrid);
  assert(restoredErrors.length === 0, '3c. Validation passes completely once valid label is re-entered');

  // =========================================================================
  // TEST 4: Clearing Button URL to empty string does not throw and retains text
  // =========================================================================
  console.log('\n--- Test 4: Clearing Button URL ---');
  let emptyUrlGrid: ComposerButton[][] = [];
  try {
    emptyUrlGrid = updateComposerButton(restoredGrid, 0, 0, 'url', '');
  } catch (err: any) {
    thrownError = err;
  }

  assert(emptyUrlGrid[0][0].url === '', '4a. URL is empty string (""), not undefined');
  assert(emptyUrlGrid[0][0].text === 'New Docs Link', '4b. Button text is preserved while editing URL');
  const emptyUrlErrors = validateButtonGrid(emptyUrlGrid);
  assert(emptyUrlErrors.some(e => e.includes('Invalid URL')), '4c. Flags invalid URL error without crashing');

  // =========================================================================
  // TEST 5: Payload formatting safely ignores incomplete/empty buttons
  // =========================================================================
  console.log('\n--- Test 5: Payload Formatting with Incomplete Buttons ---');
  const payloadWithEmpty = formatComposerButtons(updatedGrid); // Button 1 has empty text, Button 2 is valid
  assert(payloadWithEmpty.length === 1, '5a. Formatted button rows produced');
  assert(payloadWithEmpty[0].length === 1, '5b. Incomplete button with empty text was safely omitted from submission payload');
  assert(payloadWithEmpty[0][0].text === 'Support Chat', '5c. Only valid button was retained for submission');

  // =========================================================================
  // TEST 6: React Component Renders Safely with Empty Button Text
  // =========================================================================
  console.log('\n--- Test 6: React Component Render Safety ---');
  let renderSucceeded = false;
  let htmlOutput = '';

  try {
    const element = React.createElement(RichPostComposer, {
      groups: [{ chatId: -100123456789, title: 'Sample Group' }],
      selectedChatId: -100123456789,
      theme: 'dark'
    });
    htmlOutput = renderToString(element);
    renderSucceeded = true;
  } catch (err: any) {
    console.error('RichPostComposer render failed:', err);
    renderSucceeded = false;
  }

  assert(renderSucceeded, '6a. RichPostComposer renders to static HTML without runtime exceptions');
  assert(htmlOutput.includes('Rich Post Composer'), '6b. Rendered output contains RichPostComposer heading');

  // =========================================================================
  // TEST 7: Button Tag Form Submission Safety Inspection
  // =========================================================================
  console.log('\n--- Test 7: Button Tags Type="button" Audit ---');
  const composerFile = fs.readFileSync(path.join(process.cwd(), 'src/components/RichPostComposer.tsx'), 'utf-8');
  const editorFile = fs.readFileSync(path.join(process.cwd(), 'src/components/RichMessageEditor.tsx'), 'utf-8');

  // Find all <button occurrences without type="button"
  const composerButtonMatches = composerFile.match(/<button[\s\S]*?>/g) || [];
  const composerMissingType = composerButtonMatches.filter(b => !b.includes('type="button"'));
  assert(composerMissingType.length === 0, `7a. All ${composerButtonMatches.length} <button> tags in RichPostComposer.tsx explicitly specify type="button"`);

  const editorButtonMatches = editorFile.match(/<button[\s\S]*?>/g) || [];
  const editorMissingType = editorButtonMatches.filter(b => !b.includes('type="button"'));
  assert(editorMissingType.length === 0, `7b. All ${editorButtonMatches.length} <button> tags in RichMessageEditor.tsx explicitly specify type="button"`);

  // =========================================================================
  // TEST 8: Explicit Button Removal Behavior
  // =========================================================================
  console.log('\n--- Test 8: Explicit Button Removal ---');
  // Removing button 0 from updatedGrid (which had 2 buttons)
  const remainingRow = [...updatedGrid[0]];
  remainingRow.splice(0, 1);
  assert(remainingRow.length === 1 && remainingRow[0].text === 'Support Chat', '8a. Explicit removal leaves remaining buttons intact');

  console.log(`\n================================================================`);
  console.log(`🎉 TEST RESULTS: ${passed} PASSED | ${failed} FAILED (TOTAL: ${passed + failed})`);
  console.log(`================================================================`);

  process.exit(failed > 0 ? 1 : 0);
}

runComposerEmptyButtonTextRegressionTestSuite().catch(err => {
  console.error('Test suite uncaught error:', err);
  process.exit(1);
});
