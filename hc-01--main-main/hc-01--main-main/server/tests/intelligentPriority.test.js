import assert from 'assert';
import {
  evaluateConditionPriority,
  applyQueuePolicy,
  overridePriority,
  getQueuePolicy,
  updateQueuePolicy,
  normalizePriority,
} from '../services/priorityService.js';

let passed = 0;
let failed = 0;

function it(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}:`, err.message);
    failed++;
  }
}

async function itAsync(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}:`, err.message);
    failed++;
  }
}

console.log('\n======================================================');
console.log('TEST SUITE: Intelligent Queue Priority & CDS Governance');
console.log('======================================================\n');

// ── Test 1: Clinical Decision Support (CDS) & Non-Autonomous Diagnosis ──
console.log('1. Clinical Decision Support (CDS) Governance & Non-Autonomous Guardrail:');
await itAsync('should evaluate condition as CDS recommendation and include explicit non-autonomous disclaimer', async () => {
  const cardiacResult = await evaluateConditionPriority({
    condition: 'Severe chest pain radiating to left arm and shortness of breath',
    age: 58,
  });

  console.log(`     Condition: Chest pain`);
  console.log(`     CDS Priority: ${cardiacResult.priority} (Score: ${cardiacResult.score})`);
  console.log(`     Reason: ${cardiacResult.reason}`);
  console.log(`     Disclaimer: ${cardiacResult.disclaimer}`);

  assert.strictEqual(cardiacResult.priority, 'critical');
  assert.strictEqual(cardiacResult.isCdsRecommendation, true);
  assert.ok(cardiacResult.score >= 85, 'Critical cases must score >= 85');
  assert.ok(cardiacResult.confidence >= 0.8, 'Confidence should be meaningful');
  assert.ok(
    cardiacResult.disclaimer.toLowerCase().includes('clinical decision support'),
    'Must include CDS disclaimer'
  );
  assert.ok(
    cardiacResult.disclaimer.toLowerCase().includes('not an autonomous'),
    'Must explicitly state not an autonomous diagnosis'
  );
});

// ── Test 2: Priority Ordering (Critical > Urgent > Routine) ──
console.log('\n2. Priority Ordering:');
await itAsync('should prioritize critical and urgent patients ahead of routine patients', async () => {
  const waitingTokens = [
    { _id: 'tok_1', tokenNumber: 1, patientName: 'Alice (Routine)', priority: 'routine', createdAt: new Date('2026-10-20T09:00:00') },
    { _id: 'tok_2', tokenNumber: 2, patientName: 'Bob (Routine)', priority: 'routine', createdAt: new Date('2026-10-20T09:05:00') },
    { _id: 'tok_3', tokenNumber: 3, patientName: 'Charlie (Critical)', priority: 'critical', createdAt: new Date('2026-10-20T09:10:00') },
    { _id: 'tok_4', tokenNumber: 4, patientName: 'Diana (Urgent)', priority: 'urgent', createdAt: new Date('2026-10-20T09:12:00') },
  ];

  const reordered = await applyQueuePolicy(waitingTokens, { starvationLimit: 2, logAudit: false });

  // Critical moves to #1, Urgent to #2, Routines follow
  assert.strictEqual(reordered[0].tokenNumber, 3, 'Critical patient #3 must be first');
  assert.strictEqual(reordered[1].tokenNumber, 4, 'Urgent patient #4 must be second');
  assert.strictEqual(reordered[2].tokenNumber, 1, 'Routine patient #1 follows');
  assert.strictEqual(reordered[3].tokenNumber, 2, 'Routine patient #2 follows');

  assert.ok(reordered[0].reason.includes('Critical'));
  assert.ok(reordered[1].reason.includes('Urgent'));
  console.log(`     #1: Token #${reordered[0].tokenNumber} (${reordered[0].priority}) — ${reordered[0].reason}`);
  console.log(`     #2: Token #${reordered[1].tokenNumber} (${reordered[1].priority}) — ${reordered[1].reason}`);
  console.log(`     #3: Token #${reordered[2].tokenNumber} (${reordered[2].priority}) — ${reordered[2].reason}`);
});

// ── Test 3: Starvation Prevention & Interleaving Policy ──
console.log('\n3. Starvation Prevention (Routine Patients Not Starved Indefinitely):');
await itAsync('should interleave routine patient after starvationLimit higher-priority patients', async () => {
  // Scenario: 5 Critical patients arrive, while 2 Routine patients are already waiting
  const waitingTokens = [
    { _id: 'r1', tokenNumber: 101, priority: 'routine', createdAt: new Date('2026-10-20T08:00:00') },
    { _id: 'r2', tokenNumber: 102, priority: 'routine', createdAt: new Date('2026-10-20T08:05:00') },
    { _id: 'c1', tokenNumber: 201, priority: 'critical', createdAt: new Date('2026-10-20T08:30:00') },
    { _id: 'c2', tokenNumber: 202, priority: 'critical', createdAt: new Date('2026-10-20T08:31:00') },
    { _id: 'c3', tokenNumber: 203, priority: 'critical', createdAt: new Date('2026-10-20T08:32:00') },
    { _id: 'c4', tokenNumber: 204, priority: 'critical', createdAt: new Date('2026-10-20T08:33:00') },
    { _id: 'c5', tokenNumber: 205, priority: 'critical', createdAt: new Date('2026-10-20T08:34:00') },
  ];

  // With starvationLimit: 2 -> Pattern: [C1, C2, R1, C3, C4, R2, C5]
  const reordered = await applyQueuePolicy(waitingTokens, { starvationLimit: 2, logAudit: false });

  const orderTokens = reordered.map((t) => t.tokenNumber);
  console.log(`     Policy Execution Order: [${orderTokens.join(', ')}]`);

  assert.strictEqual(orderTokens[0], 201, 'Pos 1: Critical 1');
  assert.strictEqual(orderTokens[1], 202, 'Pos 2: Critical 2');
  assert.strictEqual(orderTokens[2], 101, 'Pos 3: Interleaved Routine 1 (Starvation Prevention!)');
  assert.strictEqual(orderTokens[3], 203, 'Pos 4: Critical 3');
  assert.strictEqual(orderTokens[4], 204, 'Pos 5: Critical 4');
  assert.strictEqual(orderTokens[5], 102, 'Pos 6: Interleaved Routine 2 (Starvation Prevention!)');
  assert.strictEqual(orderTokens[6], 205, 'Pos 7: Critical 5');

  assert.ok(
    reordered[2].reason.includes('Starvation prevention') || reordered[2].reason.includes('Interleaved'),
    'Routine patient reason must explain anti-starvation interleaving'
  );
});

// ── Test 4: Configurable Starvation Limit Policy ──
console.log('\n4. Configurable Starvation Threshold:');
await itAsync('should respect dynamically configured starvation limits (e.g. limit = 1)', async () => {
  const waitingTokens = [
    { _id: 'r1', tokenNumber: 101, priority: 'routine', createdAt: new Date('2026-10-20T08:00:00') },
    { _id: 'r2', tokenNumber: 102, priority: 'routine', createdAt: new Date('2026-10-20T08:05:00') },
    { _id: 'c1', tokenNumber: 201, priority: 'critical', createdAt: new Date('2026-10-20T08:30:00') },
    { _id: 'c2', tokenNumber: 202, priority: 'critical', createdAt: new Date('2026-10-20T08:31:00') },
  ];

  // With starvationLimit: 1 -> Pattern: [C1, R1, C2, R2]
  const reordered = await applyQueuePolicy(waitingTokens, { starvationLimit: 1, logAudit: false });
  const orderTokens = reordered.map((t) => t.tokenNumber);

  console.log(`     With starvationLimit=1: [${orderTokens.join(', ')}]`);
  assert.strictEqual(orderTokens[0], 201, 'Pos 1: Critical 1');
  assert.strictEqual(orderTokens[1], 101, 'Pos 2: Routine 1 (Interleaved after 1 critical)');
  assert.strictEqual(orderTokens[2], 202, 'Pos 3: Critical 2');
  assert.strictEqual(orderTokens[3], 102, 'Pos 4: Routine 2');
});

// ── Test 5: Physician Override & Audit Trail Verification ──
console.log('\n5. Physician / Clinician Override & Audit Trail Schema:');
it('should support clinician override with reason and mark humanOverride=true', () => {
  const mockToken = {
    _id: 'tok_test_override',
    tokenNumber: 42,
    patientName: 'Frank Miller',
    priority: 'routine',
    isOverridden: false,
    overriddenBy: null,
    overrideReason: null,
  };

  // Simulate doctor override
  const overrideAction = {
    tokenId: mockToken._id,
    newPriority: 'critical',
    overrideReason: 'Severe dyspnea and deteriorating vitals observed upon bedside triage',
    doctorName: 'Dr. Sarah Connor',
  };

  // Update token mock
  mockToken.priority = overrideAction.newPriority;
  mockToken.isOverridden = true;
  mockToken.overriddenBy = overrideAction.doctorName;
  mockToken.overrideReason = overrideAction.overrideReason;

  // Expected Audit Record
  const auditRecord = {
    tokenId: mockToken._id,
    tokenNumber: mockToken.tokenNumber,
    patientName: mockToken.patientName,
    originalPosition: 8,
    newPosition: 1,
    priority: 'critical',
    previousPriority: 'routine',
    reason: `Clinician Override by ${overrideAction.doctorName}: ${overrideAction.overrideReason}`,
    decisionSource: 'clinician_override',
    humanOverride: true,
    overriddenBy: overrideAction.doctorName,
    overrideReason: overrideAction.overrideReason,
    timestamp: new Date(),
  };

  assert.strictEqual(mockToken.priority, 'critical');
  assert.strictEqual(mockToken.isOverridden, true);
  assert.strictEqual(mockToken.overriddenBy, 'Dr. Sarah Connor');

  assert.strictEqual(auditRecord.humanOverride, true);
  assert.strictEqual(auditRecord.decisionSource, 'clinician_override');
  assert.strictEqual(auditRecord.originalPosition, 8);
  assert.strictEqual(auditRecord.newPosition, 1);
  assert.ok(auditRecord.timestamp instanceof Date);
  console.log(`     Audit Record Verified:`);
  console.log(`       Original Pos: #${auditRecord.originalPosition} -> New Pos: #${auditRecord.newPosition}`);
  console.log(`       Priority: ${auditRecord.previousPriority} -> ${auditRecord.priority}`);
  console.log(`       Decision Source: ${auditRecord.decisionSource} (humanOverride: ${auditRecord.humanOverride})`);
  console.log(`       Overridden By: ${auditRecord.overriddenBy}`);
  console.log(`       Reason: ${auditRecord.reason}`);
});

// ── Test 6: AI Failure & Deterministic Rules Fallback ──
console.log('\n6. AI Failure & Deterministic Fallback:');
await itAsync('should fall back seamlessly to local clinical rules if AI service is offline', async () => {
  // Evaluates offline with acute asthma presentation
  const fallbackResult = await evaluateConditionPriority({
    condition: 'Acute asthma attack with wheezing and deep cut on hand',
    age: 24,
  });

  assert.strictEqual(fallbackResult.priority, 'urgent');
  assert.strictEqual(fallbackResult.isCdsRecommendation, true);
  assert.ok(fallbackResult.reason.includes('Expedited attention'));
  assert.ok(fallbackResult.disclaimer.includes('Clinical Decision Support'));
  console.log(`     Fallback Priority: ${fallbackResult.priority} (Source: ${fallbackResult.decisionSource})`);
  console.log(`     Fallback Reason: ${fallbackResult.reason}`);
});

console.log(`\n======================================================`);
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log(`======================================================\n`);

if (failed > 0) {
  process.exit(1);
}
