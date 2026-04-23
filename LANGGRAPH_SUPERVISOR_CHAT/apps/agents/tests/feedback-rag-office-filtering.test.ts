import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { saveCorrectionToRAG, getRelevantFeedback } from '../src/shared/feedback-rag';
import { initializeDatabase, closePool } from '../src/shared/db-setup';

describe('Per-Office RAG Filtering', () => {
  beforeAll(async () => {
    await initializeDatabase();
  });

  afterAll(async () => {
    await closePool();
  });

  it('should save correction with office_id and portal_type', async () => {
    const correction = {
      verification_id: 'TEST-001',
      mapper: 'patient_info_mapper',
      provider: 'Test Provider',
      field: 'patient_name',
      ai_value: 'John Doe',
      human_value: 'Jane Doe',
      office_id: 'OFFICE_TEST',
      portal_type: 'bcbs',
      human_reasoning: 'Test correction',
    };

    await expect(saveCorrectionToRAG(correction)).resolves.not.toThrow();
  });

  it('should filter corrections by office_id', async () => {
    // Save corrections for two different offices
    await saveCorrectionToRAG({
      verification_id: 'TEST-002',
      mapper: 'patient_info_mapper',
      provider: 'Test Provider',
      field: 'member_id',
      ai_value: '12345',
      human_value: '67890',
      office_id: 'OFFICE_A',
      portal_type: 'bcbs',
      human_reasoning: 'Office A correction',
    });

    await saveCorrectionToRAG({
      verification_id: 'TEST-003',
      mapper: 'patient_info_mapper',
      provider: 'Test Provider',
      field: 'member_id',
      ai_value: 'ABC123',
      human_value: 'XYZ789',
      office_id: 'OFFICE_B',
      portal_type: 'bcbs',
      human_reasoning: 'Office B correction',
    });

    // Query for Office A only
    const officeAResults = await getRelevantFeedback({
      mapper: 'patient_info_mapper',
      provider: 'Test Provider',
      field: 'member_id',
      officeId: 'OFFICE_A',
      limit: 10,
    });

    // Should only return Office A corrections
    expect(officeAResults.length).toBeGreaterThan(0);
    expect(officeAResults.every(r => r.office_id === 'OFFICE_A')).toBe(true);
  });

  it('should filter corrections by portal_type', async () => {
    const bcbsResults = await getRelevantFeedback({
      mapper: 'patient_info_mapper',
      provider: 'Test Provider',
      portalType: 'bcbs',
      limit: 10,
    });

    expect(bcbsResults.every(r => r.portal_type === 'bcbs')).toBe(true);
  });

  it('should combine office and portal filters', async () => {
    const results = await getRelevantFeedback({
      mapper: 'patient_info_mapper',
      provider: 'Test Provider',
      officeId: 'OFFICE_A',
      portalType: 'bcbs',
      limit: 10,
    });

    expect(results.every(r =>
      r.office_id === 'OFFICE_A' && r.portal_type === 'bcbs'
    )).toBe(true);
  });
});
